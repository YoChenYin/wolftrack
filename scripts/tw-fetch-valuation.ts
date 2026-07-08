/**
 * 抓台股個股本益比/股價淨值比快照（上市股走 TWSE BWIBBU_ALL 一次請求拿全部，
 * 上櫃股用 FinMind 逐檔補，見 fetchTwValuationSnapshot.ts），存進 tw_stock_fundamentals，
 * 供應鏈估值比較（Module C）的 PE/PB 資料源。只存「當下」快照，不用像股價一樣回填歷史，
 * 可以隨時重跑更新成最新值。
 *
 * 用法：npx tsx scripts/tw-fetch-valuation.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fetchTwValuationSnapshot } from "../src/lib/marketData/fetchTwValuationSnapshot";

async function main() {
  console.log("Fetching TW valuation snapshot (TWSE BWIBBU_ALL + FinMind for TPEx)...");
  const result = await fetchTwValuationSnapshot();
  console.log(`Done. wrote ${result.written} rows, skipped ${result.skipped} (no valuation data found on either source).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
