import { prisma } from "@/lib/prisma";
import type { KeyMetric, MentionSentiment, SupplyChainLayer } from "./parseInstitutionalReport";

const LOOKBACK_DAYS = 30;

export interface InstitutionalReportMentionOverview {
  ticker: string;
  companyName: string;
  sentiment: MentionSentiment | null;
  chainLayer: SupplyChainLayer | null;
  role: string | null;
}

export interface InstitutionalReportOverviewItem {
  postId: string;
  title: string;
  publishDate: string;
  category: string;
  sourceName: string;
  sourceUrl: string;
  /** null=還沒被LLM解析（待解析，只有原文連結），見runInstitutionalReportIngest.ts說明 */
  industryTheme: string | null;
  summary: string | null;
  signal: "positive" | "neutral" | "negative" | null;
  /** 2026-08-21新增（Trend Core風格結構化解析）：null=舊資料（用舊版prompt解析過，
   * 或還沒解析），空陣列=新版prompt解析過但文章沒有明確數字可以萃取 */
  keyMetrics: KeyMetric[] | null;
  bullCoreLogic: string | null;
  bullTrigger: string | null;
  bearCoreLogic: string | null;
  bearBottleneck: string | null;
  tags: string[] | null;
  mentionedStocks: InstitutionalReportMentionOverview[];
}

export interface InstitutionalReportsOverview {
  asOfDays: number;
  pendingCount: number;
  items: InstitutionalReportOverviewItem[];
}

/** 給 /tw/institutional-reports 頁面用：近30天的法人報告文章（目前只接玉山證券「台股熱點」
 * 「總經盤勢」，見esunsecClient.ts），含尚未被LLM解析的「待解析」項目。用天數而不是像
 * queryFundamentalsOverview.ts那樣用月份——這類內容是每天發布的市場評論，不是季報，
 * 3個月前的產業評論參考價值有限，30天窗口更貼近「近期」的意思。 */
export async function queryInstitutionalReportsOverview(): Promise<InstitutionalReportsOverview> {
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);

  const rows = await prisma.institutionalReportArticle.findMany({
    where: { publishDate: { gte: cutoff } },
    orderBy: { publishDate: "desc" },
    include: { mentions: { include: { stock: { select: { ticker: true, companyName: true } } } } },
  });

  const items: InstitutionalReportOverviewItem[] = rows.map((r) => ({
    postId: r.postId,
    title: r.title,
    publishDate: r.publishDate.toISOString().slice(0, 10),
    category: r.category,
    sourceName: r.sourceName,
    sourceUrl: r.sourceUrl,
    industryTheme: r.industryTheme,
    summary: r.summary,
    signal: r.signal,
    keyMetrics: r.keyMetrics as unknown as KeyMetric[] | null,
    bullCoreLogic: r.bullCoreLogic,
    bullTrigger: r.bullTrigger,
    bearCoreLogic: r.bearCoreLogic,
    bearBottleneck: r.bearBottleneck,
    tags: r.tags as unknown as string[] | null,
    mentionedStocks: r.mentions
      .filter((m) => m.stock !== null)
      .map((m) => ({
        ticker: m.stock!.ticker,
        companyName: m.stock!.companyName,
        sentiment: m.sentiment,
        chainLayer: m.chainLayer,
        role: m.role,
      })),
  }));

  const pendingCount = items.filter((item) => item.signal === null).length;

  return { asOfDays: LOOKBACK_DAYS, pendingCount, items };
}
