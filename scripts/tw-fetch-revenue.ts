/**
 * 抓台股個股月營收快照（TWSE t187ap05_L + TPEx mopsfin_t187ap05_O，各一次請求拿全部公司），
 * 存進 tw_monthly_revenue。端點只回傳「最新一期」，不能查歷史區間，多月趨勢靠每次排程執行
 * 自然累積（見 fetchTwMonthlyRevenue.ts 說明），可以隨時重跑更新成最新值。
 *
 * 用法：npx tsx scripts/tw-fetch-revenue.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fetchTwMonthlyRevenueSnapshot } from "../src/lib/marketData/fetchTwMonthlyRevenue";

async function main() {
  console.log("Fetching TW monthly revenue snapshot (TWSE + TPEx)...");
  const result = await fetchTwMonthlyRevenueSnapshot();
  console.log(`Done. wrote ${result.written} rows, skipped ${result.skipped} (no revenue data found).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
