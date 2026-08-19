/**
 * 手動觸發一次法人報告批次（發現新文章+解析待處理文章，見 runInstitutionalReportIngest.ts）。
 *
 * 用法：npx tsx scripts/tw-fetch-institutional-reports.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { runInstitutionalReportIngestBatch } from "../src/lib/marketData/runInstitutionalReportIngest";

async function main() {
  console.log("Running institutional report ingest batch...");
  const result = await runInstitutionalReportIngestBatch();
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
