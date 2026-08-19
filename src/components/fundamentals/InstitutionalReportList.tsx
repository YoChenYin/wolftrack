import Link from "next/link";
import { Landmark, FileText } from "lucide-react";
import { Card, SubCard } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { InfoTooltip } from "../InfoTooltip";
import { stripCompanySuffix } from "@/lib/formatCompanyName";
import type { InstitutionalReportOverviewItem, InstitutionalReportsOverview } from "@/lib/marketData/queryInstitutionalReportsOverview";

const SIGNAL_STYLE: Record<string, { label: string; className: string }> = {
  positive: { label: "偏多", className: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-400/10 dark:text-red-400 dark:ring-red-400/20" },
  negative: {
    label: "偏空",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-400 dark:ring-emerald-400/20",
  },
  neutral: { label: "中性", className: "bg-zinc-50 text-zinc-600 ring-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:ring-white/10" },
};

/** 目前只接玉山證券「台股熱點」「總經盤勢」分類文章（見esunsecClient.ts），近30天，
 * 含尚未被LLM解析的「待解析」項目（只有原文連結，見queryInstitutionalReportsOverview.ts）。 */
export function InstitutionalReportList({ overview }: { overview: InstitutionalReportsOverview }) {
  const { items } = overview;

  return (
    <Card>
      <SectionHeader
        icon={Landmark}
        iconColor="blue"
        title={`法人報告（${items.length}）`}
        tooltip={
          <InfoTooltip>
            近{overview.asOfDays}天玉山證券「台股熱點」「總經盤勢」分類文章，LLM整理出產業趨勢主題、重點摘要與偏多/偏空判斷，並列出文章提及的個股。這些文章常直接引用投顧研究內容，但本質上是券商網站的市場評論文章，不是正式法人研究報告全文——目前只接這一個來源。
          </InfoTooltip>
        }
      />
      {items.length === 0 ? (
        <p className="mt-3 text-center text-sm text-zinc-400 dark:text-zinc-500">近{overview.asOfDays}天還沒有資料。</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {items.map((item) => (
            <ReportCard key={item.postId} item={item} />
          ))}
        </div>
      )}
    </Card>
  );
}

function ReportCard({ item }: { item: InstitutionalReportOverviewItem }) {
  const style = item.signal ? SIGNAL_STYLE[item.signal] ?? SIGNAL_STYLE.neutral : null;

  return (
    <SubCard className="text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
          {item.category}
        </span>
        <span className="text-zinc-400 dark:text-zinc-500">{item.sourceName}</span>
        <span className="ml-auto text-zinc-400 dark:text-zinc-500">{item.publishDate}</span>
        {style && <span className={`rounded px-1.5 py-0.5 font-medium ring-1 ${style.className}`}>{style.label}</span>}
      </div>

      <a
        href={item.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1.5 block font-semibold text-zinc-900 hover:underline dark:text-zinc-100"
      >
        {item.title}
      </a>

      {item.summary !== null ? (
        <div className="mt-2 flex flex-col gap-1.5">
          <p>
            <span className="font-medium text-zinc-500 dark:text-zinc-400">產業主題：</span>
            <span className="text-zinc-700 dark:text-zinc-300">{item.industryTheme}</span>
          </p>
          <p>
            <span className="font-medium text-zinc-500 dark:text-zinc-400">重點摘要：</span>
            <span className="text-zinc-700 dark:text-zinc-300">{item.summary}</span>
          </p>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-zinc-400 dark:text-zinc-500">LLM還沒解析這篇文章，可以先看原文：</span>
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-violet-600 hover:underline dark:text-violet-400"
          >
            <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />
            開啟原文
          </a>
        </div>
      )}

      {item.mentionedStocks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.mentionedStocks.map((stock) => (
            <Link
              key={stock.ticker}
              href={`/tw/stock/${stock.ticker}`}
              className="rounded bg-zinc-50 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 ring-1 ring-zinc-900/[0.04] transition-colors hover:bg-zinc-100 dark:bg-white/[0.04] dark:text-zinc-300 dark:ring-white/[0.06] dark:hover:bg-white/10"
            >
              {stock.ticker} {stripCompanySuffix(stock.companyName)}
            </Link>
          ))}
        </div>
      )}
    </SubCard>
  );
}
