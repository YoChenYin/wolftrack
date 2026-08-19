/**
 * 抓台股個股季度累積EPS快照（TWSE t187ap14_L + TPEx mopsfin_t187ap14_O，各一次請求拿全部公司），
 * 存進 tw_quarterly_eps。端點只回傳「最新一期」，不能查歷史區間，多季歷史靠每次排程執行
 * 自然累積（見 fetchTwQuarterlyEps.ts 說明），可以隨時重跑更新成最新值。
 *
 * 用法：npx tsx scripts/tw-fetch-quarterly-eps.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fetchTwQuarterlyEpsSnapshot } from "../src/lib/marketData/fetchTwQuarterlyEps";

async function main() {
  console.log("Fetching TW quarterly cumulative EPS snapshot (TWSE + TPEx)...");
  const result = await fetchTwQuarterlyEpsSnapshot();
  console.log(`Done. wrote ${result.written} rows, skipped ${result.skipped} (no EPS data found).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
