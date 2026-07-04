import { prisma } from "../src/lib/prisma";
import { buildPhasedOhlcv } from "../src/lib/mock/scenarioOhlcv";
import { computeIndicatorSeries } from "../src/lib/trend/indicators";
import { calculateTrendSignalAtIndex } from "../src/lib/trend/calculateDailySignal";
import { buildDailyTrendSignalRow } from "../src/lib/trend/dailyTrendSignalRow";
import {
  STOCK_SCENARIOS,
  BENCHMARK_PHASES,
  BENCHMARK_SEED,
  BENCHMARK_START_PRICE,
} from "../src/lib/mock/stockScenarios";

/** 模擬近 N 個交易日「每日收盤後批次計算」留下的歷史紀錄，不是完整 2 年歷史 */
const HISTORY_WINDOW_DAYS = 30;

export async function seedDailyTrendSignals() {
  const stocks = await prisma.stock.findMany({ where: { market: "US" }, select: { id: true, ticker: true } });
  const stockIdByTicker = new Map(stocks.map((s) => [s.ticker, s.id]));

  const benchmarkBars = buildPhasedOhlcv({
    seed: BENCHMARK_SEED,
    startPrice: BENCHMARK_START_PRICE,
    phases: BENCHMARK_PHASES,
  });
  const benchmarkSeries = computeIndicatorSeries(benchmarkBars);

  let totalRows = 0;
  let skippedNone = 0;

  for (const scenario of STOCK_SCENARIOS) {
    const stockId = stockIdByTicker.get(scenario.ticker);
    if (!stockId) {
      console.warn(`skip ${scenario.ticker}: not found in stocks table (run stock seeding first)`);
      continue;
    }

    const bars = buildPhasedOhlcv({
      seed: scenario.seed,
      startPrice: scenario.startPrice,
      phases: scenario.phases,
      forceVolumeSpike: scenario.forceVolumeSpike,
    });
    const series = computeIndicatorSeries(bars);
    // 兩條序列都以同一個 endDate 往回排出交易日，尾端日期會對齊，用長度差當 offset 換算對應 index
    const benchmarkOffset = benchmarkBars.length - bars.length;

    const startIndex = Math.max(0, bars.length - HISTORY_WINDOW_DAYS);
    for (let targetIndex = startIndex; targetIndex < bars.length; targetIndex++) {
      const benchmarkTargetIndex = benchmarkOffset + targetIndex;
      const signal = calculateTrendSignalAtIndex(bars, series, targetIndex, benchmarkSeries, benchmarkTargetIndex);

      if (signal.status === "none") {
        skippedNone++;
        continue;
      }

      const row = buildDailyTrendSignalRow(signal);
      await prisma.dailyTrendSignal.upsert({
        where: { stockId_tradeDate: { stockId, tradeDate: new Date(signal.tradeDate) } },
        update: row,
        create: { stockId, tradeDate: new Date(signal.tradeDate), ...row },
      });
      totalRows++;
    }
  }

  console.log(
    `Seeded ${totalRows} daily_trend_signals rows across ${STOCK_SCENARIOS.length} stocks (skipped ${skippedNone} "none" days).`
  );
}
