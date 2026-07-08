/**
 * 上櫃（TPEx）股票歷史回填，走 FinMind（見 src/lib/marketData/finmindClient.ts 開頭註解說明
 * 為什麼 TWSE/TPEx 官方 API 都補不了這塊）。跟 scripts/tw-backfill.ts 寫進同一組表
 * （tw_daily_price / tw_institutional_trading），下游的 tw-daily-batch.ts / 台股頁面完全不用改。
 *
 * FinMind 一檔股票、一個資料集只要 1 次請求就能拿到整個日期區間（不像 TWSE STOCK_DAY 要逐月拿），
 * 23 檔 x 2 個資料集 = 46 次請求，幾秒內就能跑完，遠低於免費額度（300次/小時）。
 *
 * 用法：
 *   npx tsx scripts/tpex-backfill.ts                 // 自動找出目前完全沒有 tw_daily_price 的 TW 股票
 *   npx tsx scripts/tpex-backfill.ts 6223,4573        // 只跑指定 ticker（逗號分隔），小規模驗證用
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fetchFinMindStockPrice, fetchFinMindInstitutionalTrading } from "../src/lib/marketData/finmindClient";
import { createRateLimiter } from "../src/lib/marketData/rateLimiter";

/** 免費額度 300次/小時 ≈ 12秒一次，抓寬鬆一點避免撞到限制 */
const FINMIND_MIN_INTERVAL_MS = 1000;
const BACKFILL_DAYS = 760; // ~25個月，跟 scripts/tw-backfill.ts 預設深度一致

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const throttle = createRateLimiter(FINMIND_MIN_INTERVAL_MS);

  const tickerFilter = process.argv[2] ? process.argv[2].split(",").map((t) => t.trim()) : null;

  let stocks: { id: number; ticker: string; companyName: string }[];
  if (tickerFilter) {
    stocks = await prisma.stock.findMany({
      where: { market: "TW", isActive: true, ticker: { in: tickerFilter } },
      select: { id: true, ticker: true, companyName: true },
    });
  } else {
    const pricedStockIds = new Set(
      (await prisma.twDailyPrice.groupBy({ by: ["stockId"] })).map((r) => r.stockId)
    );
    const allTw = await prisma.stock.findMany({
      where: { market: "TW", isActive: true, ticker: { not: "TAIEX" } },
      select: { id: true, ticker: true, companyName: true },
    });
    stocks = allTw.filter((s) => !pricedStockIds.has(s.id));
  }

  console.log(`Backfilling ${stocks.length} TPEx stocks via FinMind...`);

  const endDate = toDateStr(new Date());
  const startDate = toDateStr(new Date(Date.now() - BACKFILL_DAYS * 86_400_000));

  const succeeded: string[] = [];
  const failed: { ticker: string; companyName: string; error: string }[] = [];
  const noData: { ticker: string; companyName: string }[] = [];

  for (const stock of stocks) {
    console.log(`Backfilling ${stock.ticker} ${stock.companyName}...`);
    try {
      await throttle();
      const bars = await fetchFinMindStockPrice(stock.ticker, startDate, endDate);
      if (bars.length === 0) {
        noData.push({ ticker: stock.ticker, companyName: stock.companyName });
        continue;
      }
      for (const bar of bars) {
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
      }
      console.log(`  got ${bars.length} price bars`);

      await throttle();
      const instByDate = await fetchFinMindInstitutionalTrading(stock.ticker, startDate, endDate);
      const barByDate = new Map(bars.map((b) => [b.date, b]));
      let instRows = 0;
      for (const [date, inst] of instByDate) {
        const priceBar = barByDate.get(date);
        if (!priceBar) continue;
        await prisma.twInstitutionalTrading.upsert({
          where: { stockId_tradeDate: { stockId: stock.id, tradeDate: new Date(date) } },
          update: {
            foreignNetBuyShares: BigInt(inst.foreignNetBuyShares),
            investTrustNetBuyShares: BigInt(inst.investTrustNetBuyShares),
            dealerNetBuyShares: BigInt(inst.dealerNetBuyShares),
            totalVolumeShares: BigInt(Math.round(priceBar.volume / 1000)),
          },
          create: {
            stockId: stock.id,
            tradeDate: new Date(date),
            foreignNetBuyShares: BigInt(inst.foreignNetBuyShares),
            investTrustNetBuyShares: BigInt(inst.investTrustNetBuyShares),
            dealerNetBuyShares: BigInt(inst.dealerNetBuyShares),
            totalVolumeShares: BigInt(Math.round(priceBar.volume / 1000)),
          },
        });
        instRows++;
      }
      console.log(`  got ${instRows} institutional trading rows`);

      succeeded.push(stock.ticker);
    } catch (err) {
      console.error(`  FAILED, skipping: ${(err as Error).message}`);
      failed.push({ ticker: stock.ticker, companyName: stock.companyName, error: (err as Error).message });
    }
  }

  console.log(
    `\nDone. ${succeeded.length} succeeded, ${noData.length} no data (delisted/wrong ticker?), ${failed.length} failed.`
  );
  if (noData.length > 0) {
    console.log("No data:", noData.map((s) => `${s.ticker} ${s.companyName}`).join(", "));
  }
  if (failed.length > 0) {
    console.log("Failed (retry with these tickers):", failed.map((s) => s.ticker).join(","));
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
