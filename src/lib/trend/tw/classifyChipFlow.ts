import type { OhlcvBar } from "@/lib/trend/types";
import { sma, stochasticKD } from "@/lib/trend/indicators";
import { calculateChipConcentration } from "./chipConcentration";
import type { InstitutionalDay } from "./chipScore";

/**
 * 2026-07-23：取代台股原本共用 classify.ts 的 reversal/pullback/bullish 三段式，改用使用者
 * 提供的籌碼流策略（進場/出場/逢低布局），已用 scripts/backtest-custom-strategy.ts 和
 * scripts/backtest-exit-signals.ts 對 production 真實投信/外資資料驗證過。
 *
 * ⚠️這裡的參數是backtest驗證過的最終版本，不是使用者最原始的規格逐字翻譯：
 * - 拿掉了「獲利連續成長」相關條件（entry #6/exit #3/buyDip #2）：月營收資料目前只有
 *   2個月快照，這個條件數學上幾乎不可能為真，留著只會讓entry/buyDip永遠不觸發。
 * - exit拿掉了「K開始走弱」：backtest-exit-signals.ts驗證這是六個候選出場條件裡預測力
 *   最弱的（20日中位超額報酬僅-0.2%~-0.9%，其餘條件都在-0.5%~-2.1%之間），且在完整策略
 *   模擬裡一直搶先觸發，把平均持有天數壓到只剩2-3天。拿掉後兩套進場規則的超額報酬都變好。
 * - buyDip用backtest驗證過的最佳參數（季線容忍帶1.5%、集中度門檻15%，不是原始的2%/10%）。
 *
 * ⚠️entry這組條件的超額報酬backtest顯示接近打平（20日中位數約-0.04%，n=56），不是有明確
 * alpha的訊號——這是使用者定義的進場條件，忠實實作，但UI上要如實揭露這個backtest結果，
 * 不能包裝成「驗證有效」。buyDip才是backtest顯示有真實、穩健alpha的訊號（20日中位數約
 * +2.1%~+2.3%，勝率70%+）。
 */

const KD_OVERBOUGHT = 80;
const KD_RISING_LOOKBACK = 2;
const KD_CROSS_LOOKBACK = 3;
const BUY_DIP_BAND_PCT = 1.5;
const BUY_DIP_CONCENTRATION_THRESHOLD = 15;
/** 找「這個訊號連續成立幾天」的錨點時，最多往回找幾天（避免極端情況掃全部歷史） */
const MAX_STREAK_LOOKBACK_DAYS = 90;

export interface ChipFlowIndicators {
  ma5: (number | null)[];
  ma10: (number | null)[];
  ma20: (number | null)[];
  ma60: (number | null)[];
  k: (number | null)[];
  d: (number | null)[];
}

export function computeChipFlowIndicators(bars: OhlcvBar[]): ChipFlowIndicators {
  const closes = bars.map((b) => b.close);
  const { k, d } = stochasticKD(bars);
  return {
    ma5: sma(closes, 5),
    ma10: sma(closes, 10),
    ma20: sma(closes, 20),
    ma60: sma(closes, 60),
    k,
    d,
  };
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

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

function isEntry(
  idx: number,
  ind: ChipFlowIndicators,
  institutionalDaysUpToDate: InstitutionalDay[]
): boolean {
  const m5 = ind.ma5[idx];
  const m10 = ind.ma10[idx];
  const m20 = ind.ma20[idx];
  if (m5 === null || m10 === null || m20 === null) return false;
  if (!(m5 > m10 && m10 > m20)) return false;

  if (!netBuyPositiveTrailingMonths(institutionalDaysUpToDate)) return false;
  if (!netBuyAccelerating(institutionalDaysUpToDate)) return false;
  if (calculateChipConcentration(institutionalDaysUpToDate).momentum !== "strengthening") return false;

  const curK = ind.k[idx];
  const curD = ind.d[idx];
  if (curK === null || curD === null || curK >= KD_OVERBOUGHT || curD >= KD_OVERBOUGHT) return false;

  for (let i = idx; i > idx - KD_RISING_LOOKBACK; i--) {
    if (ind.k[i] === null || ind.k[i - 1] === null || (ind.k[i] as number) <= (ind.k[i - 1] as number)) return false;
  }

  let crossedUp = false;
  for (let i = idx; i > idx - KD_CROSS_LOOKBACK && i > 0; i--) {
    const ck = ind.k[i];
    const cd = ind.d[i];
    const pk = ind.k[i - 1];
    const pd = ind.d[i - 1];
    if (ck === null || cd === null || pk === null || pd === null) continue;
    if (pk <= pd && ck > cd) {
      crossedUp = true;
      break;
    }
  }
  return crossedUp;
}

function isBuyDip(idx: number, bars: OhlcvBar[], ind: ChipFlowIndicators, institutionalDaysUpToDate: InstitutionalDay[]): boolean {
  const m60 = ind.ma60[idx];
  if (m60 === null) return false;
  const close = bars[idx].close;
  if (Math.abs((close - m60) / m60) * 100 > BUY_DIP_BAND_PCT) return false;
  return calculateChipConcentration(institutionalDaysUpToDate).concentration5 >= BUY_DIP_CONCENTRATION_THRESHOLD;
}

function isExit(idx: number, bars: OhlcvBar[], ind: ChipFlowIndicators, institutionalDaysUpToDate: InstitutionalDay[]): boolean {
  const close = bars[idx].close;
  const m5 = ind.ma5[idx];
  const m10 = ind.ma10[idx];

  if (idx >= 3) {
    const ret3d = ((close - bars[idx - 3].close) / bars[idx - 3].close) * 100;
    if (ret3d > 15 && m5 !== null && close < m5) return true;
    if (ret3d > 10 && m10 !== null && close < m10) return true;
  }

  if (m5 !== null && m10 !== null && m10 > m5) return true;

  return netSellAccelerating(institutionalDaysUpToDate);
}

export interface ChipFlowClassificationResult {
  status: "entry" | "exit" | "buyDip" | "none";
  /** 這個狀態連續成立的第一天（不是MA交叉錨點，是條件streak的起點），配合priceAtSignal算「訊號後漲跌幅」 */
  signalPointDate: string | null;
  priceAtSignal: number | null;
}

/** 往回找同一個condition連續成立的最早一天，當作「訊號從哪天開始」的錨點 */
function findStreakStart(
  targetIndex: number,
  condition: (idx: number) => boolean,
  maxLookback = MAX_STREAK_LOOKBACK_DAYS
): number {
  let start = targetIndex;
  const floor = Math.max(0, targetIndex - maxLookback);
  for (let i = targetIndex - 1; i >= floor; i--) {
    if (!condition(i)) break;
    start = i;
  }
  return start;
}

/**
 * 台股籌碼流三段式分類：進場 > 逢低布局 > 出場 > none（跟classify.ts一樣先符合先算，
 * 不會同一天被歸進兩類）。判斷順序的理由見下方函式內註解——出場的其中一個條件（MA5跌破
 * MA10）幾乎是「回檔」的必然特徵，優先權設太高會系統性蓋掉buyDip（唯一驗證有效的訊號）。
 */
export function classifyChipFlow(
  bars: OhlcvBar[],
  indicators: ChipFlowIndicators,
  targetIndex: number,
  institutionalDays: InstitutionalDay[],
  isLimitMove: boolean
): ChipFlowClassificationResult {
  if (isLimitMove) {
    return { status: "none", signalPointDate: null, priceAtSignal: null };
  }

  const institutionalDaysUpToDate = institutionalDays.filter((d) => d.date <= bars[targetIndex].date);
  const institutionalDaysUpToIndex = (idx: number) => institutionalDays.filter((d) => d.date <= bars[idx].date);

  // 判斷順序：entry > buyDip > exit。⚠️2026-07-23實測發現：exit的其中一個條件（MA5跌破MA10）
  // 幾乎是「回檔到季線」這件事本身的必然特徵——一檔股票正在拉回buyDip時，短均線在均線之下
  // 是常態不是例外。原本用exit優先判斷，會讓exit的MA死叉條件系統性地把buyDip整個蓋掉
  // （production資料實測：2檔同時符合buyDip全部條件的股票，因為exit優先，兩檔都被分類成
  // exit，buyDip永遠不會出現）。buyDip是這套策略裡唯一backtest驗證過有真實alpha的訊號，
  // 不能被結構性地蓋掉，所以改成entry/buyDip兩種「機會訊號」優先於exit這種「風險訊號」，
  // 只有兩者都不符合時才會顯示exit。entry跟buyDip的定義互斥度高（entry要求MA5>10>20多頭
  // 排列，buyDip要求價格貼近季線，正常情況下不會同時成立），兩者誰先判斷影響很小。
  if (isEntry(targetIndex, indicators, institutionalDaysUpToDate)) {
    const anchorIdx = findStreakStart(targetIndex, (i) => isEntry(i, indicators, institutionalDaysUpToIndex(i)));
    return { status: "entry", signalPointDate: bars[anchorIdx].date, priceAtSignal: bars[anchorIdx].close };
  }

  if (isBuyDip(targetIndex, bars, indicators, institutionalDaysUpToDate)) {
    const anchorIdx = findStreakStart(targetIndex, (i) => isBuyDip(i, bars, indicators, institutionalDaysUpToIndex(i)));
    return { status: "buyDip", signalPointDate: bars[anchorIdx].date, priceAtSignal: bars[anchorIdx].close };
  }

  if (isExit(targetIndex, bars, indicators, institutionalDaysUpToDate)) {
    const anchorIdx = findStreakStart(targetIndex, (i) => isExit(i, bars, indicators, institutionalDaysUpToIndex(i)));
    return { status: "exit", signalPointDate: bars[anchorIdx].date, priceAtSignal: bars[anchorIdx].close };
  }

  return { status: "none", signalPointDate: null, priceAtSignal: null };
}
