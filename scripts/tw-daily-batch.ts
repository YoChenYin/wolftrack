/**
 * 台股真實資料每日批次計算：從 tw_daily_price / tw_institutional_trading 讀回歷史
 * （不重新打 API，只有 tw-daily-update.ts 或 tw-backfill.ts 才會打 API 更新這兩張表），
 * 跑 calculateTwTrendSignalAtIndex，寫進 daily_trend_signals。
 *
 * 用法：
 *   npx tsx scripts/tw-daily-batch.ts                 // 跑全部有回填過歷史的 TW 股票
 *   npx tsx scripts/tw-daily-batch.ts 2330,2454       // 只跑指定 ticker
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { runTwDailyBatch } from "../src/lib/marketData/runTwDailyBatch";

async function main() {
  const tickerFilter = process.argv[2] ? process.argv[2].split(",").map((t) => t.trim()) : undefined;
  const result = await runTwDailyBatch(tickerFilter);
  for (const line of result.log) console.log(line);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
