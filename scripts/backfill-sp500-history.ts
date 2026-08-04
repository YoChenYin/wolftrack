/**
 * S&P 500 指數歷史回填（一次性）：用 FRED 的 SP500 官方序列（免金鑰，見 fredClient.ts），
 * 受 FRED 授權限制只能回溯約 10 年，但對總經頁「歷年月份表現」季節性分析拿美股當對照組
 * 已經足夠（需求是至少5年）。存進 tw_daily_price（沿用 TAIEX/TPEX 的合成股票紀錄模式，
 * 只是這次是美股 market="US" 的 SPX，見 seed.ts 的說明）。
 *
 * 前置：stocks 表要先有 market="US", ticker="SPX" 的合成股票紀錄（見 prisma/seed.ts），
 * 本地資料庫如果還沒有，先跑一次 `npx prisma db seed`。
 *
 * 用法：npx tsx scripts/backfill-sp500-history.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fetchFredSeries } from "../src/lib/marketData/fredClient";

async function main() {
  const spxStock = await prisma.stock.findUnique({
    where: { market_ticker: { market: "US", ticker: "SPX" } },
  });
  if (!spxStock) {
    throw new Error('找不到 SPX（S&P 500）合成股票紀錄，先跑 `npx prisma db seed`。');
  }

  console.log("Fetching SP500 series from FRED...");
  const observations = await fetchFredSeries("SP500");
  console.log(`Got ${observations.length} observations (${observations[0]?.date} ~ ${observations[observations.length - 1]?.date}), upserting...`);

  let written = 0;
  for (const obs of observations) {
    await prisma.twDailyPrice.upsert({
      where: { stockId_tradeDate: { stockId: spxStock.id, tradeDate: new Date(obs.date) } },
      // FRED 只提供每日收盤指數值，沒有OHLC/成交量，四個價格欄位都存同一個值、volume=0
      update: { open: obs.value, high: obs.value, low: obs.value, close: obs.value },
      create: {
        stockId: spxStock.id,
        tradeDate: new Date(obs.date),
        open: obs.value,
        high: obs.value,
        low: obs.value,
        close: obs.value,
        volume: BigInt(0),
      },
    });
    written++;
    if (written % 200 === 0) process.stdout.write(`  upserted ${written}/${observations.length}\r`);
  }
  console.log(`\nDone. Upserted ${written} SPX (S&P 500) rows.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
