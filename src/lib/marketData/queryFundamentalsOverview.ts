import { prisma } from "@/lib/prisma";
import { findIndustryThemesForTicker } from "@/lib/valuation/groupConfig";

const LOOKBACK_MONTHS = 3;

export interface FundamentalsOverviewItem {
  ticker: string;
  companyName: string;
  themes: string[];
  conferenceDate: string;
  profitGrowthSummary: string;
  outlookSummary: string;
  riskSummary: string;
  signal: "positive" | "neutral" | "negative";
}

export interface FundamentalsOverview {
  asOfMonths: number;
  signalCounts: { positive: number; neutral: number; negative: number };
  items: FundamentalsOverviewItem[];
}

/** 給 /fundamentals 頁面用：近3個月龍頭+二軍股票的法說會基本面訊號總覽，見
 * runEarningsCallAnalysis.ts / getLeaderAndSecondTierTickers()。 */
export async function queryFundamentalsOverview(): Promise<FundamentalsOverview> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - LOOKBACK_MONTHS);

  const rows = await prisma.earningsCallAnalysis.findMany({
    where: { conferenceDate: { gte: cutoff } },
    orderBy: { conferenceDate: "desc" },
    include: { stock: { select: { ticker: true, companyName: true } } },
  });

  const items: FundamentalsOverviewItem[] = rows.map((r) => ({
    ticker: r.stock.ticker,
    companyName: r.stock.companyName,
    themes: findIndustryThemesForTicker(r.stock.ticker).map((t) => t.theme_name),
    conferenceDate: r.conferenceDate.toISOString().slice(0, 10),
    profitGrowthSummary: r.profitGrowthSummary,
    outlookSummary: r.outlookSummary,
    riskSummary: r.riskSummary,
    signal: r.signal,
  }));

  const signalCounts = { positive: 0, neutral: 0, negative: 0 };
  for (const item of items) signalCounts[item.signal]++;

  return { asOfMonths: LOOKBACK_MONTHS, signalCounts, items };
}
