/**
 * 2026-08-16：從 scripts/backtest-custom-strategy.ts 抽出來的共用引擎（資料載入 + 進出場規則 +
 * 逐日模擬），讓 scripts/optimize-entry-exit-strategy.ts 的參數網格搜尋可以重用同一套「跟
 * production計分邏輯一致」的模擬邏輯，不用另外維護一份。詳細規則說明/資料缺口見原本
 * backtest-custom-strategy.ts 檔頭註解，這裡不重複。
 */
import { prisma } from "../../src/lib/prisma";
import { sma, stochasticKD } from "../../src/lib/trend/indicators";
import { calculateChipConcentration } from "../../src/lib/trend/tw/chipConcentration";
import type { InstitutionalDay } from "../../src/lib/trend/tw/chipScore";
import type { OhlcvBar } from "../../src/lib/trend/types";

export const MIN_BARS_REQUIRED = 210;
export const MAX_HOLDING_DAYS = 120;
export const KD_OVERBOUGHT = 80;
export const KD_RISING_LOOKBACK = 2;
export const KD_CROSS_LOOKBACK = 3;
/** 月營收公布落後期估計：revenueMonth(當月1號) + 40天 ≈ 次月10號左右，避免look-ahead */
const REVENUE_DISCLOSURE_LAG_DAYS = 40;

export interface RevenueRow {
  revenueMonth: string;
  yoyGrowthPct: number | null;
  knownDate: string;
}

export async function loadPriceBars(stockId: number): Promise<OhlcvBar[]> {
  const rows = await prisma.twDailyPrice.findMany({ where: { stockId }, orderBy: { tradeDate: "asc" } });
  return rows.map((r) => ({
    date: r.tradeDate.toISOString().slice(0, 10),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
  }));
}

export async function loadInstitutionalDays(stockId: number): Promise<InstitutionalDay[]> {
  const rows = await prisma.twInstitutionalTrading.findMany({ where: { stockId }, orderBy: { tradeDate: "asc" } });
  return rows.map((r) => ({
    date: r.tradeDate.toISOString().slice(0, 10),
    foreignNetBuyShares: Number(r.foreignNetBuyShares),
    investTrustNetBuyShares: Number(r.investTrustNetBuyShares),
    dealerNetBuyShares: Number(r.dealerNetBuyShares),
    totalVolumeShares: Number(r.totalVolumeShares),
  }));
}

export async function loadRevenueRows(stockId: number): Promise<RevenueRow[]> {
  const rows = await prisma.twMonthlyRevenue.findMany({ where: { stockId }, orderBy: { revenueMonth: "asc" } });
  return rows.map((r) => {
    const known = new Date(r.revenueMonth);
    known.setDate(known.getDate() + REVENUE_DISCLOSURE_LAG_DAYS);
    return {
      revenueMonth: r.revenueMonth.toISOString().slice(0, 10),
      yoyGrowthPct: r.yoyGrowthPct !== null ? Number(r.yoyGrowthPct) : null,
      knownDate: known.toISOString().slice(0, 10),
    };
  });
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** 近windowDays平均每日買超張數(外資+投信)，不是佔量能比例（那是concentration在做的事） */
function avgNetBuy(days: InstitutionalDay[], windowDays: number): number | null {
  const window = days.slice(-windowDays);
  if (window.length < windowDays) return null;
  return sum(window.map((d) => d.foreignNetBuyShares + d.investTrustNetBuyShares)) / window.length;
}

/** 近~3個月(63個交易日)累計買超(外資+投信) > 0 */
function netBuyPositiveTrailingMonths(days: InstitutionalDay[], tradingDaysPerMonth = 21, months = 3): boolean {
  const window = days.slice(-tradingDaysPerMonth * months);
  if (window.length < tradingDaysPerMonth * months) return false;
  return sum(window.map((d) => d.foreignNetBuyShares + d.investTrustNetBuyShares)) > 0;
}

/** 買超力道加速：近5日均買超 > 近10日均買超 > 近20日均買超 */
function netBuyAccelerating(days: InstitutionalDay[]): boolean {
  const a5 = avgNetBuy(days, 5);
  const a10 = avgNetBuy(days, 10);
  const a20 = avgNetBuy(days, 20);
  return a5 !== null && a10 !== null && a20 !== null && a5 > a10 && a10 > a20;
}

/** 賣超力道加速：近2日均買超(負值代表賣超) < 近5日 < 近10日，且近2日確實是淨賣超 */
function netSellAccelerating(days: InstitutionalDay[]): boolean {
  const a2 = avgNetBuy(days, 2);
  const a5 = avgNetBuy(days, 5);
  const a10 = avgNetBuy(days, 10);
  return a2 !== null && a5 !== null && a10 !== null && a2 < 0 && a2 < a5 && a5 < a10;
}

/** as-of targetDate能看到的營收列（揭露落後期已經過了），依revenueMonth新到舊排序 */
function revenueRowsAsOf(rows: RevenueRow[], targetDate: string): RevenueRow[] {
  return rows.filter((r) => r.knownDate <= targetDate).slice().reverse();
}

function revenueStreak(rows: RevenueRow[], targetDate: string, months: number, direction: "growth" | "decline"): boolean {
  const asOf = revenueRowsAsOf(rows, targetDate).slice(0, months);
  if (asOf.length < months) return false;
  return asOf.every((r) => (direction === "growth" ? (r.yoyGrowthPct ?? 0) > 0 : (r.yoyGrowthPct ?? 0) < 0));
}

export interface StrategyOptions {
  /** false時完全跳過所有營收相關條件（進場#6/出場#3/逢低買進#2），讓其餘條件可以跑滿全歷史 */
  requireRevenue: boolean;
  revenueStreakMonths: number;
  /** "single_day_dip"：K單日下跌即算走弱（原始字面解讀）。"cross_below_d"：K由上往下穿越D才算走弱（較不敏感的替代解讀，用來測試原始解讀是不是雜訊太多） */
  kWeakeningMode: "single_day_dip" | "cross_below_d";
  // --- 主要進場訊號的逐條件開關（ablation用，找出哪條件在拖累超額報酬） ---
  requireInstitutional3moPositive: boolean;
  requireBuyAccelerating: boolean;
  requireConcentrationMomentum: boolean;
  requireKdRising: boolean;
  // --- 逢低買進參數 ---
  buyDipBandPct: number;
  buyDipConcentrationThreshold: number;
  /**
   * 2026-07-23：backtest-exit-signals.ts把K轉弱當獨立訊號評估過，不管哪種定義，未來5/10/20日
   * 中位超額報酬都只有-0.2%~-0.9%，是六個出場條件裡預測力最弱的（投信外資賣超加速最強，
   * -1.6%~-2.1%；MA死叉中等，-0.5%~-1.4%），且在完整策略模擬裡K轉弱一直搶先觸發、把平均
   * 持有天數壓到只剩2-3天。設false時完全跳過K轉弱這條出場條件，測試拿掉雜訊後表現會不會提升。
   */
  includeKWeakeningExit: boolean;
}

export const BASE_OPTS: StrategyOptions = {
  requireRevenue: false,
  revenueStreakMonths: 2,
  kWeakeningMode: "cross_below_d",
  requireInstitutional3moPositive: true,
  requireBuyAccelerating: true,
  requireConcentrationMomentum: true,
  requireKdRising: true,
  buyDipBandPct: 2,
  buyDipConcentrationThreshold: 10,
  includeKWeakeningExit: true,
};

/** 2026-07-23回測驗證過表現最好的逢低買進參數組合（季線容忍帶1.5% + 集中度門檻15%） */
export const BEST_BUYDIP_OPTS: StrategyOptions = { ...BASE_OPTS, buyDipBandPct: 1.5, buyDipConcentrationThreshold: 15 };

function checkMainEntry(
  idx: number,
  bars: OhlcvBar[],
  ma5: (number | null)[],
  ma10: (number | null)[],
  ma20: (number | null)[],
  k: (number | null)[],
  d: (number | null)[],
  institutionalDaysUpToDate: InstitutionalDay[],
  revenueRows: RevenueRow[],
  opts: StrategyOptions
): boolean {
  const m5 = ma5[idx];
  const m10 = ma10[idx];
  const m20 = ma20[idx];
  if (m5 === null || m10 === null || m20 === null) return false;
  if (!(m5 > m10 && m10 > m20)) return false;

  if (opts.requireInstitutional3moPositive && !netBuyPositiveTrailingMonths(institutionalDaysUpToDate)) return false;
  if (opts.requireBuyAccelerating && !netBuyAccelerating(institutionalDaysUpToDate)) return false;
  if (
    opts.requireConcentrationMomentum &&
    calculateChipConcentration(institutionalDaysUpToDate).momentum !== "strengthening"
  ) {
    return false;
  }

  const curK = k[idx];
  const curD = d[idx];
  if (curK === null || curD === null || curK >= KD_OVERBOUGHT || curD >= KD_OVERBOUGHT) return false;
  // K持續走強：近KD_RISING_LOOKBACK天K都在上升
  if (opts.requireKdRising) {
    for (let i = idx; i > idx - KD_RISING_LOOKBACK; i--) {
      if (k[i] === null || k[i - 1] === null || (k[i] as number) <= (k[i - 1] as number)) return false;
    }
  }
  // 黃金交叉：近KD_CROSS_LOOKBACK天內K由下往上穿越D
  let crossedUp = false;
  for (let i = idx; i > idx - KD_CROSS_LOOKBACK && i > 0; i--) {
    const ck = k[i];
    const cd = d[i];
    const pk = k[i - 1];
    const pd = d[i - 1];
    if (ck === null || cd === null || pk === null || pd === null) continue;
    if (pk <= pd && ck > cd) {
      crossedUp = true;
      break;
    }
  }
  if (!crossedUp) return false;

  if (opts.requireRevenue && !revenueStreak(revenueRows, bars[idx].date, opts.revenueStreakMonths, "growth")) {
    return false;
  }

  return true;
}

function checkBuyDipEntry(
  idx: number,
  bars: OhlcvBar[],
  ma60: (number | null)[],
  institutionalDaysUpToDate: InstitutionalDay[],
  revenueRows: RevenueRow[],
  opts: StrategyOptions
): boolean {
  const m60 = ma60[idx];
  if (m60 === null) return false;
  const close = bars[idx].close;
  if (Math.abs((close - m60) / m60) * 100 > opts.buyDipBandPct) return false;

  if (calculateChipConcentration(institutionalDaysUpToDate).concentration5 < opts.buyDipConcentrationThreshold) {
    return false;
  }

  if (opts.requireRevenue && !revenueStreak(revenueRows, bars[idx].date, opts.revenueStreakMonths, "growth")) {
    return false;
  }

  return true;
}

function checkExit(
  idx: number,
  bars: OhlcvBar[],
  ma5: (number | null)[],
  ma10: (number | null)[],
  k: (number | null)[],
  d: (number | null)[],
  institutionalDaysUpToDate: InstitutionalDay[],
  revenueRows: RevenueRow[],
  opts: StrategyOptions
): string | null {
  const close = bars[idx].close;
  const m5 = ma5[idx];
  const m10 = ma10[idx];

  if (idx >= 3) {
    const ret3d = ((close - bars[idx - 3].close) / bars[idx - 3].close) * 100;
    if (ret3d > 15 && m5 !== null && close < m5) return "tight_stop_ma5_after_15pct_3d";
    if (ret3d > 10 && m10 !== null && close < m10) return "stop_ma10_after_10pct_3d";
  }

  if (opts.requireRevenue && revenueStreak(revenueRows, bars[idx].date, opts.revenueStreakMonths, "decline")) {
    return "revenue_decline_streak";
  }

  if (m5 !== null && m10 !== null && m10 > m5) return "ma_cross_down";

  if (opts.includeKWeakeningExit) {
    if (opts.kWeakeningMode === "single_day_dip") {
      if (k[idx] !== null && k[idx - 1] !== null && (k[idx] as number) < (k[idx - 1] as number)) return "k_weakening";
    } else {
      const ck = k[idx];
      const cd = d[idx];
      const pk = k[idx - 1];
      const pd = d[idx - 1];
      if (ck !== null && cd !== null && pk !== null && pd !== null && pk >= pd && ck < cd) return "k_weakening";
    }
  }

  if (netSellAccelerating(institutionalDaysUpToDate)) return "institutional_selling_accelerating";

  return null;
}

export interface Trade {
  ticker: string;
  entryTrigger: "main" | "buyDip";
  entryDate: string;
  exitDate: string;
  exitReason: string;
  holdingDays: number;
  returnPct: number;
  marketReturnPct: number | null;
}

export function runStrategy(
  ticker: string,
  bars: OhlcvBar[],
  institutionalDays: InstitutionalDay[],
  revenueRows: RevenueRow[],
  benchmarkBars: OhlcvBar[],
  benchmarkDateIndex: Map<string, number>,
  opts: StrategyOptions
): Trade[] {
  const closes = bars.map((b) => b.close);
  const ma5 = sma(closes, 5);
  const ma10 = sma(closes, 10);
  const ma20 = sma(closes, 20);
  const ma60 = sma(closes, 60);
  const { k, d } = stochasticKD(bars);

  const trades: Trade[] = [];
  let cursor = MIN_BARS_REQUIRED - 1;

  while (cursor < bars.length) {
    const targetDate = bars[cursor].date;
    const institutionalDaysUpToTarget = institutionalDays.filter((day) => day.date <= targetDate);

    const isMain = checkMainEntry(cursor, bars, ma5, ma10, ma20, k, d, institutionalDaysUpToTarget, revenueRows, opts);
    const isBuyDip =
      !isMain && checkBuyDipEntry(cursor, bars, ma60, institutionalDaysUpToTarget, revenueRows, opts);

    if (!isMain && !isBuyDip) {
      cursor++;
      continue;
    }

    const entryIdx = cursor;
    const entryClose = bars[entryIdx].close;
    let exitIdx = -1;
    let exitReason = "time_cap_or_data_end";

    const maxExitIdx = Math.min(bars.length - 1, entryIdx + MAX_HOLDING_DAYS);
    for (let i = entryIdx + 1; i <= maxExitIdx; i++) {
      const dateAtI = bars[i].date;
      const instUpToI = institutionalDays.filter((day) => day.date <= dateAtI);
      const reason = checkExit(i, bars, ma5, ma10, k, d, instUpToI, revenueRows, opts);
      if (reason !== null) {
        exitIdx = i;
        exitReason = reason;
        break;
      }
    }
    if (exitIdx === -1) exitIdx = maxExitIdx;

    const exitClose = bars[exitIdx].close;
    const returnPct = ((exitClose - entryClose) / entryClose) * 100;

    const entryBenchIdx = benchmarkDateIndex.get(bars[entryIdx].date);
    const exitBenchIdx = benchmarkDateIndex.get(bars[exitIdx].date);
    const marketReturnPct =
      entryBenchIdx !== undefined && exitBenchIdx !== undefined
        ? ((benchmarkBars[exitBenchIdx].close - benchmarkBars[entryBenchIdx].close) / benchmarkBars[entryBenchIdx].close) * 100
        : null;

    trades.push({
      ticker,
      entryTrigger: isMain ? "main" : "buyDip",
      entryDate: bars[entryIdx].date,
      exitDate: bars[exitIdx].date,
      exitReason,
      holdingDays: exitIdx - entryIdx,
      returnPct,
      marketReturnPct,
    });

    cursor = exitIdx + 1;
  }

  return trades;
}
