import {
  queryInstitutionalReportMentionsForTickers,
  type InstitutionalReportOverviewItem,
} from "@/lib/marketData/queryInstitutionalReportsOverview";
import { queryEarningsCallAnalysesForTickers, type EarningsCallItem } from "@/lib/marketData/queryFundamentalsOverview";
import { fetchStockMentionOverview, type StockMentionOverviewItem } from "@/lib/youtube/queries";

export interface ThemeNarrativeResult {
  institutionalReports: InstitutionalReportOverviewItem[];
  earningsCalls: EarningsCallItem[];
  youtubeMentions: StockMentionOverviewItem[];
}

const NARRATIVE_LOOKBACK_DAYS = 90;

/** 研究簡報的敘事面區塊：把三個已經在ingest、但目前只有單股或無過濾全市場查詢的敘事來源
 * （法人報告/法說會/YouTube提及）合併成一個theme範圍的結果。三個來源分開回傳、不硬拼成一段
 * 文字——UI端各自渲染一個子區塊，沒資料時顯示「近90天無提及」，不是整段消失讓人以為漏了。 */
export async function queryThemeNarrative(tickers: string[], daysBack = NARRATIVE_LOOKBACK_DAYS): Promise<ThemeNarrativeResult> {
  const [institutionalReports, earningsCalls, youtubeMentions] = await Promise.all([
    queryInstitutionalReportMentionsForTickers(tickers, daysBack),
    queryEarningsCallAnalysesForTickers(tickers, Math.ceil(daysBack / 30)),
    fetchStockMentionOverview(daysBack, tickers),
  ]);

  return { institutionalReports, earningsCalls, youtubeMentions };
}
