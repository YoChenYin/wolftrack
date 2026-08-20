/**
 * 戰術訊號回測v1：把classifyChipFlow()（投信轉買/合買/轉賣/合賣）+detectBottomPattern()
 * （頭肩底/N字底）回溯套用到歷史每一個交易日，記錄訊號事件+往後5/10/20/40/60個交易日報酬率，
 * 寫進tw_signal_backtest_events。buyDip已經驗證過，不在這次回測範圍內。
 *
 * 用法：
 *   npx tsx scripts/tw-run-signal-backtest.ts                  // 跑全部台股（會花較長時間）
 *   npx tsx scripts/tw-run-signal-backtest.ts 2330,2454,2317   // 只跑指定股票（測效能/除錯用）
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { runTwSignalBacktest } from "../src/lib/marketData/runTwSignalBacktest";

async function main() {
  const tickerFilter = process.argv[2] ? process.argv[2].split(",").map((t) => t.trim()) : undefined;
  const startedAt = Date.now();
  const result = await runTwSignalBacktest(tickerFilter);
  for (const line of result.log) console.log(line);
  console.log(`耗時 ${((Date.now() - startedAt) / 1000).toFixed(1)} 秒`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
