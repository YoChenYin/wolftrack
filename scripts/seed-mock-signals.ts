/**
 * 獨立跑「假資料訊號」seeding（原本掛在 `npx prisma db seed` 裡，現在拆出來）。
 * 只用於本地開發/demo，沒有 Polygon API key 時可以用這個看三欄戰術面板長什麼樣子。
 * 注意：這會 upsert daily_trend_signals，如果該 ticker 已經有真實資料（跑過
 * `npm run market:batch`），這支腳本會把它蓋回假資料 —— 除非你知道自己在做什麼，否則不要在
 * 已經接上真實資料的股票上跑這個。
 *
 * 用法：npx tsx scripts/seed-mock-signals.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { seedDailyTrendSignals } from "../prisma/seedDailySignals";

seedDailyTrendSignals()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
