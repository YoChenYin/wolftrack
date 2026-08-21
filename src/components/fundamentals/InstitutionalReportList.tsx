import Link from "next/link";
import { Landmark, FileText, TrendingUp, TrendingDown, Tag } from "lucide-react";
import { Card, SubCard } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { InfoTooltip } from "../InfoTooltip";
import { stripCompanySuffix } from "@/lib/formatCompanyName";
import type {
  InstitutionalReportMentionOverview,
  InstitutionalReportOverviewItem,
  InstitutionalReportsOverview,
} from "@/lib/marketData/queryInstitutionalReportsOverview";

const SIGNAL_STYLE: Record<string, { label: string; className: string }> = {
  positive: { label: "偏多", className: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-400/10 dark:text-red-400 dark:ring-red-400/20" },
  negative: {
    label: "偏空",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-400 dark:ring-emerald-400/20",
  },
  neutral: { label: "中性", className: "bg-zinc-50 text-zinc-600 ring-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:ring-white/10" },
};

/** 鏈位階配色，跟GroupValuationTable.tsx/ThemeHeatmap.tsx用同一套（上游藍/中游紫/下游橘/支援層灰） */
const CHAIN_LAYER_STYLE: Record<string, { label: string; className: string }> = {
  upstream: { label: "上游", className: "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-400" },
  midstream: { label: "中游", className: "bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-400" },
  downstream: { label: "下游", className: "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400" },
  support: { label: "支援層", className: "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-400" },
};

/** 個股立場配色，紅漲綠跌台股慣例——bullish=紅、bearish=綠，跟文章整體signal同一套顏色語言 */
const SENTIMENT_DOT: Record<string, string> = {
  bullish: "bg-red-500",
  bearish: "bg-emerald-500",
  neutral: "bg-zinc-400",
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
            近{overview.asOfDays}天玉山證券「台股熱點」「總經盤勢」分類文章，LLM整理出產業趨勢主題、關鍵數據變數、牛熊對抗論述，並列出文章提及個股的立場/供應鏈層級/角色。這些文章常直接引用投顧研究內容，但本質上是券商網站的市場評論文章，不是正式法人研究報告全文——目前只接這一個來源。
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

function KeyMetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-2.5 py-1.5 ring-1 ring-zinc-900/[0.04] dark:bg-white/[0.04] dark:ring-white/[0.06]">
      <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{label}</p>
      <p className="mt-0.5 text-xs font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">{value}</p>
    </div>
  );
}

function CaseColumn({
  direction,
  coreLogic,
  detail,
  detailLabel,
}: {
  direction: "bull" | "bear";
  coreLogic: string;
  detail: string | null;
  detailLabel: string;
}) {
  const isBull = direction === "bull";
  const Icon = isBull ? TrendingUp : TrendingDown;
  return (
    <div
      className={`flex-1 rounded-lg p-2.5 ring-1 ${
        isBull
          ? "bg-red-50/60 ring-red-200 dark:bg-red-400/[0.06] dark:ring-red-400/20"
          : "bg-emerald-50/60 ring-emerald-200 dark:bg-emerald-400/[0.06] dark:ring-emerald-400/20"
      }`}
    >
      <p
        className={`flex items-center gap-1 text-[10px] font-semibold ${
          isBull ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"
        }`}
      >
        <Icon className="h-3 w-3" strokeWidth={2.5} />
        {isBull ? "看多" : "看空"}
      </p>
      <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300">{coreLogic}</p>
      {detail && (
        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span className="font-medium">{detailLabel}：</span>
          {detail}
        </p>
      )}
    </div>
  );
}

function MentionChip({ stock }: { stock: InstitutionalReportMentionOverview }) {
  const chainStyle = stock.chainLayer ? CHAIN_LAYER_STYLE[stock.chainLayer] : null;
  return (
    <Link
      href={`/tw/stock/${stock.ticker}`}
      className="group flex items-center gap-1.5 rounded-lg bg-zinc-50 px-2 py-1 ring-1 ring-zinc-900/[0.04] transition-colors hover:bg-zinc-100 dark:bg-white/[0.04] dark:ring-white/[0.06] dark:hover:bg-white/10"
    >
      {stock.sentiment && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SENTIMENT_DOT[stock.sentiment]}`} />}
      <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
        {stock.ticker} {stripCompanySuffix(stock.companyName)}
      </span>
      {chainStyle && <span className={`rounded px-1 py-0.5 text-[9px] font-medium ${chainStyle.className}`}>{chainStyle.label}</span>}
      {stock.role && <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{stock.role}</span>}
    </Link>
  );
}

function ReportCard({ item }: { item: InstitutionalReportOverviewItem }) {
  const style = item.signal ? SIGNAL_STYLE[item.signal] ?? SIGNAL_STYLE.neutral : null;
  // 舊版prompt解析過的文章（或還沒解析的）沒有這些欄位，繼續走下面的簡易摘要顯示
  const hasStructuredAnalysis = item.bullCoreLogic !== null && item.bearCoreLogic !== null;

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
        <div className="mt-2 flex flex-col gap-2.5">
          <div className="flex flex-col gap-1.5">
            <p>
              <span className="font-medium text-zinc-500 dark:text-zinc-400">產業主題：</span>
              <span className="text-zinc-700 dark:text-zinc-300">{item.industryTheme}</span>
            </p>
            <p>
              <span className="font-medium text-zinc-500 dark:text-zinc-400">重點摘要：</span>
              <span className="text-zinc-700 dark:text-zinc-300">{item.summary}</span>
            </p>
          </div>

          {item.keyMetrics !== null && item.keyMetrics.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.keyMetrics.map((m) => (
                <KeyMetricChip key={m.label} label={m.label} value={m.value} />
              ))}
            </div>
          )}

          {hasStructuredAnalysis && (
            <div className="flex flex-col gap-1.5 sm:flex-row">
              <CaseColumn direction="bull" coreLogic={item.bullCoreLogic!} detail={item.bullTrigger} detailLabel="驗證條件" />
              <CaseColumn direction="bear" coreLogic={item.bearCoreLogic!} detail={item.bearBottleneck} detailLabel="瓶頸" />
            </div>
          )}

          {item.tags !== null && item.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <Tag className="h-3 w-3 shrink-0 text-zinc-300 dark:text-zinc-600" strokeWidth={2.25} />
              {item.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-zinc-50 px-2 py-0.5 text-[10px] text-zinc-500 dark:bg-white/[0.04] dark:text-zinc-400">
                  {tag}
                </span>
              ))}
            </div>
          )}
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
            <MentionChip key={stock.ticker} stock={stock} />
          ))}
        </div>
      )}
    </SubCard>
  );
}
