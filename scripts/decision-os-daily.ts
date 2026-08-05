/**
 * 台指期 Decision OS 每日執行：算八層分數（MVP只有L3/L4/L6）、Gate檢查、風控引擎，寫入 decision_snapshots。
 * 用法：npx tsx scripts/decision-os-daily.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { runDecisionOsDaily } from "../src/lib/decisionOs/runDecisionOsDaily";

async function main() {
  const result = await runDecisionOsDaily();
  console.log(
    `[decision-os] ${result.tradeDate}: totalScore=${result.totalScore}, tier=${result.tierLabel}, gatesTriggered=${result.gatesTriggered}`
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
