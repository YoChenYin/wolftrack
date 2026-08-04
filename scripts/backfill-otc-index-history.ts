/**
 * 櫃買指數（TPEx OTC Index）歷史回填（一次性）：TWSE 官方 API 沒有這個指數，改用 FinMind
 * （data_id="TPEx"，dataset=TaiwanStockPrice），一次請求就能拿到整段歷史，不用像 TAIEX
 * 逐月請求。用途跟 backfill-taiex-history.ts 一樣，是給總經頁「歷年月份表現」拿來對照
 * TAIEX（上市大盤）的上櫃大盤參考序列。
 *
 * 前置：stocks 表要先有 ticker="TPEX" 的合成股票紀錄（見 prisma/seedTw.ts），
 * 本地資料庫如果還沒有，先跑一次 `npx prisma db seed`。
 *
 * 用法：npx tsx scripts/backfill-otc-index-history.ts [startDate=2005-01-01]
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fetchFinMindStockPrice } from "../src/lib/marketData/finmindClient";

const START_DATE = process.argv[2] ?? "2005-01-01";

async function main() {
  const otcStock = await prisma.stock.findUnique({
    where: { market_ticker: { market: "TW", ticker: "TPEX" } },
  });
  if (!otcStock) {
    throw new Error('找不到 TPEX（櫃買指數）合成股票紀錄，先跑 `npx prisma db seed`。');
  }

  const endDate = new Date().toISOString().slice(0, 10);
  console.log(`Fetching TPEx OTC index from FinMind (${START_DATE} ~ ${endDate})...`);
  const bars = await fetchFinMindStockPrice("TPEx", START_DATE, endDate);
  console.log(`Got ${bars.length} bars, upserting...`);

  let written = 0;
  for (const bar of bars) {
    await prisma.twDailyPrice.upsert({
      where: { stockId_tradeDate: { stockId: otcStock.id, tradeDate: new Date(bar.date) } },
      update: { open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: BigInt(Math.round(bar.volume)) },
      create: {
        stockId: otcStock.id,
        tradeDate: new Date(bar.date),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: BigInt(Math.round(bar.volume)),
      },
    });
    written++;
    if (written % 200 === 0) process.stdout.write(`  upserted ${written}/${bars.length}\r`);
  }
  console.log(`\nDone. Upserted ${written} TPEX (OTC index) rows.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
