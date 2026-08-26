/**
 * 「歷史相似情境統計」回測：把MA5/10/20排列狀態+近20日籌碼集中度分箱交叉，回溯套用到歷史
 * 每一個交易日，記錄組合切換事件+往後5/10/20/40/60個交易日報酬率，寫進tw_scenario_backtest_events。
 *
 * 用法：
 *   npx tsx scripts/tw-run-scenario-backtest.ts                  // 跑全部台股（會花較長時間）
 *   npx tsx scripts/tw-run-scenario-backtest.ts 2330,2454,2317   // 只跑指定股票（測效能/除錯用）
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { runTwScenarioBacktest } from "../src/lib/marketData/runTwScenarioBacktest";

async function main() {
  const tickerFilter = process.argv[2] ? process.argv[2].split(",").map((t) => t.trim()) : undefined;
  const startedAt = Date.now();
  const result = await runTwScenarioBacktest(tickerFilter);
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
