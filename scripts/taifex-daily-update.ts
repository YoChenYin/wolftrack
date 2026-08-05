/**
 * 台指期每日更新：抓台指期(TX)近月合約行情 + 選擇權Put/Call比。輕量（2次請求），適合排程每天跑，
 * 也可以手動執行先取得今天的資料。
 *
 * 用法：npx tsx scripts/taifex-daily-update.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { runTaifexDailyUpdate } from "../src/lib/marketData/runTaifexDailyUpdate";

async function main() {
  const result = await runTaifexDailyUpdate();
  console.log(`Futures written: ${result.futuresWritten}, Put/Call ratio days written: ${result.putCallRatioWritten}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
