/**
 * 台股真實資料每日批次計算：從 tw_daily_price / tw_institutional_trading 讀回歷史
 * （不重新打 API，只有 tw-fetch-today.ts 或 tw-backfill.ts 才會打 API 更新這兩張表），
 * 跑 calculateTwTrendSignalAtIndex，寫進 daily_trend_signals。
 *
 * 用法：
 *   npx tsx scripts/tw-daily-batch.ts                 // 跑全部有回填過歷史的 TW 股票
 *   npx tsx scripts/tw-daily-batch.ts 2330,2454       // 只跑指定 ticker
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { computeIndicatorSeries } from "../src/lib/trend/indicators";
import { calculateTwTrendSignalAtIndex } from "../src/lib/trend/tw/calculateTwDailySignal";
import { buildTwDailyTrendSignalRow } from "../src/lib/trend/tw/dailyTrendSignalRow";
import type { OhlcvBar } from "../src/lib/trend/types";
import type { InstitutionalDay } from "../src/lib/trend/tw/chipScore";

const MIN_BARS_REQUIRED = 210;

async function loadPriceBars(stockId: number): Promise<OhlcvBar[]> {
  const rows = await prisma.twDailyPrice.findMany({
    where: { stockId },
    orderBy: { tradeDate: "asc" },
  });
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
  const rows = await prisma.twInstitutionalTrading.findMany({
    where: { stockId },
    orderBy: { tradeDate: "asc" },
  });
  return rows.map((r) => ({
    date: r.tradeDate.toISOString().slice(0, 10),
    foreignNetBuyShares: Number(r.foreignNetBuyShares),
    investTrustNetBuyShares: Number(r.investTrustNetBuyShares),
    dealerNetBuyShares: Number(r.dealerNetBuyShares),
    totalVolumeShares: Number(r.totalVolumeShares),
  }));
}

async function main() {
  const tickerFilter = process.argv[2] ? process.argv[2].split(",").map((t) => t.trim()) : null;

  const taiexStock = await prisma.stock.findUnique({
    where: { market_ticker: { market: "TW", ticker: "TAIEX" } },
  });
  if (!taiexStock) {
    throw new Error('找不到 TAIEX 合成股票紀錄，先跑 `npx prisma db seed` 和 `tw-backfill.ts`。');
  }
  const benchmarkBars = await loadPriceBars(taiexStock.id);
  if (benchmarkBars.length === 0) {
    throw new Error("TAIEX 沒有價格歷史，先跑 tw-backfill.ts。");
  }
  const benchmarkSeries = computeIndicatorSeries(benchmarkBars);
  const benchmarkDateIndex = new Map(benchmarkBars.map((b, i) => [b.date, i]));

  const stocks = await prisma.stock.findMany({
    where: { market: "TW", isActive: true, ticker: { not: "TAIEX" }, ...(tickerFilter ? { ticker: { in: tickerFilter } } : {}) },
    select: { id: true, ticker: true, companyName: true },
  });

  let written = 0;
  let skippedNone = 0;
  let skippedInsufficientData = 0;

  for (const stock of stocks) {
    const bars = await loadPriceBars(stock.id);
    if (bars.length < MIN_BARS_REQUIRED) {
      skippedInsufficientData++;
      continue;
    }

    const institutionalDays = await loadInstitutionalDays(stock.id);
    const targetIndex = bars.length - 1;
    const benchmarkTargetIndex = benchmarkDateIndex.get(bars[targetIndex].date);

    const signal = calculateTwTrendSignalAtIndex(
      bars,
      [],
      targetIndex,
      institutionalDays,
      benchmarkTargetIndex !== undefined ? benchmarkSeries : undefined,
      benchmarkTargetIndex
    );

    if (signal.status === "none") {
      skippedNone++;
      console.log(`  ${stock.ticker}: none（未歸類，不寫入）`);
      continue;
    }

    const row = buildTwDailyTrendSignalRow(signal);
    await prisma.dailyTrendSignal.upsert({
      where: { stockId_tradeDate: { stockId: stock.id, tradeDate: new Date(signal.tradeDate) } },
      update: row,
      create: { stockId: stock.id, tradeDate: new Date(signal.tradeDate), ...row },
    });
    written++;
    console.log(
      `  ${stock.ticker} ${stock.companyName}: ${signal.status} (tradeDate=${signal.tradeDate}, core=${signal.coreScore}, tech=${signal.technicalScore}, chip=${signal.chipScore})`
    );
  }

  console.log(
    `\nDone. wrote ${written} rows, skipped ${skippedNone} "none", skipped ${skippedInsufficientData} insufficient price history (<${MIN_BARS_REQUIRED} bars, likely TPEx/not yet backfilled).`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
