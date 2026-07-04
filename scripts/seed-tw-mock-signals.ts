/**
 * 獨立跑台股版「假資料訊號」seeding（技術面+籌碼面），只用於本地開發/demo。
 * 之後接上 TWSE/TPEx OpenAPI 真實資料後，不要在已經有真實資料的股票上跑這個（會覆蓋掉）。
 *
 * 用法：npx tsx scripts/seed-tw-mock-signals.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { seedTwDailySignals } from "../prisma/seedTwDailySignals";

seedTwDailySignals()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
