import { prisma } from "@/lib/prisma";
import { fetchStockDayHistory } from "./twseClient";
import { fetchFinMindStockPrice, fetchFinMindInstitutionalTrading } from "./finmindClient";
import { createRateLimiter } from "./rateLimiter";
import type { OhlcvBar } from "@/lib/trend/types";

const TWSE_MIN_INTERVAL_MS = 1300;
/** 200日均線暖身需要至少210個交易日（見 runTwDailyBatch.ts 的 MIN_BARS_REQUIRED），
 * 比照 tw-backfill.ts 的預設值，留緩衝 */
const BACKFILL_MONTHS = 25;
/** 三大法人買賣超只需要近期窗口（chip score/concentration最多看20日） */
const INSTITUTIONAL_BACKFILL_DAYS = 25;

async function upsertPriceBars(stockId: number, bars: OhlcvBar[]) {
  for (const bar of bars) {
    await prisma.twDailyPrice.upsert({
      where: { stockId_tradeDate: { stockId, tradeDate: new Date(bar.date) } },
      update: { open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: BigInt(Math.round(bar.volume)) },
      create: {
        stockId,
        tradeDate: new Date(bar.date),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: BigInt(Math.round(bar.volume)),
      },
    });
  }
}

/**
 * 單一新股的一次性回補（抽自 scripts/tw-backfill.ts 的批次邏輯，改成可重用函式）。
 * 用途：YouTube影片提到系統還沒追蹤的個股、resolveStockMention.ts自動insert新Stock後，
 * 只是新增一筆Stock還不夠——runTwDailyBatch要求≥210天價格歷史，runTwDailyUpdate的增量
 * 抓取也只碰「已有tw_daily_price紀錄」的股票（見該檔案的backfilledStockIds篩選），
 * 沒有這一步，新股會永遠是空的、系統排程也不會撿到它。
 *
 * 跟tw-backfill.ts的差異：這裡是單一股票即時觸發（不是批次），三大法人改用FinMind
 * 一次請求整個日期區間（比對25天逐日呼叫TWSE T86便宜很多，對單一新股更划算）。
 */
export async function backfillSingleTwStock(stockId: number, ticker: string): Promise<{ priceBars: number; institutionalDays: number }> {
  const throttle = createRateLimiter(TWSE_MIN_INTERVAL_MS);

  let bars = await fetchStockDayHistory(ticker, BACKFILL_MONTHS, throttle);
  let isTpex = false;

  if (bars.length === 0) {
    // TWSE查不到（上櫃股），改用FinMind
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - BACKFILL_MONTHS * 30 * 86_400_000).toISOString().slice(0, 10);
    bars = await fetchFinMindStockPrice(ticker, startDate, endDate);
    isTpex = true;
  }

  if (bars.length === 0) {
    console.error(`[backfillSingleTwStock] no price history found for ${ticker} (TWSE or FinMind)`);
    return { priceBars: 0, institutionalDays: 0 };
  }

  await upsertPriceBars(stockId, bars);

  const instEndDate = new Date().toISOString().slice(0, 10);
  const instStartDate = new Date(Date.now() - INSTITUTIONAL_BACKFILL_DAYS * 86_400_000).toISOString().slice(0, 10);
  const instByDate = await fetchFinMindInstitutionalTrading(ticker, instStartDate, instEndDate);

  let institutionalDays = 0;
  for (const [date, inst] of instByDate) {
    const priceBar = bars.find((b) => b.date === date);
    const totalVolumeShares = priceBar ? BigInt(Math.round(priceBar.volume / 1000)) : BigInt(0);
    await prisma.twInstitutionalTrading.upsert({
      where: { stockId_tradeDate: { stockId, tradeDate: new Date(date) } },
      update: {
        foreignNetBuyShares: BigInt(inst.foreignNetBuyShares),
        investTrustNetBuyShares: BigInt(inst.investTrustNetBuyShares),
        dealerNetBuyShares: BigInt(inst.dealerNetBuyShares),
        totalVolumeShares,
      },
      create: {
        stockId,
        tradeDate: new Date(date),
        foreignNetBuyShares: BigInt(inst.foreignNetBuyShares),
        investTrustNetBuyShares: BigInt(inst.investTrustNetBuyShares),
        dealerNetBuyShares: BigInt(inst.dealerNetBuyShares),
        totalVolumeShares,
      },
    });
    institutionalDays++;
  }

  console.log(
    `[backfillSingleTwStock] ${ticker}${isTpex ? " (TPEx via FinMind)" : ""}: ${bars.length} price bars, ${institutionalDays} institutional days`
  );
  return { priceBars: bars.length, institutionalDays };
}
