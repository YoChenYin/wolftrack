/**
 * 真實資料每日批次計算：抓 Polygon.io 歷史日線 -> 算 Core Score / 三段分類 -> 寫進 daily_trend_signals。
 * 用法：
 *   npx tsx scripts/run-daily-batch.ts                 // 跑 stocks 表裡全部 active 股票
 *   npx tsx scripts/run-daily-batch.ts AAPL,NVDA,VRT    // 只跑指定 ticker（逗號分隔），新增股票後補資料用
 *
 * 對應 docs/trend-core-implementation-logic.md 第8章「計算時機：美股收盤後批次計算」，
 * MVP 階段先手動執行；之後要排程的話直接把這支腳本掛到 cron（Zeabur Cron Job）即可。
 *
 * 注意：Polygon.io 免費方案 5 requests/分鐘，這裡用序列化節流器控制；免費方案資料本身也有延遲，
 * 不保證抓得到「今天」的收盤價。
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fetchDailyBars, PolygonApiError } from "../src/lib/marketData/polygonClient";
import { createRateLimiter } from "../src/lib/marketData/rateLimiter";
import { computeIndicatorSeries, type IndicatorSeries } from "../src/lib/trend/indicators";
import { calculateTrendSignalAtIndex } from "../src/lib/trend/calculateDailySignal";
import { buildDailyTrendSignalRow } from "../src/lib/trend/dailyTrendSignalRow";
import type { OhlcvBar } from "../src/lib/trend/types";

const BENCHMARK_TICKER = "SPY";
/** Polygon.io 免費方案 5 requests/分鐘，抓寬一點的間隔留緩衝 */
const POLYGON_MIN_INTERVAL_MS = 13_000;
/** 算 200MA + ADX 暖身期至少需要這麼多交易日，不夠就跳過該股票 */
const MIN_BARS_REQUIRED = 210;

async function fetchWithThrottle(
  throttle: () => Promise<void>,
  ticker: string
): Promise<OhlcvBar[] | null> {
  await throttle();
  try {
    return await fetchDailyBars(ticker);
  } catch (err) {
    if (err instanceof PolygonApiError) {
      console.error(`  skip ${ticker}: ${err.message}`);
    } else {
      console.error(`  skip ${ticker}: ${(err as Error).message}`);
    }
    return null;
  }
}

async function main() {
  const tickerFilter = process.argv[2]
    ? process.argv[2].split(",").map((t) => t.trim().toUpperCase())
    : null;

  const stocks = await prisma.stock.findMany({
    where: { market: "US", isActive: true, ...(tickerFilter ? { ticker: { in: tickerFilter } } : {}) },
    select: { id: true, ticker: true },
  });

  if (stocks.length === 0) {
    console.log('沒有符合條件的股票，確認 ticker 拼字，或先跑 `npx prisma db seed` 建立股票清單。');
    return;
  }

  const throttle = createRateLimiter(POLYGON_MIN_INTERVAL_MS);

  console.log(`Fetching benchmark ${BENCHMARK_TICKER}...`);
  const benchmarkBars = await fetchWithThrottle(throttle, BENCHMARK_TICKER);
  if (!benchmarkBars || benchmarkBars.length === 0) {
    throw new Error(`無法取得 benchmark (${BENCHMARK_TICKER}) 資料，中止批次計算。`);
  }
  const benchmarkSeries: IndicatorSeries = computeIndicatorSeries(benchmarkBars);

  let written = 0;
  let skippedNone = 0;
  let skippedError = 0;

  for (const stock of stocks) {
    console.log(`Fetching ${stock.ticker}...`);
    const bars = await fetchWithThrottle(throttle, stock.ticker);
    if (!bars) {
      skippedError++;
      continue;
    }
    if (bars.length < MIN_BARS_REQUIRED) {
      console.warn(`  skip ${stock.ticker}: 只有 ${bars.length} 個交易日，不足 ${MIN_BARS_REQUIRED} 天（200MA 暖身期不夠）`);
      skippedError++;
      continue;
    }

    const series = computeIndicatorSeries(bars);
    const targetIndex = bars.length - 1;

    // benchmark 和個股各自的交易日序列理論上尾端會對齊在同一天，用陣列長度差換算對應 index。
    // TODO: 待接上真實排程後改用日期比對，而不是用長度差推算（遇到單一股票停牌等邊界情況會失準）。
    const benchmarkTargetIndex = benchmarkBars.length - bars.length + targetIndex;
    const hasBenchmark = benchmarkTargetIndex >= 0 && benchmarkTargetIndex < benchmarkBars.length;

    const signal = calculateTrendSignalAtIndex(
      bars,
      series,
      targetIndex,
      hasBenchmark ? benchmarkSeries : undefined,
      hasBenchmark ? benchmarkTargetIndex : undefined
    );

    if (signal.status === "none") {
      console.log(`  ${stock.ticker}: none（未歸類，不寫入）`);
      skippedNone++;
      continue;
    }

    const row = buildDailyTrendSignalRow(signal);
    await prisma.dailyTrendSignal.upsert({
      where: { stockId_tradeDate: { stockId: stock.id, tradeDate: new Date(signal.tradeDate) } },
      update: row,
      create: { stockId: stock.id, tradeDate: new Date(signal.tradeDate), ...row },
    });
    written++;
    console.log(`  ${stock.ticker}: ${signal.status} (tradeDate=${signal.tradeDate}, coreScore=${signal.coreScore})`);
  }

  console.log(`Done. wrote ${written} rows, skipped ${skippedNone} "none", skipped ${skippedError} errors/insufficient data.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
