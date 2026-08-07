/**
 * Decision Lab 每日執行：算 M7 Regime / M8 Trading Score / M9 Scenario / M10 Trading Plan，
 * 寫入 macro_daily_snapshots + scenario_forecasts。
 * 用法：npx tsx scripts/decision-lab-daily.ts（跑之前要先跑過 sync-global-macro-series.ts 有資料）
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { runDecisionLabDaily } from "../src/lib/decisionLab/runDecisionLabDaily";

async function main() {
  const result = await runDecisionLabDaily();
  console.log(
    `[decision-lab] ${result.snapshotDate}: regime=${result.regime}, tradingScore=${result.tradingScore}/${result.maxPossibleScore}`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
