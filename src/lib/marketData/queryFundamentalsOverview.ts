import { prisma } from "@/lib/prisma";
import { findIndustryThemesForTicker } from "@/lib/valuation/groupConfig";
import { buildMopsPdfUrl } from "./mopsClient";

const LOOKBACK_MONTHS = 3;

export interface FundamentalsOverviewItem {
  ticker: string;
  companyName: string;
  themes: string[];
  conferenceDate: string;
  pdfUrl: string;
  /** null=還沒被LLM解析（待解析，只有PDF連結），見runEarningsCallAnalysis.ts說明 */
  profitGrowthSummary: string | null;
  outlookSummary: string | null;
  riskSummary: string | null;
  signal: "positive" | "neutral" | "negative" | null;
}

export interface FundamentalsOverview {
  asOfMonths: number;
  signalCounts: { positive: number; neutral: number; negative: number };
  /** 已發現簡報但LLM額度還沒排到的篇數，見runEarningsCallAnalysis.ts的發現/解析拆分設計 */
  pendingCount: number;
  items: FundamentalsOverviewItem[];
}

/** 給 /tw/fundamentals 頁面用：近3個月「有分類到板塊的股票」（getAllThemedTickers涵蓋範圍，
 * 見runEarningsCallAnalysis.ts）的法說會基本面訊號總覽，含尚未被LLM解析的「待解析」項目。 */
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
    pdfUrl: buildMopsPdfUrl(r.pdfFileName),
    profitGrowthSummary: r.profitGrowthSummary,
    outlookSummary: r.outlookSummary,
    riskSummary: r.riskSummary,
    signal: r.signal,
  }));

  const signalCounts = { positive: 0, neutral: 0, negative: 0 };
  let pendingCount = 0;
  for (const item of items) {
    if (item.signal === null) pendingCount++;
    else signalCounts[item.signal]++;
  }

  return { asOfMonths: LOOKBACK_MONTHS, signalCounts, pendingCount, items };
}
