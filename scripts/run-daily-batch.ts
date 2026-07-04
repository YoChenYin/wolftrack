/**
 * 真實資料每日批次計算：抓 Polygon.io 歷史日線 -> 算 Core Score / 三段分類 -> 寫進 daily_trend_signals。
 * 用法：
 *   npx tsx scripts/run-daily-batch.ts                 // 跑 stocks 表裡全部 active 股票
 *   npx tsx scripts/run-daily-batch.ts AAPL,NVDA,VRT    // 只跑指定 ticker（逗號分隔），新增股票後補資料用
 *
 * 排程用（Zeabur/GitHub Actions cron）改打 POST /api/cron/us-batch，邏輯共用同一個
 * runUsDailyBatch()，見 src/lib/marketData/runUsDailyBatch.ts。
 *
 * 注意：Polygon.io 免費方案 5 requests/分鐘，這裡用序列化節流器控制；免費方案資料本身也有延遲，
 * 不保證抓得到「今天」的收盤價。
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { runUsDailyBatch } from "../src/lib/marketData/runUsDailyBatch";

async function main() {
  const tickerFilter = process.argv[2]
    ? process.argv[2].split(",").map((t) => t.trim().toUpperCase())
    : undefined;

  const result = await runUsDailyBatch(tickerFilter);
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
