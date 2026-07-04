/**
 * 台股「每日增量更新」：只補「今天」一天（不重新回填2年），輕量，適合排程每天跑。
 * 抓當日全市場快照 + 當日三大法人 + TAIEX 最新值，補進快取表，然後重新計算訊號、更新PE/PB。
 *
 * 用法：npx tsx scripts/tw-daily-update.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { runTwDailyUpdate } from "../src/lib/marketData/runTwDailyUpdate";

async function main() {
  const result = await runTwDailyUpdate();
  console.log(`Updated ${result.pricesUpdated} prices, ${result.institutionalUpdated} institutional trading rows.`);
  for (const line of result.batch.log) console.log(line);
  console.log(`Valuation: wrote ${result.valuation.written}, skipped ${result.valuation.skipped}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
