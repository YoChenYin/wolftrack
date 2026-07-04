/**
 * 快速測試 TWSE 資料源，不寫入資料庫。
 * 用法：npx tsx scripts/test-twse-connection.ts [stockNo]
 */
import {
  fetchStockDayHistory,
  fetchInstitutionalTradingByDate,
  fetchAllStocksToday,
} from "../src/lib/marketData/twseClient";
import { createRateLimiter } from "../src/lib/marketData/rateLimiter";

async function main() {
  const stockNo = process.argv[2] ?? "2330";
  const throttle = createRateLimiter(1500);

  console.log(`Fetching 3 months of ${stockNo}...`);
  const bars = await fetchStockDayHistory(stockNo, 3, throttle, (i, total) => console.log(`  month ${i}/${total}`));
  console.log(`Got ${bars.length} bars. Last 3:`, bars.slice(-3));

  console.log("\nFetching today's all-stock snapshot...");
  const today = await fetchAllStocksToday();
  console.log(`Got ${today.size} stocks. ${stockNo}:`, today.get(stockNo));

  const recentDate = bars[bars.length - 1]?.date.replace(/-/g, "");
  console.log(`\nFetching institutional trading for ${recentDate}...`);
  const inst = await fetchInstitutionalTradingByDate(recentDate);
  console.log(`Got ${inst.size} stocks. ${stockNo}:`, inst.get(stockNo));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
