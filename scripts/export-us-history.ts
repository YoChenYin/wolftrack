/**
 * 美股ML研究用：把Polygon的歷史日線OHLCV匯出成CSV，交給Python那邊做特徵工程/訓練/回測。
 * 用既有的fetchDailyBars()（已經處理好auth/timeout），不在Python那邊重複實作一套Polygon client。
 *
 * 用法：npx tsx scripts/export-us-history.ts [ticker1,ticker2,...] [yearsBack]
 * 預設：MU,NVDA,SPY（SPY當benchmark），回看8年
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { fetchDailyBars } from "../src/lib/marketData/polygonClient";
import { createRateLimiter } from "../src/lib/marketData/rateLimiter";

const OUTPUT_DIR = "scripts/ml-research/data";
/** 跟runUsDailyBatch.ts同一個節流間隔，Polygon免費方案5 requests/分鐘 */
const POLYGON_MIN_INTERVAL_MS = 13_000;

async function main() {
  const tickers = (process.argv[2] ?? "MU,NVDA,SPY").split(",").map((t) => t.trim());
  const yearsBack = Number(process.argv[3] ?? 8);
  const fromDaysAgo = Math.round(yearsBack * 365.25);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const throttle = createRateLimiter(POLYGON_MIN_INTERVAL_MS);

  for (const ticker of tickers) {
    await throttle();
    console.log(`fetching ${ticker} (${yearsBack} years back)...`);
    const bars = await fetchDailyBars(ticker, { fromDaysAgo });
    console.log(`  got ${bars.length} bars, ${bars[0]?.date} ~ ${bars[bars.length - 1]?.date}`);

    const header = "date,open,high,low,close,volume\n";
    const rows = bars.map((b) => `${b.date},${b.open},${b.high},${b.low},${b.close},${b.volume}`).join("\n");
    const path = `${OUTPUT_DIR}/${ticker}.csv`;
    writeFileSync(path, header + rows + "\n");
    console.log(`  wrote ${path}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
