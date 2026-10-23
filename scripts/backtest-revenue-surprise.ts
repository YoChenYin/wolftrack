/**
 * 2026-10-14：「營收公布後市場沒反應」回測——營收比預期好很多（surprisePct，見revenueMomentum.ts），
 * 但公布期間股價沒有明顯反應的股票，之後會不會補漲？決定要不要做「營收驚喜雷達」頁面。
 *
 * 時間軸（不偷看未來）：
 * - 反應期：營收所屬月份的次月第一個交易日開盤 → 公布期限後第一個交易日（次月11日起）收盤。
 *   台股月營收規定次月10日前公布，但實際公布日不一定（資料庫沒有逐檔的公布日），所以用整個
 *   公布窗口當反應期，一定涵蓋到公布那天。反應＝這段期間股價扣掉同期加權指數的超額報酬。
 * - 進場：反應期結束隔天開盤；報酬算到之後第20/40個交易日收盤，扣交易成本、跟大盤比。
 * 依進場日期切train/test。
 *
 * 用法：npx tsx scripts/backtest-revenue-surprise.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { loadPriceBars, loadRevenueMonths } from "../src/lib/trend/tw/historicalSignals";
import { computeRevenueMomentum } from "../src/lib/trend/tw/revenueMomentum";
import type { OhlcvBar } from "../src/lib/trend/types";

const ROUND_TRIP_COST_PCT = 0.585;
const HORIZONS = [20, 40] as const;
/** 驚喜分組門檻（%） */
const BIG_SURPRISE = 15;
const SMALL_SURPRISE = 5;
/** 反應期超額報酬低於這個值＝市場「沒反應」 */
const MUTED_REACTION = 2;

interface Event {
  entryDate: string;
  surprisePct: number;
  reactionExcessPct: number;
  ret: Record<number, number | null>;
  excess: Record<number, number | null>;
}

function firstIndexOnOrAfter(bars: OhlcvBar[], date: string): number {
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].date < date) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function nextMonthFirstDay(month: string): string {
  const d = new Date(`${month}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

interface Stats {
  n: number;
  avg: number;
  median: number;
  win: number;
  excess: number;
}

function stats(events: Event[], h: number): Stats {
  const withRet = events.filter((e) => e.ret[h] !== null);
  const v = withRet.map((e) => e.ret[h]!).sort((a, b) => a - b);
  const ex = withRet.filter((e) => e.excess[h] !== null).map((e) => e.excess[h]!);
  const n = v.length;
  if (n === 0) return { n: 0, avg: NaN, median: NaN, win: NaN, excess: NaN };
  return {
    n,
    avg: v.reduce((a, b) => a + b, 0) / n,
    median: v[Math.floor(n / 2)],
    win: (v.filter((x) => x > 0).length / n) * 100,
    excess: ex.length ? ex.reduce((a, b) => a + b, 0) / ex.length : NaN,
  };
}

function fmt(s: Stats): string {
  if (s.n === 0) return "N=    0";
  return `N=${String(s.n).padStart(5)} 平均${s.avg.toFixed(2).padStart(6)}% 中位數${s.median.toFixed(2).padStart(6)}% 正報酬${s.win.toFixed(0).padStart(3)}% 超額${s.excess.toFixed(2).padStart(6)}%`;
}

async function main() {
  const taiex = await prisma.stock.findUnique({ where: { market_ticker: { market: "TW", ticker: "TAIEX" } } });
  const taiexBars = taiex ? await loadPriceBars(taiex.id) : [];
  const taiexByDate = new Map(taiexBars.map((b) => [b.date, b]));

  const stocks = await prisma.stock.findMany({
    where: { market: "TW", isActive: true, ticker: { not: "TAIEX" }, NOT: { industry: { contains: "ETF" } } },
    select: { id: true },
  });

  const events: Event[] = [];
  let processed = 0;
  for (const stock of stocks) {
    const revenue = await loadRevenueMonths(stock.id);
    if (revenue.length < 24) continue;
    const bars = await loadPriceBars(stock.id);
    if (bars.length < 60) continue;

    for (const m of computeRevenueMomentum(revenue)) {
      if (m.surprisePct === null) continue;
      // 股價歷史必須涵蓋整個公布窗口：很多股票營收從2016年開始、股價卻只回補到近兩年，
      // 沒有這個檢查時，早期月份會全部對到股價資料的第一天，同一段報酬被重複計算好幾百次
      const windowStart = nextMonthFirstDay(m.month);
      if (bars[0].date > windowStart) continue;
      const start = firstIndexOnOrAfter(bars, windowStart);
      const end = firstIndexOnOrAfter(bars, m.availableFrom);
      const entryIndex = end + 1;
      if (entryIndex >= bars.length || end < start) continue;
      // 公布期限後超過7天才有下一個交易日，代表中間缺資料（停牌/資料缺口），不硬算
      if ((new Date(bars[end].date).getTime() - new Date(m.availableFrom).getTime()) / 86_400_000 > 7) continue;

      const tStart = taiexByDate.get(bars[start].date);
      const tEnd = taiexByDate.get(bars[end].date);
      if (!tStart || !tEnd) continue;
      const reaction = ((bars[end].close - bars[start].open) / bars[start].open) * 100;
      const taiexReaction = ((tEnd.close - tStart.open) / tStart.open) * 100;

      const entry = bars[entryIndex];
      const tIn = taiexByDate.get(entry.date);
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
        const tOut = taiexByDate.get(exitBar.date);
        excess[h] = tIn && tOut ? ret[h]! - ((tOut.close - tIn.open) / tIn.open) * 100 : null;
      }
      events.push({ entryDate: entry.date, surprisePct: m.surprisePct, reactionExcessPct: reaction - taiexReaction, ret, excess });
    }
    processed++;
  }

  const dates = events.map((e) => e.entryDate).sort();
  const splitDate = dates[Math.floor(dates.length / 2)];
  console.log(`處理 ${processed} 檔股票、${events.length} 個營收公布事件；train/test 分界 ${splitDate}`);
  console.log(`驚喜分組：大幅≥+${BIG_SURPRISE}%、小幅+${SMALL_SURPRISE}~${BIG_SURPRISE}%、符合預期±${SMALL_SURPRISE}%、低於預期≤-${SMALL_SURPRISE}%；沒反應＝公布期間超額報酬<${MUTED_REACTION}%`);

  const groups: [string, (e: Event) => boolean][] = [
    ["全部", () => true],
    ["大幅驚喜", (e) => e.surprisePct >= BIG_SURPRISE],
    ["大幅驚喜 × 市場沒反應", (e) => e.surprisePct >= BIG_SURPRISE && e.reactionExcessPct < MUTED_REACTION],
    ["大幅驚喜 × 市場已反應", (e) => e.surprisePct >= BIG_SURPRISE && e.reactionExcessPct >= MUTED_REACTION],
    ["小幅驚喜", (e) => e.surprisePct >= SMALL_SURPRISE && e.surprisePct < BIG_SURPRISE],
    ["小幅驚喜 × 市場沒反應", (e) => e.surprisePct >= SMALL_SURPRISE && e.surprisePct < BIG_SURPRISE && e.reactionExcessPct < MUTED_REACTION],
    ["符合預期", (e) => Math.abs(e.surprisePct) < SMALL_SURPRISE],
    ["低於預期", (e) => e.surprisePct <= -SMALL_SURPRISE],
    ["低於預期 × 市場還在漲", (e) => e.surprisePct <= -SMALL_SURPRISE && e.reactionExcessPct >= MUTED_REACTION],
  ];
  for (const [label, pred] of groups) {
    const sub = events.filter(pred);
    console.log(`\n【${label}】`);
    for (const h of HORIZONS) {
      console.log(`  ${h}日 全期 ${fmt(stats(sub, h))}`);
      console.log(`      train ${fmt(stats(sub.filter((e) => e.entryDate < splitDate), h))}`);
      console.log(`      test  ${fmt(stats(sub.filter((e) => e.entryDate >= splitDate), h))}`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
