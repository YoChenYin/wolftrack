import { prisma } from "@/lib/prisma";
import { fetchAllQuarterlyEps } from "./quarterlyEpsClient";

export interface TwQuarterlyEpsFetchResult {
  written: number;
  skipped: number;
}

/**
 * 抓台股個股季度累積EPS快照（TWSE+TPEx官方彙總表，見 quarterlyEpsClient.ts），存進
 * tw_quarterly_eps。端點本身每次都只回傳「最新一期」，重跑幾次都是同一筆資料 upsert
 * 覆蓋，不會壞掉，只是浪費一次請求（跟 fetchTwMonthlyRevenue.ts 同一套設計）。
 */
export async function fetchTwQuarterlyEpsSnapshot(): Promise<TwQuarterlyEpsFetchResult> {
  const stocks = await prisma.stock.findMany({
    where: { market: "TW", isActive: true, ticker: { not: "TAIEX" } },
    select: { id: true, ticker: true },
  });

  const epsMap = await fetchAllQuarterlyEps();

  let written = 0;
  let skipped = 0;

  for (const stock of stocks) {
    const eps = epsMap.get(stock.ticker);
    if (!eps) {
      skipped++;
      continue;
    }

    await prisma.twQuarterlyEps.upsert({
      where: {
        stockId_fiscalYear_fiscalQuarter: {
          stockId: stock.id,
          fiscalYear: eps.fiscalYear,
          fiscalQuarter: eps.fiscalQuarter,
        },
      },
      update: {
        reportDate: new Date(eps.reportDate),
        epsCumulative: eps.epsCumulative,
        grossMarginPct: eps.grossMarginPct ?? null,
        operatingMarginPct: eps.operatingMarginPct ?? null,
        pretaxMarginPct: eps.pretaxMarginPct ?? null,
        netMarginPct: eps.netMarginPct ?? null,
      },
      create: {
        stockId: stock.id,
        fiscalYear: eps.fiscalYear,
        fiscalQuarter: eps.fiscalQuarter,
        reportDate: new Date(eps.reportDate),
        epsCumulative: eps.epsCumulative,
        grossMarginPct: eps.grossMarginPct ?? null,
        operatingMarginPct: eps.operatingMarginPct ?? null,
        pretaxMarginPct: eps.pretaxMarginPct ?? null,
        netMarginPct: eps.netMarginPct ?? null,
      },
    });
    written++;
  }

  return { written, skipped };
}
