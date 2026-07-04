/**
 * 計算腳本：輸入某檔股票的歷史日線 OHLCV，輸出當日的 Core Score 和三段分類結果。
 *
 * 用法：
 *   npx tsx scripts/calc-trend-signal.ts <TICKER> <ohlcv.json> [benchmark.json]
 *   npx tsx scripts/calc-trend-signal.ts --demo <TICKER>   // 用內建假資料產生器跑一次示範
 *
 * ohlcv.json 格式：OhlcvBar[]，依日期由舊到新排序，見 src/lib/trend/types.ts
 */
import { readFileSync } from "node:fs";
import { calculateTrendSignal } from "../src/lib/trend/calculateDailySignal";
import type { OhlcvBar } from "../src/lib/trend/types";
import { generateMockOhlcv } from "../src/lib/mock/generateMockOhlcv";

function loadBars(path: string): OhlcvBar[] {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function runDemo(ticker: string) {
  const bars = generateMockOhlcv({
    seed: ticker,
    days: 500,
    startPrice: 100,
    annualDrift: 0.2,
    annualVolatility: 0.35,
  });
  const benchmarkBars = generateMockOhlcv({
    seed: "SPY-benchmark",
    days: 500,
    startPrice: 450,
    annualDrift: 0.1,
    annualVolatility: 0.15,
  });
  const result = calculateTrendSignal(bars, benchmarkBars);
  console.log(JSON.stringify({ ticker, ...result }, null, 2));
}

function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--demo") {
    runDemo(args[1] ?? "DEMO");
    return;
  }

  const [ticker, ohlcvPath, benchmarkPath] = args;
  if (!ticker || !ohlcvPath) {
    console.error("Usage: tsx scripts/calc-trend-signal.ts <TICKER> <ohlcv.json> [benchmark.json]");
    console.error("       tsx scripts/calc-trend-signal.ts --demo <TICKER>");
    process.exit(1);
  }

  const bars = loadBars(ohlcvPath);
  const benchmarkBars = benchmarkPath ? loadBars(benchmarkPath) : undefined;
  const result = calculateTrendSignal(bars, benchmarkBars);
  console.log(JSON.stringify({ ticker, ...result }, null, 2));
}

main();
