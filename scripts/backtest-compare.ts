/**
 * 2026-07-22：比較目前 production 三段式分類門檻 vs 候選調整方案，用同一份完整歷史資料
 * （跟 backtest.ts 一樣的方法論：只看訊號當天以前的資料、超額報酬扣掉同期大盤）。
 *
 * 這裡列的是逐一測試單一參數後篩出來、真的有支撐的結果，不是一開始就直接組合測試：
 * 一開始嘗試同時調整reversal的3個參數/pullback的3個參數，樣本數直接崩潰到10~17筆
 * （組合限制不是疊加而是相乘，很快就把樣本篩光），完全不可信，所以改成先逐一測試單一參數
 * （見git history這支檔案的舊版本），只留下有真的支撐的組合：
 *
 * - reversalMinAdx=15（單一改動）：reversal 20日超額報酬勝率從50.2%/中位數+0.20%（近乎雜訊）
 *   提升到55.3%/+1.74%，樣本數從287筆降到197筆（還算充足）。這是唯一測出「有效又不會把樣本
 *   篩光」的reversal調整——volumeSpikeMultiplier=2.0單獨測也有類似效果(55.7%/+1.74%,n=176)，
 *   但兩者疊加(n=139)沒有比單獨用reversalMinAdx=15更好，疊加不划算。
 * - pullback：測過RSI冷卻上限收窄(40-50)、回檔幅度上限收窄(8%)、支撐帶收窄(1.5%)，全部
 *   要嘛沒改善（P2/P3反而更差）、要嘛樣本數崩潰到不可信（P1剩44筆）。結論：現有台股門檻
 *   （5%-10%回檔 + RSI 40-55 + ±2%支撐）在這份資料上已經接近沒有簡單調整空間的局部最佳解，
 *   不建議改動。
 * - bullish：兩套實驗都沒動這段門檻，全程當對照組——三套結果數字完全一樣，驗證這支腳本
 *   本身的多組態比較邏輯沒有跑錯。
 *
 * 用法：npx tsx scripts/backtest-compare.ts [ticker1,ticker2,...]
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { computeIndicatorSeries } from "../src/lib/trend/indicators";
import { calculateTwTrendSignalAtIndex } from "../src/lib/trend/tw/calculateTwDailySignal";
import type { ClassificationThresholds } from "../src/lib/trend/classify";
import type { OhlcvBar } from "../src/lib/trend/types";
import type { InstitutionalDay } from "../src/lib/trend/tw/chipScore";

const MIN_BARS_REQUIRED = 210;
const FORWARD_WINDOWS = [5, 10, 20];
const MAX_FORWARD = Math.max(...FORWARD_WINDOWS);

interface VariantConfig {
  name: string;
  overrides: Partial<ClassificationThresholds>;
}

const VARIANTS: VariantConfig[] = [
  { name: "baseline (目前production)", overrides: {} },
  { name: "建議採用: reversalMinAdx=15", overrides: { reversalMinAdx: 15 } },
];

interface Observation {
  ticker: string;
  date: string;
  status: string;
  forwardReturns: Record<number, number>;
  marketForwardReturns: Record<number, number | null>;
}

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

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

async function main() {
  const tickerFilter = process.argv[2] ? process.argv[2].split(",").map((t) => t.trim()) : null;

  const taiexStock = await prisma.stock.findUnique({ where: { market_ticker: { market: "TW", ticker: "TAIEX" } } });
  if (!taiexStock) throw new Error("找不到 TAIEX");
  const benchmarkBars = await loadPriceBars(taiexStock.id);
  const benchmarkSeries = computeIndicatorSeries(benchmarkBars);
  const benchmarkDateIndex = new Map(benchmarkBars.map((b, i) => [b.date, i]));

  const stocks = await prisma.stock.findMany({
    where: { market: "TW", isActive: true, ticker: { not: "TAIEX" }, ...(tickerFilter ? { ticker: { in: tickerFilter } } : {}) },
    select: { id: true, ticker: true, companyName: true },
  });

  const observationsByVariant = new Map<string, Observation[]>(VARIANTS.map((v) => [v.name, []]));
  let stocksProcessed = 0;

  for (const stock of stocks) {
    const bars = await loadPriceBars(stock.id);
    if (bars.length < MIN_BARS_REQUIRED + MAX_FORWARD) continue;

    const allInstitutionalDays = await loadInstitutionalDays(stock.id);

    for (let targetIndex = MIN_BARS_REQUIRED - 1; targetIndex < bars.length - MAX_FORWARD; targetIndex++) {
      const targetDate = bars[targetIndex].date;
      const institutionalDaysUpToTarget = allInstitutionalDays.filter((d) => d.date <= targetDate);
      const benchmarkTargetIndex = benchmarkDateIndex.get(targetDate);

      const entryClose = bars[targetIndex].close;
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

      const forwardReturns: Record<number, number> = {};
      for (const w of FORWARD_WINDOWS) {
        const futureClose = bars[targetIndex + w].close;
        forwardReturns[w] = entryClose !== 0 ? ((futureClose - entryClose) / entryClose) * 100 : 0;
      }

      for (const variant of VARIANTS) {
        const signal = calculateTwTrendSignalAtIndex(
          bars,
          [],
          targetIndex,
          institutionalDaysUpToTarget,
          benchmarkTargetIndex !== undefined ? benchmarkSeries : undefined,
          benchmarkTargetIndex,
          variant.overrides
        );
        if (signal.status === "none") continue;

        observationsByVariant.get(variant.name)!.push({
          ticker: stock.ticker,
          date: targetDate,
          status: signal.status,
          forwardReturns,
          marketForwardReturns,
        });
      }
    }

    stocksProcessed++;
    if (stocksProcessed % 50 === 0) console.log(`  已處理 ${stocksProcessed}/${stocks.length} 檔...`);
  }

  console.log(`\n共處理 ${stocksProcessed} 檔股票\n`);

  for (const variant of VARIANTS) {
    const observations = observationsByVariant.get(variant.name)!;
    const byStatus = new Map<string, Observation[]>();
    for (const obs of observations) {
      const list = byStatus.get(obs.status) ?? [];
      list.push(obs);
      byStatus.set(obs.status, list);
    }

    console.log("\n" + "#".repeat(100));
    console.log(`# ${variant.name}  (overrides: ${JSON.stringify(variant.overrides)})`);
    console.log("#".repeat(100));
    console.log("超額報酬（扣掉同期大盤報酬，訊號真正的alpha）");
    console.log("=".repeat(100));
    console.log(
      "狀態".padEnd(14) + "樣本數".padEnd(10) + FORWARD_WINDOWS.map((w) => `${w}日勝率`.padEnd(10)).join("") +
        FORWARD_WINDOWS.map((w) => `${w}日均超額`.padEnd(12)).join("") + FORWARD_WINDOWS.map((w) => `${w}日中位超額`.padEnd(12)).join("")
    );
    console.log("=".repeat(100));

    for (const [status, obs] of [...byStatus.entries()].sort((a, b) => b[1].length - a[1].length)) {
      let line = status.padEnd(14) + String(obs.length).padEnd(10);
      for (const w of FORWARD_WINDOWS) {
        const excess = obs
          .filter((o) => o.marketForwardReturns[w] !== null)
          .map((o) => o.forwardReturns[w] - (o.marketForwardReturns[w] as number));
        const winRate = excess.length > 0 ? (excess.filter((r) => r > 0).length / excess.length) * 100 : NaN;
        line += `${winRate.toFixed(1)}%`.padEnd(10);
      }
      for (const w of FORWARD_WINDOWS) {
        const excess = obs
          .filter((o) => o.marketForwardReturns[w] !== null)
          .map((o) => o.forwardReturns[w] - (o.marketForwardReturns[w] as number));
        const avg = excess.length > 0 ? excess.reduce((a, b) => a + b, 0) / excess.length : NaN;
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
    console.log("=".repeat(100));
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
