import { prisma } from "@/lib/prisma";
import { fetchStockDayHistory, fetchInstitutionalTradingByDate, fetchTaiexHistory } from "./twseClient";
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
 * 台股「每日增量更新」：只補「今天」一天（不重新回填2年），可排程。
 *
 * ⚠️沒有用 STOCK_DAY_ALL（一次拿全部股票的當日快照）——實測發現這個 endpoint 的資料更新
 * 明顯落後逐檔查詢的 STOCK_DAY endpoint（曾經差到 3 個交易日），會導致不同股票的「最新交易日」
 * 對不齊，讓 /api/sector-trends 用全域 MAX(trade_date) 篩選時漏掉一大批其實有資料、只是
 * 差幾天的股票。改成逐檔用 STOCK_DAY（只抓最近1個月=1次請求），跟 tw-backfill.ts 用同一個
 * 資料源，確保新舊資料的日期基準一致。62 檔約 80 秒，排程用完全可以接受。
 *
 * 1. 逐檔 STOCK_DAY（近1個月，取最新一筆）
 * 2. T86（一次請求拿全部股票當天的三大法人買賣超）
 * 3. TAIEX 當月指數（給相對強度因子用的 benchmark）
 * 都只對「已經有真實歷史資料」的股票（tw_daily_price 已有回填）補新的一天。
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

  const latestByTicker = new Map<string, { date: string; open: number; high: number; low: number; close: number; volume: number }>();
  let pricesUpdated = 0;

  for (const stock of trackedTickers) {
    await throttle();
    let bars;
    try {
      bars = await fetchStockDayHistory(stock.ticker, 1, throttle);
    } catch (err) {
      console.error(`[tw-daily-update] skip ${stock.ticker}: ${(err as Error).message}`);
      continue;
    }
    const latest = bars[bars.length - 1];
    if (!latest) continue;

    await prisma.twDailyPrice.upsert({
      where: { stockId_tradeDate: { stockId: stock.id, tradeDate: new Date(latest.date) } },
      update: { open: latest.open, high: latest.high, low: latest.low, close: latest.close, volume: BigInt(Math.round(latest.volume)) },
      create: {
        stockId: stock.id,
        tradeDate: new Date(latest.date),
        open: latest.open,
        high: latest.high,
        low: latest.low,
        close: latest.close,
        volume: BigInt(Math.round(latest.volume)),
      },
    });
    latestByTicker.set(stock.ticker, latest);
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

  // 三大法人：用「大多數股票這次抓到的最新日期」反推實際交易日期，用一次 T86 請求涵蓋全部
  const dateFrequency = new Map<string, number>();
  for (const bar of latestByTicker.values()) {
    dateFrequency.set(bar.date, (dateFrequency.get(bar.date) ?? 0) + 1);
  }
  const mostCommonDate = [...dateFrequency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  let institutionalUpdated = 0;
  if (mostCommonDate) {
    await throttle();
    const instMap = await fetchInstitutionalTradingByDate(mostCommonDate.replace(/-/g, ""));
    for (const [ticker, stockId] of trackedTickers.map((s) => [s.ticker, s.id] as const)) {
      const inst = instMap.get(ticker);
      const priceBar = latestByTicker.get(ticker);
      if (!inst || !priceBar || priceBar.date !== mostCommonDate) continue;

      await prisma.twInstitutionalTrading.upsert({
        where: { stockId_tradeDate: { stockId, tradeDate: new Date(mostCommonDate) } },
        update: {
          foreignNetBuyShares: BigInt(inst.foreignNetBuyShares),
          investTrustNetBuyShares: BigInt(inst.investTrustNetBuyShares),
          dealerNetBuyShares: BigInt(inst.dealerNetBuyShares),
          totalVolumeShares: BigInt(Math.round(priceBar.volume / 1000)),
        },
        create: {
          stockId,
          tradeDate: new Date(mostCommonDate),
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
