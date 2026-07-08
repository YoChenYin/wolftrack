import { prisma } from "@/lib/prisma";
import { fetchValuationAllToday } from "./twseClient";
import { fetchFinMindLatestValuation } from "./finmindClient";
import { createRateLimiter } from "./rateLimiter";

const FINMIND_MIN_INTERVAL_MS = 1000;

export interface TwValuationFetchResult {
  written: number;
  skipped: number;
}

/**
 * 抓台股個股本益比/股價淨值比快照，存進 tw_stock_fundamentals。
 * 由 scripts/tw-fetch-valuation.ts（CLI）和 runTwDailyUpdate()（排程用）共用。
 * 主要來源是 TWSE `BWIBBU_ALL`（一次請求拿全部上市股票，見 twseClient.ts），但沒有涵蓋上櫃股，
 * 沒中的股票（幾乎都是上櫃）用 FinMind 逐檔補（見 finmindClient.ts 開頭說明）。
 */
export async function fetchTwValuationSnapshot(): Promise<TwValuationFetchResult> {
  const stocks = await prisma.stock.findMany({
    where: { market: "TW", isActive: true, ticker: { not: "TAIEX" } },
    select: { id: true, ticker: true },
  });

  const valuationMap = await fetchValuationAllToday();
  const throttle = createRateLimiter(FINMIND_MIN_INTERVAL_MS);

  let written = 0;
  let skipped = 0;

  for (const stock of stocks) {
    let valuation = valuationMap.get(stock.ticker);
    if (!valuation) {
      try {
        await throttle();
        valuation = (await fetchFinMindLatestValuation(stock.ticker)) ?? undefined;
      } catch (err) {
        console.error(`[valuation] FinMind fallback failed for ${stock.ticker}: ${(err as Error).message}`);
      }
    }
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
