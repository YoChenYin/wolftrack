import { prisma } from "@/lib/prisma";
import {
  fetchAllStocksToday,
  fetchInstitutionalTradingByDate,
  fetchTaiexHistory,
} from "./twseClient";
import { createRateLimiter } from "./rateLimiter";
import { runTwDailyBatch, type TwDailyBatchResult } from "./runTwDailyBatch";
import { fetchTwValuationSnapshot, type TwValuationFetchResult } from "./fetchTwValuationSnapshot";

const TWSE_MIN_INTERVAL_MS = 1300;

export interface TwDailyUpdateResult {
  pricesUpdated: number;
  institutionalUpdated: number;
  batch: TwDailyBatchResult;
  valuation: TwValuationFetchResult;
}

/**
 * 台股「每日增量更新」：只補「今天」一天（不重新回填2年），輕量、可排程。
 * 1. STOCK_DAY_ALL（一次請求拿全部上市股票今天的收盤價）
 * 2. T86（一次請求拿全部股票今天的三大法人買賣超）
 * 3. TAIEX 當月指數（給相對強度因子用的 benchmark）
 * 都只對「已經有真實歷史資料」的股票（tw_daily_price 已有回填）補新的一天，
 * 沒回填過的股票（例如新加入還沒跑 tw-backfill.ts 的股票）不會處理。
 * 最後跑 runTwDailyBatch() 重新計算訊號 + fetchTwValuationSnapshot() 更新 PE/PB。
 */
export async function runTwDailyUpdate(): Promise<TwDailyUpdateResult> {
  const throttle = createRateLimiter(TWSE_MIN_INTERVAL_MS);

  const trackedStocks = await prisma.stock.findMany({
    where: { market: "TW", isActive: true, ticker: { not: "TAIEX" } },
    select: { id: true, ticker: true },
  });
  const backfilledStockIds = new Set(
    (await prisma.twDailyPrice.groupBy({ by: ["stockId"] })).map((r) => r.stockId)
  );
  const trackedTickers = trackedStocks.filter((s) => backfilledStockIds.has(s.id));

  await throttle();
  const todayPrices = await fetchAllStocksToday();

  let pricesUpdated = 0;
  for (const stock of trackedTickers) {
    const bar = todayPrices.get(stock.ticker);
    if (!bar) continue;
    await prisma.twDailyPrice.upsert({
      where: { stockId_tradeDate: { stockId: stock.id, tradeDate: new Date(bar.date) } },
      update: { open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: BigInt(Math.round(bar.volume)) },
      create: {
        stockId: stock.id,
        tradeDate: new Date(bar.date),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: BigInt(Math.round(bar.volume)),
      },
    });
    pricesUpdated++;
  }

  // TAIEX 沒有「當日全市場」這種快照可查，用當月歷史（1個月=1次請求）拿最新一筆
  const taiexStock = await prisma.stock.findUnique({ where: { market_ticker: { market: "TW", ticker: "TAIEX" } } });
  if (taiexStock) {
    await throttle();
    const taiexBars = await fetchTaiexHistory(1, throttle);
    const latest = taiexBars[taiexBars.length - 1];
    if (latest) {
      await prisma.twDailyPrice.upsert({
        where: { stockId_tradeDate: { stockId: taiexStock.id, tradeDate: new Date(latest.date) } },
        update: { open: latest.open, high: latest.high, low: latest.low, close: latest.close, volume: BigInt(0) },
        create: {
          stockId: taiexStock.id,
          tradeDate: new Date(latest.date),
          open: latest.open,
          high: latest.high,
          low: latest.low,
          close: latest.close,
          volume: BigInt(0),
        },
      });
    }
  }

  // 三大法人：用任一筆今天的股價資料反推實際交易日期（可能因假日/資料延遲不等於系統今天）
  const anyBar = [...todayPrices.values()][0];
  let institutionalUpdated = 0;
  if (anyBar) {
    await throttle();
    const instMap = await fetchInstitutionalTradingByDate(anyBar.date.replace(/-/g, ""));
    for (const stock of trackedTickers) {
      const inst = instMap.get(stock.ticker);
      const priceBar = todayPrices.get(stock.ticker);
      if (!inst || !priceBar) continue;

      await prisma.twInstitutionalTrading.upsert({
        where: { stockId_tradeDate: { stockId: stock.id, tradeDate: new Date(anyBar.date) } },
        update: {
          foreignNetBuyShares: BigInt(inst.foreignNetBuyShares),
          investTrustNetBuyShares: BigInt(inst.investTrustNetBuyShares),
          dealerNetBuyShares: BigInt(inst.dealerNetBuyShares),
          totalVolumeShares: BigInt(Math.round(priceBar.volume / 1000)),
        },
        create: {
          stockId: stock.id,
          tradeDate: new Date(anyBar.date),
          foreignNetBuyShares: BigInt(inst.foreignNetBuyShares),
          investTrustNetBuyShares: BigInt(inst.investTrustNetBuyShares),
          dealerNetBuyShares: BigInt(inst.dealerNetBuyShares),
          totalVolumeShares: BigInt(Math.round(priceBar.volume / 1000)),
        },
      });
      institutionalUpdated++;
    }
  }

  const batch = await runTwDailyBatch();
  const valuation = await fetchTwValuationSnapshot();

  return { pricesUpdated, institutionalUpdated, batch, valuation };
}
