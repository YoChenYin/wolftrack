import { prisma } from "@/lib/prisma";
import { fetchDailyBars, PolygonApiError } from "./polygonClient";
import { createRateLimiter } from "./rateLimiter";
import { computeIndicatorSeries, type IndicatorSeries } from "@/lib/trend/indicators";
import { calculateTrendSignalAtIndex } from "@/lib/trend/calculateDailySignal";
import { buildDailyTrendSignalRow } from "@/lib/trend/dailyTrendSignalRow";
import type { OhlcvBar } from "@/lib/trend/types";

const BENCHMARK_TICKER = "SPY";
/** Polygon.io 免費方案 5 requests/分鐘，抓寬一點的間隔留緩衝 */
const POLYGON_MIN_INTERVAL_MS = 13_000;
/** 算 200MA + ADX 暖身期至少需要這麼多交易日，不夠就跳過該股票 */
const MIN_BARS_REQUIRED = 210;

export interface UsDailyBatchResult {
  written: number;
  skippedNone: number;
  skippedError: number;
  log: string[];
}

async function fetchWithThrottle(
  throttle: () => Promise<void>,
  ticker: string,
  log: string[]
): Promise<OhlcvBar[] | null> {
  await throttle();
  try {
    return await fetchDailyBars(ticker);
  } catch (err) {
    const message = err instanceof PolygonApiError ? err.message : (err as Error).message;
    log.push(`skip ${ticker}: ${message}`);
    return null;
  }
}

/**
 * 真實資料每日批次計算：抓 Polygon.io 歷史日線 -> 算 Core Score / 三段分類 -> 寫進 daily_trend_signals。
 * 對應 docs/trend-core-implementation-logic.md 第8章「計算時機：美股收盤後批次計算」。
 * 由 scripts/run-daily-batch.ts（CLI）和 /api/cron/us-batch（排程用）共用。
 */
export async function runUsDailyBatch(tickerFilter?: string[]): Promise<UsDailyBatchResult> {
  const log: string[] = [];
  const stocks = await prisma.stock.findMany({
    where: { market: "US", isActive: true, ...(tickerFilter ? { ticker: { in: tickerFilter } } : {}) },
    select: { id: true, ticker: true },
  });

  if (stocks.length === 0) {
    log.push("沒有符合條件的股票，確認 ticker 拼字，或先跑 `npx prisma db seed` 建立股票清單。");
    return { written: 0, skippedNone: 0, skippedError: 0, log };
  }

  const throttle = createRateLimiter(POLYGON_MIN_INTERVAL_MS);

  log.push(`Fetching benchmark ${BENCHMARK_TICKER}...`);
  const benchmarkBars = await fetchWithThrottle(throttle, BENCHMARK_TICKER, log);
  if (!benchmarkBars || benchmarkBars.length === 0) {
    throw new Error(`無法取得 benchmark (${BENCHMARK_TICKER}) 資料，中止批次計算。`);
  }
  const benchmarkSeries: IndicatorSeries = computeIndicatorSeries(benchmarkBars);

  let written = 0;
  let skippedNone = 0;
  let skippedError = 0;

  for (const stock of stocks) {
    const bars = await fetchWithThrottle(throttle, stock.ticker, log);
    if (!bars) {
      skippedError++;
      continue;
    }
    if (bars.length < MIN_BARS_REQUIRED) {
      log.push(`skip ${stock.ticker}: 只有 ${bars.length} 個交易日，不足 ${MIN_BARS_REQUIRED} 天（200MA 暖身期不夠）`);
      skippedError++;
      continue;
    }

    const series = computeIndicatorSeries(bars);
    const targetIndex = bars.length - 1;

    // benchmark 和個股各自的交易日序列理論上尾端會對齊在同一天，用陣列長度差換算對應 index。
    // TODO: 改用日期比對，而不是用長度差推算（遇到單一股票停牌等邊界情況會失準）。
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
    log.push(`${stock.ticker}: ${signal.status} (tradeDate=${signal.tradeDate}, coreScore=${signal.coreScore})`);
  }

  log.push(`Done. wrote ${written} rows, skipped ${skippedNone} "none", skipped ${skippedError} errors/insufficient data.`);
  return { written, skippedNone, skippedError, log };
}
