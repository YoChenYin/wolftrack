/**
 * 台股每日異動報告v1：算「今天 vs 上一個交易日」的戰術分類轉換/支撐壓力突破/法人成本翻轉，
 * 寫進 tw_daily_market_report。預設自動抓daily_trend_signals裡最新兩個交易日；也可以手動指定
 * 日期補跑歷史某一天（例如本機dev DB資料較舊，想測試有實際變化的那幾天）。
 *
 * 用法：
 *   npx tsx scripts/tw-generate-daily-report.ts                          // 自動抓最新兩天
 *   npx tsx scripts/tw-generate-daily-report.ts 2026-07-08 2026-07-06    // 手動指定 今天 昨天
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { generateDailyReport } from "../src/lib/trend/tw/generateDailyReport";

async function main() {
  const [reportDate, prevTradeDate] = process.argv.slice(2);
  const explicitDates = reportDate && prevTradeDate ? { reportDate, prevTradeDate } : undefined;

  const result = await generateDailyReport(explicitDates);
  if (result.status === "insufficient-history") {
    console.log("daily_trend_signals歷史不足兩個交易日，沒有產生報告");
    return;
  }
  console.log(
    `寫入${result.reportDate}的異動報告：戰術分類轉換${result.categoryTransitions}筆、支撐壓力突破${result.breakouts}筆、法人成本翻轉${result.costBasisCrossovers}筆`
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
