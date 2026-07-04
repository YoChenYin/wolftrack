import { prisma } from "@/lib/prisma";
import { fetchValuationAllToday } from "./twseClient";

export interface TwValuationFetchResult {
  written: number;
  skipped: number;
}

/**
 * 抓 TWSE 個股本益比/股價淨值比快照（BWIBBU_ALL），存進 tw_stock_fundamentals。
 * 由 scripts/tw-fetch-valuation.ts（CLI）和 runTwDailyUpdate()（排程用）共用。
 */
export async function fetchTwValuationSnapshot(): Promise<TwValuationFetchResult> {
  const stocks = await prisma.stock.findMany({
    where: { market: "TW", isActive: true, ticker: { not: "TAIEX" } },
    select: { id: true, ticker: true },
  });

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

  return { written, skipped };
}
