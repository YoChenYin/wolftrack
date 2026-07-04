/**
 * 抓 TWSE 個股本益比/股價淨值比快照（BWIBBU_ALL，一次請求拿全部上市股票），
 * 存進 tw_stock_fundamentals，供應鏈估值比較（Module C）的 PE/PB 資料源。
 * 只存「當下」快照，不用像股價一樣回填歷史，可以隨時重跑更新成最新值。
 *
 * 用法：npx tsx scripts/tw-fetch-valuation.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fetchValuationAllToday } from "../src/lib/marketData/twseClient";

async function main() {
  const stocks = await prisma.stock.findMany({
    where: { market: "TW", isActive: true, ticker: { not: "TAIEX" } },
    select: { id: true, ticker: true },
  });

  console.log("Fetching TWSE valuation snapshot (BWIBBU_ALL)...");
  const valuationMap = await fetchValuationAllToday();

  let written = 0;
  let skipped = 0;

  for (const stock of stocks) {
    const valuation = valuationMap.get(stock.ticker);
    if (!valuation) {
      skipped++;
      continue;
    }

    await prisma.twStockFundamentals.upsert({
      where: { stockId_tradeDate: { stockId: stock.id, tradeDate: new Date(valuation.date) } },
      update: { pe: valuation.pe, pb: valuation.pb, dividendYield: valuation.dividendYield },
      create: {
        stockId: stock.id,
        tradeDate: new Date(valuation.date),
        pe: valuation.pe,
        pb: valuation.pb,
        dividendYield: valuation.dividendYield,
      },
    });
    written++;
  }

  console.log(`Done. wrote ${written} rows, skipped ${skipped} (not found in TWSE valuation snapshot, likely TPEx).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
