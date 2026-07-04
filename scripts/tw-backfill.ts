/**
 * 台股真實資料歷史回填：抓 TWSE 個股日線（~25個月）+ TAIEX 大盤指數 + 最近~25個交易日三大法人買賣超，
 * 存進 tw_daily_price / tw_institutional_trading。只處理 TWSE 上市股票，TPEx 上櫃股票
 * （目前資料庫裡約 23 檔）目前沒有歷史 API 可回填，會被跳過並列在最後的清單裡。
 *
 * 這是一次性/低頻的重量級操作（62檔 x 25個月 ≈ 1550 次請求），會跑 30-40 分鐘以上，
 * 建議背景執行。之後的每日更新用 scripts/tw-daily-batch.ts，很輕量。
 *
 * 用法：
 *   npx tsx scripts/tw-backfill.ts                 // 跑全部 active TW 股票
 *   npx tsx scripts/tw-backfill.ts 2330,2454,6640   // 只跑指定 ticker（逗號分隔），小規模驗證用
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  fetchStockDayHistory,
  fetchTaiexHistory,
  fetchInstitutionalTradingByDate,
} from "../src/lib/marketData/twseClient";
import { createRateLimiter } from "../src/lib/marketData/rateLimiter";
import type { OhlcvBar } from "../src/lib/trend/types";

const BACKFILL_MONTHS = 25;
/** TWSE 沒有公開明確 rate limit，保守間隔避免對政府伺服器造成負擔 */
const TWSE_MIN_INTERVAL_MS = 1300;
/** 三大法人買賣超只需要近期窗口（chip score/concentration 最多看20日），不用回填2年 */
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

async function main() {
  const throttle = createRateLimiter(TWSE_MIN_INTERVAL_MS);

  const taiexStock = await prisma.stock.findUnique({
    where: { market_ticker: { market: "TW", ticker: "TAIEX" } },
  });
  if (!taiexStock) {
    throw new Error('找不到 TAIEX 合成股票紀錄，先跑 `npx prisma db seed`。');
  }

  console.log(`Backfilling TAIEX (${BACKFILL_MONTHS} months)...`);
  const taiexBars = await fetchTaiexHistory(BACKFILL_MONTHS, throttle, (i, total) =>
    process.stdout.write(`  month ${i}/${total}\r`)
  );
  console.log(`\nGot ${taiexBars.length} TAIEX bars.`);
  await upsertPriceBars(taiexStock.id, taiexBars);

  const tickerFilter = process.argv[2] ? process.argv[2].split(",").map((t) => t.trim()) : null;
  const stocks = await prisma.stock.findMany({
    where: { market: "TW", isActive: true, ...(tickerFilter ? { ticker: { in: tickerFilter } } : {}) },
    select: { id: true, ticker: true, companyName: true },
  });

  const onTwse: { id: number; ticker: string }[] = [];
  const notOnTwse: { ticker: string; companyName: string }[] = [];
  const failed: { ticker: string; companyName: string; error: string }[] = [];

  for (const stock of stocks) {
    console.log(`Backfilling ${stock.ticker} ${stock.companyName}...`);
    try {
      const bars = await fetchStockDayHistory(stock.ticker, BACKFILL_MONTHS, throttle, (i, total) =>
        process.stdout.write(`  month ${i}/${total}\r`)
      );
      console.log(`\n  got ${bars.length} bars`);

      if (bars.length === 0) {
        notOnTwse.push({ ticker: stock.ticker, companyName: stock.companyName });
        continue;
      }

      await upsertPriceBars(stock.id, bars);
      onTwse.push({ id: stock.id, ticker: stock.ticker });
    } catch (err) {
      // 單一股票失敗（重試也救不回來）不該讓整支回填腳本死掉，記錄下來跳過，跑完再看要不要針對這幾檔重跑
      console.error(`\n  FAILED, skipping: ${(err as Error).message}`);
      failed.push({ ticker: stock.ticker, companyName: stock.companyName, error: (err as Error).message });
    }
  }

  console.log(
    `\nPrice backfill done. ${onTwse.length} on TWSE, ${notOnTwse.length} not found (likely TPEx/上櫃), ${failed.length} failed (retry these).`
  );
  if (failed.length > 0) {
    console.log("Failed (retry with these tickers):", failed.map((s) => s.ticker).join(","));
  }
  if (notOnTwse.length > 0) {
    console.log("Not found on TWSE:", notOnTwse.map((s) => `${s.ticker} ${s.companyName}`).join(", "));
  }

  // 三大法人買賣超：涵蓋資料庫裡「所有已經有股價資料」的股票（不只是這次跑的子集），
  // 避免之前的回填批次已經有股價、但這次分開跑導致三大法人漏掉的情況
  const allPricedStocks = await prisma.twDailyPrice.groupBy({ by: ["stockId"], _count: true });
  const stocksWithPrice = await prisma.stock.findMany({
    where: { id: { in: allPricedStocks.map((s) => s.stockId) }, ticker: { not: "TAIEX" } },
    select: { id: true, ticker: true },
  });

  // 只需要近期窗口，用 TAIEX 的交易日曆決定要抓哪幾天（TWSE 全市場共用同一套交易日）
  const recentDates = [...new Set(taiexBars.map((b) => b.date))].sort().slice(-INSTITUTIONAL_BACKFILL_DAYS);
  console.log(
    `\nBackfilling institutional trading for ${recentDates.length} recent trading days x ${stocksWithPrice.length} priced stocks...`
  );

  const stockIdByTicker = new Map(stocksWithPrice.map((s) => [s.ticker, s.id]));
  let instRowsWritten = 0;

  for (const date of recentDates) {
    const dateStr = date.replace(/-/g, "");
    await throttle();
    let instMap: Awaited<ReturnType<typeof fetchInstitutionalTradingByDate>>;
    try {
      instMap = await fetchInstitutionalTradingByDate(dateStr);
    } catch (err) {
      console.error(`  ${date}: FAILED, skipping this day: ${(err as Error).message}`);
      continue;
    }

    for (const [ticker, stockId] of stockIdByTicker) {
      const inst = instMap.get(ticker);
      if (!inst) continue;

      const priceRow = await prisma.twDailyPrice.findUnique({
        where: { stockId_tradeDate: { stockId, tradeDate: new Date(date) } },
      });
      const totalVolumeShares = priceRow ? BigInt(Math.round(Number(priceRow.volume) / 1000)) : BigInt(0);

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
      instRowsWritten++;
    }
    console.log(`  ${date}: done`);
  }

  console.log(`\nDone. ${onTwse.length} TWSE stocks backfilled, ${instRowsWritten} institutional trading rows written.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
