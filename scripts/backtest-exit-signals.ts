/**
 * 2026-07-23：回測自訂策略的「出場訊號」本身有沒有預測力——不是在模擬持倉的情境下看，
 * 是把每個出場條件當成獨立的「看空訊號」，掃全部交易日（不管有沒有在持倉），該條件當天
 * 成立時，未來5/10/20日的報酬（原始+扣掉同期大盤的超額）長什麼樣。如果一個出場訊號真的
 * 有效，訊號成立後的未來報酬應該明顯偏負；如果報酬跟隨機日子差不多甚至更好，代表這個出場
 * 條件本身沒有預測力，只是雜訊。
 *
 * 方法論比照 scripts/backtest.ts：只用訊號當天(含)以前的資料，超額報酬用同一天進場、
 * 同樣持有天數的大盤(TAIEX)報酬相減。
 *
 * 用法：npx tsx scripts/backtest-exit-signals.ts [ticker1,ticker2,...]
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { sma, stochasticKD } from "../src/lib/trend/indicators";
import type { InstitutionalDay } from "../src/lib/trend/tw/chipScore";
import type { OhlcvBar } from "../src/lib/trend/types";

const MIN_BARS_REQUIRED = 210;
const FORWARD_WINDOWS = [5, 10, 20];
const MAX_FORWARD = Math.max(...FORWARD_WINDOWS);

async function loadPriceBars(stockId: number): Promise<OhlcvBar[]> {
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

async function loadInstitutionalDays(stockId: number): Promise<InstitutionalDay[]> {
  const rows = await prisma.twInstitutionalTrading.findMany({ where: { stockId }, orderBy: { tradeDate: "asc" } });
  return rows.map((r) => ({
    date: r.tradeDate.toISOString().slice(0, 10),
    foreignNetBuyShares: Number(r.foreignNetBuyShares),
    investTrustNetBuyShares: Number(r.investTrustNetBuyShares),
    dealerNetBuyShares: Number(r.dealerNetBuyShares),
    totalVolumeShares: Number(r.totalVolumeShares),
  }));
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function avgNetBuy(days: InstitutionalDay[], windowDays: number): number | null {
  const window = days.slice(-windowDays);
  if (window.length < windowDays) return null;
  return sum(window.map((d) => d.foreignNetBuyShares + d.investTrustNetBuyShares)) / window.length;
}

function netSellAccelerating(days: InstitutionalDay[]): boolean {
  const a2 = avgNetBuy(days, 2);
  const a5 = avgNetBuy(days, 5);
  const a10 = avgNetBuy(days, 10);
  return a2 !== null && a5 !== null && a10 !== null && a2 < 0 && a2 < a5 && a5 < a10;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

interface Observation {
  signal: string;
  forwardReturns: Record<number, number>;
  marketForwardReturns: Record<number, number | null>;
}

/** 六個出場條件各自獨立判斷，同一天可以同時觸發好幾個（不是互斥的OR-cascade，這裡要各自評估品質） */
function evalExitSignals(
  idx: number,
  bars: OhlcvBar[],
  ma5: (number | null)[],
  ma10: (number | null)[],
  k: (number | null)[],
  d: (number | null)[],
  institutionalDaysUpToDate: InstitutionalDay[]
): string[] {
  const signals: string[] = [];
  const close = bars[idx].close;
  const m5 = ma5[idx];
  const m10 = ma10[idx];

  if (idx >= 3) {
    const ret3d = ((close - bars[idx - 3].close) / bars[idx - 3].close) * 100;
    if (ret3d > 15 && m5 !== null && close < m5) signals.push("tight_stop_ma5_after_15pct_3d");
    if (ret3d > 10 && m10 !== null && close < m10) signals.push("stop_ma10_after_10pct_3d");
  }

  if (m5 !== null && m10 !== null && m10 > m5) signals.push("ma_cross_down");

  if (k[idx] !== null && k[idx - 1] !== null && (k[idx] as number) < (k[idx - 1] as number)) {
    signals.push("k_weakening_single_day_dip");
  }
  {
    const ck = k[idx];
    const cd = d[idx];
    const pk = k[idx - 1];
    const pd = d[idx - 1];
    if (ck !== null && cd !== null && pk !== null && pd !== null && pk >= pd && ck < cd) {
      signals.push("k_weakening_cross_below_d");
    }
  }

  if (netSellAccelerating(institutionalDaysUpToDate)) signals.push("institutional_selling_accelerating");

  return signals;
}

async function main() {
  const tickerFilter = process.argv[2] ? process.argv[2].split(",").map((t) => t.trim()) : null;

  const taiexStock = await prisma.stock.findUnique({ where: { market_ticker: { market: "TW", ticker: "TAIEX" } } });
  if (!taiexStock) throw new Error("找不到 TAIEX");
  const benchmarkBars = await loadPriceBars(taiexStock.id);
  const benchmarkDateIndex = new Map(benchmarkBars.map((b, i) => [b.date, i]));

  const stocks = await prisma.stock.findMany({
    where: { market: "TW", isActive: true, ticker: { not: "TAIEX" }, ...(tickerFilter ? { ticker: { in: tickerFilter } } : {}) },
    select: { id: true, ticker: true },
  });

  const observations: Observation[] = [];
  let stocksProcessed = 0;

  for (const stock of stocks) {
    const bars = await loadPriceBars(stock.id);
    if (bars.length < MIN_BARS_REQUIRED + MAX_FORWARD) continue;

    const institutionalDays = await loadInstitutionalDays(stock.id);
    const closes = bars.map((b) => b.close);
    const ma5 = sma(closes, 5);
    const ma10 = sma(closes, 10);
    const { k, d } = stochasticKD(bars);

    for (let targetIndex = MIN_BARS_REQUIRED - 1; targetIndex < bars.length - MAX_FORWARD; targetIndex++) {
      const targetDate = bars[targetIndex].date;
      const institutionalDaysUpToTarget = institutionalDays.filter((day) => day.date <= targetDate);

      const signals = evalExitSignals(targetIndex, bars, ma5, ma10, k, d, institutionalDaysUpToTarget);
      if (signals.length === 0) continue;

      const entryClose = bars[targetIndex].close;
      const forwardReturns: Record<number, number> = {};
      for (const w of FORWARD_WINDOWS) {
        const futureClose = bars[targetIndex + w].close;
        forwardReturns[w] = entryClose !== 0 ? ((futureClose - entryClose) / entryClose) * 100 : 0;
      }

      const benchmarkTargetIndex = benchmarkDateIndex.get(targetDate);
      const marketForwardReturns: Record<number, number | null> = {};
      if (benchmarkTargetIndex !== undefined) {
        const marketEntry = benchmarkBars[benchmarkTargetIndex].close;
        for (const w of FORWARD_WINDOWS) {
          const futureIndex = benchmarkTargetIndex + w;
          marketForwardReturns[w] =
            futureIndex < benchmarkBars.length && marketEntry !== 0
              ? ((benchmarkBars[futureIndex].close - marketEntry) / marketEntry) * 100
              : null;
        }
      } else {
        for (const w of FORWARD_WINDOWS) marketForwardReturns[w] = null;
      }

      for (const signal of signals) {
        observations.push({ signal, forwardReturns, marketForwardReturns });
      }
    }

    stocksProcessed++;
    if (stocksProcessed % 50 === 0) console.log(`  已處理 ${stocksProcessed}/${stocks.length} 檔...`);
  }

  console.log(`\n共處理 ${stocksProcessed} 檔股票，${observations.length} 筆(訊號,天)觀察值\n`);

  const bySignal = new Map<string, Observation[]>();
  for (const obs of observations) {
    const list = bySignal.get(obs.signal) ?? [];
    list.push(obs);
    bySignal.set(obs.signal, list);
  }

  console.log(
    "出場訊號（獨立評估，訊號成立當天之後的未來報酬——負值代表訊號真的預示下跌，是好的出場理由）"
  );
  console.log("=".repeat(120));
  console.log(
    "訊號".padEnd(38) +
      "樣本數".padEnd(10) +
      FORWARD_WINDOWS.map((w) => `${w}日跌率`.padEnd(10)).join("") +
      FORWARD_WINDOWS.map((w) => `${w}日均超額`.padEnd(12)).join("") +
      FORWARD_WINDOWS.map((w) => `${w}日中位超額`.padEnd(12)).join("")
  );
  console.log("=".repeat(120));

  for (const [signal, obs] of [...bySignal.entries()].sort((a, b) => b[1].length - a[1].length)) {
    let line = signal.padEnd(38) + String(obs.length).padEnd(10);
    for (const w of FORWARD_WINDOWS) {
      const returns = obs.map((o) => o.forwardReturns[w]);
      const downRate = (returns.filter((r) => r < 0).length / returns.length) * 100;
      line += `${downRate.toFixed(1)}%`.padEnd(10);
    }
    for (const w of FORWARD_WINDOWS) {
      const excess = obs
        .filter((o) => o.marketForwardReturns[w] !== null)
        .map((o) => o.forwardReturns[w] - (o.marketForwardReturns[w] as number));
      const avg = excess.length > 0 ? sum(excess) / excess.length : NaN;
      line += `${avg >= 0 ? "+" : ""}${avg.toFixed(2)}%`.padEnd(12);
    }
    for (const w of FORWARD_WINDOWS) {
      const excess = obs
        .filter((o) => o.marketForwardReturns[w] !== null)
        .map((o) => o.forwardReturns[w] - (o.marketForwardReturns[w] as number));
      const sorted = [...excess].sort((a, b) => a - b);
      const median = percentile(sorted, 0.5);
      line += `${median >= 0 ? "+" : ""}${median.toFixed(2)}%`.padEnd(12);
    }
    console.log(line);
  }
  console.log("=".repeat(120));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
