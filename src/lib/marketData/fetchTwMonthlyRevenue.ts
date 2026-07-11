import { prisma } from "@/lib/prisma";
import { fetchAllMonthlyRevenue } from "./monthlyRevenueClient";

export interface TwMonthlyRevenueFetchResult {
  written: number;
  skipped: number;
}

/**
 * 抓台股個股月營收快照（TWSE+TPEx 官方彙總表，見 monthlyRevenueClient.ts），存進 tw_monthly_revenue。
 * 由 scripts/tw-fetch-revenue.ts（CLI）呼叫，之後可視需要掛進每日/每月排程——反正端點本身
 * 每次都只回傳「最新一期」，重跑幾次都是同一筆資料 upsert 覆蓋，不會壞掉，只是浪費一次請求。
 */
export async function fetchTwMonthlyRevenueSnapshot(): Promise<TwMonthlyRevenueFetchResult> {
  const stocks = await prisma.stock.findMany({
    where: { market: "TW", isActive: true, ticker: { not: "TAIEX" } },
    select: { id: true, ticker: true },
  });

  const revenueMap = await fetchAllMonthlyRevenue();

  let written = 0;
  let skipped = 0;

  for (const stock of stocks) {
    const revenue = revenueMap.get(stock.ticker);
    if (!revenue) {
      skipped++;
      continue;
    }

    await prisma.twMonthlyRevenue.upsert({
      where: { stockId_revenueMonth: { stockId: stock.id, revenueMonth: new Date(revenue.revenueMonth) } },
      update: {
        revenue: BigInt(Math.round(revenue.revenue)),
        revenuePriorMonth: revenue.revenuePriorMonth !== null ? BigInt(Math.round(revenue.revenuePriorMonth)) : null,
        revenueSameMonthLastYear:
          revenue.revenueSameMonthLastYear !== null ? BigInt(Math.round(revenue.revenueSameMonthLastYear)) : null,
        momGrowthPct: revenue.momGrowthPct,
        yoyGrowthPct: revenue.yoyGrowthPct,
        cumulativeRevenue: revenue.cumulativeRevenue !== null ? BigInt(Math.round(revenue.cumulativeRevenue)) : null,
        cumulativeRevenueLastYear:
          revenue.cumulativeRevenueLastYear !== null ? BigInt(Math.round(revenue.cumulativeRevenueLastYear)) : null,
        cumulativeYoyGrowthPct: revenue.cumulativeYoyGrowthPct,
      },
      create: {
        stockId: stock.id,
        revenueMonth: new Date(revenue.revenueMonth),
        revenue: BigInt(Math.round(revenue.revenue)),
        revenuePriorMonth: revenue.revenuePriorMonth !== null ? BigInt(Math.round(revenue.revenuePriorMonth)) : null,
        revenueSameMonthLastYear:
          revenue.revenueSameMonthLastYear !== null ? BigInt(Math.round(revenue.revenueSameMonthLastYear)) : null,
        momGrowthPct: revenue.momGrowthPct,
        yoyGrowthPct: revenue.yoyGrowthPct,
        cumulativeRevenue: revenue.cumulativeRevenue !== null ? BigInt(Math.round(revenue.cumulativeRevenue)) : null,
        cumulativeRevenueLastYear:
          revenue.cumulativeRevenueLastYear !== null ? BigInt(Math.round(revenue.cumulativeRevenueLastYear)) : null,
        cumulativeYoyGrowthPct: revenue.cumulativeYoyGrowthPct,
      },
    });
    written++;
  }

  return { written, skipped };
}
