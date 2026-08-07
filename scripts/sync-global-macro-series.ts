/**
 * Decision Lab 全球市場+波動度參考序列同步（SPX/NASDAQ/DOW/BTC/WTI/DXY/US10Y/US2Y/VIX）。
 * 這支腳本同時是一次性回填跟每日更新（FRED每次都回傳完整歷史範圍，upsert天然冪等）。
 * 用法：npx tsx scripts/sync-global-macro-series.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { syncGlobalMacroSeries } from "../src/lib/marketData/globalMacroSeries";

async function main() {
  const results = await syncGlobalMacroSeries();
  for (const r of results) {
    if (r.error) console.error(`[${r.ticker}] FAILED: ${r.error}`);
    else console.log(`[${r.ticker}] upserted ${r.written} rows`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
