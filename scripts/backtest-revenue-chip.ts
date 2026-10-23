/**
 * 2026-10-14：營收動能 × 籌碼訊號回測——驗證「進場訊號出現時，營收正在加速/創新高」是不是真的
 * 讓訊號更準，再決定要不要在選股表上加營收標記、或當成過濾條件。
 *
 * Part A：平台進場訊號（投信轉買/合買/逢低布局/底部型態，新出現那天）依訊號當天「已公布」的營收
 *         狀態分組（見revenueMomentum.ts，月營收次月11日才算已知），比較之後的報酬。
 * Part B：不看籌碼，只看營收公布本身——每檔每月營收公布後第一個交易日進場，依營收狀態分組，
 *         看營收狀態單獨有沒有預測力（Part A的對照組）。
 *
 * 進場一律用訊號隔天開盤價；報酬算到第20/40個交易日收盤，另外用績效驗證頁的出場規則
 * （TRACK_RECORD_EXIT_RULE）模擬一次；超額報酬＝扣掉同期加權指數。依進場日期切train/test。
 *
 * 用法：npx tsx scripts/backtest-revenue-chip.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  buildSignalDays,
  loadInstitutionalDays,
  loadPriceBars,
  loadRevenueMonths,
  SIGNAL_WARMUP_DAYS,
} from "../src/lib/trend/tw/historicalSignals";
import { computeRevenueMomentum, momentumAsOf, type RevenueMomentum } from "../src/lib/trend/tw/revenueMomentum";
import { entrySignalOf, evaluatePosition } from "../src/lib/trend/tw/trackRecordSim";
import { TRACK_RECORD_EXIT_RULE } from "../src/lib/trend/tw/trackRecordMeta";
import type { OhlcvBar } from "../src/lib/trend/types";

const ROUND_TRIP_COST_PCT = 0.585;
const HORIZONS = [20, 40] as const;

type RevenueState = "accelerating" | "allTimeHigh" | "sameMonthHigh" | "decelerating" | "neutral" | "noData";

const STATE_LABEL: Record<RevenueState, string> = {
  accelerating: "營收加速",
  allTimeHigh: "營收歷史新高",
  sameMonthHigh: "營收同期新高",
  decelerating: "營收減速",
  neutral: "營收持平（以上皆非）",
  noData: "沒有營收資料",
};

interface Event {
  date: string;
  entrySignal: string;
  states: Set<RevenueState>;
  /** 第N個交易日收盤的報酬%（已扣交易成本），資料不夠長是null */
  ret: Record<number, number | null>;
  excess: Record<number, number | null>;
  /** 用績效驗證出場規則模擬的報酬%，到資料結尾還沒出場是null */
  ruleRet: number | null;
}

function statesOf(m: RevenueMomentum | null): Set<RevenueState> {
  if (!m) return new Set(["noData"]);
  const s = new Set<RevenueState>();
  if (m.accelerating) s.add("accelerating");
  if (m.allTimeHigh) s.add("allTimeHigh");
  if (m.sameMonthHigh) s.add("sameMonthHigh");
  if (m.decelerating) s.add("decelerating");
  if (s.size === 0) s.add("neutral");
  return s;
}

function makeEvent(
  bars: OhlcvBar[],
  signalIndex: number,
  entrySignal: string,
  states: Set<RevenueState>,
  taiexByDate: Map<string, OhlcvBar>,
  targetPrice: number | null
): Event | null {
  const entryIndex = signalIndex + 1;
  if (entryIndex >= bars.length) return null;
  const entry = bars[entryIndex];
  const taiexIn = taiexByDate.get(entry.date);

  const ret: Record<number, number | null> = {};
  const excess: Record<number, number | null> = {};
  for (const h of HORIZONS) {
    const exitBar = bars[entryIndex + h - 1];
    if (!exitBar) {
      ret[h] = null;
      excess[h] = null;
      continue;
    }
    ret[h] = ((exitBar.close - entry.open) / entry.open) * 100 - ROUND_TRIP_COST_PCT;
    const taiexOut = taiexByDate.get(exitBar.date);
    excess[h] = taiexIn && taiexOut ? ret[h]! - ((taiexOut.close - taiexIn.open) / taiexIn.open) * 100 : null;
  }

  const evaluation = evaluatePosition(bars, entry.date, entry.open, TRACK_RECORD_EXIT_RULE, targetPrice, null);
  const ruleRet = evaluation.exit?.price != null ? ((evaluation.exit.price - entry.open) / entry.open) * 100 - ROUND_TRIP_COST_PCT : null;

  return { date: signalIndex >= 0 ? bars[signalIndex].date : entry.date, entrySignal, states, ret, excess, ruleRet };
}

interface Stats {
  n: number;
  avg: number;
  median: number;
  win: number;
  excess: number;
}

function stats(values: number[], excessValues: number[]): Stats {
  const v = [...values].sort((a, b) => a - b);
  const n = v.length;
  if (n === 0) return { n: 0, avg: NaN, median: NaN, win: NaN, excess: NaN };
  return {
    n,
    avg: v.reduce((a, b) => a + b, 0) / n,
    median: v[Math.floor(n / 2)],
    win: (v.filter((x) => x > 0).length / n) * 100,
    excess: excessValues.length ? excessValues.reduce((a, b) => a + b, 0) / excessValues.length : NaN,
  };
}

function fmt(s: Stats): string {
  if (s.n === 0) return "N=    0";
  return `N=${String(s.n).padStart(5)} 平均${s.avg.toFixed(2).padStart(6)}% 中位數${s.median.toFixed(2).padStart(6)}% 正報酬${s.win.toFixed(0).padStart(3)}% 超額${s.excess.toFixed(2).padStart(6)}%`;
}

function horizonStats(events: Event[], h: number): Stats {
  const withRet = events.filter((e) => e.ret[h] !== null);
  return stats(
    withRet.map((e) => e.ret[h]!),
    withRet.filter((e) => e.excess[h] !== null).map((e) => e.excess[h]!)
  );
}

function ruleStats(events: Event[]): Stats {
  const withRet = events.filter((e) => e.ruleRet !== null);
  return stats(withRet.map((e) => e.ruleRet!), []);
}

function report(title: string, events: Event[], splitDate: string) {
  console.log(`\n========== ${title} ==========`);
  const groups: (RevenueState | "all")[] = ["all", "accelerating", "allTimeHigh", "sameMonthHigh", "neutral", "decelerating", "noData"];
  for (const g of groups) {
    const sub = g === "all" ? events : events.filter((e) => e.states.has(g));
    console.log(`\n【${g === "all" ? "全部" : STATE_LABEL[g]}】`);
    for (const h of HORIZONS) {
      console.log(`  ${String(h).padStart(2)}日 全期 ${fmt(horizonStats(sub, h))}`);
      console.log(`       train ${fmt(horizonStats(sub.filter((e) => e.date < splitDate), h))}`);
      console.log(`       test  ${fmt(horizonStats(sub.filter((e) => e.date >= splitDate), h))}`);
    }
    if (title.startsWith("Part A")) console.log(`  出場規則 ${fmt(ruleStats(sub))}`);
  }
}

async function main() {
  const taiex = await prisma.stock.findUnique({ where: { market_ticker: { market: "TW", ticker: "TAIEX" } } });
  const taiexBars = taiex ? await loadPriceBars(taiex.id) : [];
  const taiexByDate = new Map(taiexBars.map((b) => [b.date, b]));

  const stocks = await prisma.stock.findMany({
    where: { market: "TW", isActive: true, ticker: { not: "TAIEX" }, NOT: { industry: { contains: "ETF" } } },
    select: { id: true, ticker: true },
  });

  const chipEvents: Event[] = [];
  const revenueEvents: Event[] = [];
  let processed = 0;

  for (const stock of stocks) {
    const revenue = await loadRevenueMonths(stock.id);
    if (revenue.length < 24) continue;
    const bars = await loadPriceBars(stock.id);
    if (bars.length < SIGNAL_WARMUP_DAYS + 60) continue;
    const institutional = await loadInstitutionalDays(stock.id);
    if (institutional.length === 0) continue;

    const momentum = computeRevenueMomentum(revenue);
    const days = buildSignalDays(bars, institutional);

    // Part A：進場訊號新出現那天
    let prev: string | null = null;
    for (let i = SIGNAL_WARMUP_DAYS; i < bars.length; i++) {
      const day = days.get(bars[i].date);
      const sig = entrySignalOf(day);
      if (sig && sig !== prev) {
        const e = makeEvent(bars, i, sig, statesOf(momentumAsOf(momentum, bars[i].date)), taiexByDate, sig === "bottomPattern" ? day!.bottomPatternTargetPrice : null);
        if (e) chipEvents.push(e);
      }
      prev = sig;
    }

    // Part B：每月營收公布後第一個交易日（只看有價格的期間）
    for (const m of momentum) {
      const idx = bars.findIndex((b) => b.date >= m.availableFrom);
      if (idx <= 0) continue;
      const e = makeEvent(bars, idx - 1, "revenueRelease", statesOf(m), taiexByDate, null);
      if (e) revenueEvents.push({ ...e, date: bars[idx].date });
    }

    processed++;
    if (processed % 25 === 0) console.error(`...${processed} 檔`);
  }

  const dates = chipEvents.map((e) => e.date).sort();
  const splitDate = dates[Math.floor(dates.length / 2)];
  console.log(`處理 ${processed} 檔股票；進場訊號事件 ${chipEvents.length} 筆、營收公布事件 ${revenueEvents.length} 筆`);
  console.log(`報酬已扣來回交易成本 ${ROUND_TRIP_COST_PCT}%；train/test 分界 ${splitDate}`);

  report("Part A：進場訊號 × 營收狀態", chipEvents, splitDate);
  report("Part B：只看營收公布（對照組，不看籌碼）", revenueEvents, splitDate);

  console.log("\n========== Part A 依進場訊號細分（40日） ==========");
  for (const sig of ["trustTurnBuy", "combinedBuy", "buyDip", "bottomPattern"]) {
    const sub = chipEvents.filter((e) => e.entrySignal === sig);
    console.log(`\n${sig}`);
    console.log(`  全部       ${fmt(horizonStats(sub, 40))}`);
    console.log(`  營收加速   ${fmt(horizonStats(sub.filter((e) => e.states.has("accelerating")), 40))}`);
    console.log(`  非加速     ${fmt(horizonStats(sub.filter((e) => !e.states.has("accelerating") && !e.states.has("noData")), 40))}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
