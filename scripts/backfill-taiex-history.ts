/**
 * TAIEX 大盤指數長期歷史回填（一次性）：只補 TAIEX 本身，不動個股/三大法人，
 * 用途是給總經頁「台股歷年月份表現」季節性分析用——tw-backfill.ts 預設只抓 25 個月，
 * 樣本數不足以看季節性，這裡改用更長的月數（預設 240 個月=20年）。
 * TWSE MI_5MINS_HIST 這支 API 實測至少回溯到 2000 年都有資料。
 *
 * 用法：npx tsx scripts/backfill-taiex-history.ts [months=240]
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fetchTaiexHistory } from "../src/lib/marketData/twseClient";
import { createRateLimiter } from "../src/lib/marketData/rateLimiter";

const MONTHS = process.argv[2] ? Number(process.argv[2]) : 240;
const TWSE_MIN_INTERVAL_MS = 1300;

async function main() {
  const taiexStock = await prisma.stock.findUnique({
    where: { market_ticker: { market: "TW", ticker: "TAIEX" } },
  });
  if (!taiexStock) {
    throw new Error('找不到 TAIEX 合成股票紀錄，先跑 `npx prisma db seed`。');
  }

  const throttle = createRateLimiter(TWSE_MIN_INTERVAL_MS);
  console.log(`Backfilling TAIEX (${MONTHS} months, ~${(MONTHS / 12).toFixed(1)} years)...`);
  const bars = await fetchTaiexHistory(MONTHS, throttle, (i, total) => process.stdout.write(`  month ${i}/${total}\r`));
  console.log(`\nGot ${bars.length} bars, upserting...`);

  let written = 0;
  for (const bar of bars) {
    await prisma.twDailyPrice.upsert({
      where: { stockId_tradeDate: { stockId: taiexStock.id, tradeDate: new Date(bar.date) } },
      update: { open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: BigInt(Math.round(bar.volume)) },
      create: {
        stockId: taiexStock.id,
        tradeDate: new Date(bar.date),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: BigInt(Math.round(bar.volume)),
      },
    });
    written++;
    if (written % 100 === 0) process.stdout.write(`  upserted ${written}/${bars.length}\r`);
  }
  console.log(`\nDone. Upserted ${written} TAIEX rows.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
