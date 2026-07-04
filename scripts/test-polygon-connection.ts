/**
 * 快速測試 Polygon.io API key 能不能用，不寫入資料庫。
 * 用法：npx tsx scripts/test-polygon-connection.ts [TICKER]
 */
import "dotenv/config";
import { fetchDailyBars } from "../src/lib/marketData/polygonClient";

async function main() {
  const ticker = process.argv[2] ?? "AAPL";
  console.log(`Fetching last 30 days of ${ticker} from Polygon.io...`);
  const bars = await fetchDailyBars(ticker, { fromDaysAgo: 30 });
  console.log(`OK — got ${bars.length} bars.`);
  console.log("Last 5:", bars.slice(-5));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
