/**
 * 純技術分析規則回測：黃金/死亡交叉、RSI超賣/超買、MACD轉正/轉負、頭肩底/N字底確認，
 * 回溯套用到台股全市場歷史每一個交易日，記錄anchor day事件+往後5/10/20/40/60個交易日
 * 報酬率，寫進tw_technical_rule_backtest_events。目的是驗證美股半導體那邊測出的
 * 「RSI超賣反彈有超額報酬」訊號，換到台股9-10年、涵蓋多種市場狀態的完整歷史是否依然成立。
 *
 * 用法：
 *   npx tsx scripts/tw-run-technical-rule-backtest.ts                  // 跑全部台股
 *   npx tsx scripts/tw-run-technical-rule-backtest.ts 2330,2454,2317   // 只跑指定股票
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { runTwTechnicalRuleBacktest } from "../src/lib/marketData/runTwTechnicalRuleBacktest";

async function main() {
  const tickerFilter = process.argv[2] ? process.argv[2].split(",").map((t) => t.trim()) : undefined;
  const startedAt = Date.now();
  const result = await runTwTechnicalRuleBacktest(tickerFilter);
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
