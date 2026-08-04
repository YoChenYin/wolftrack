import { ClipboardList, Flame } from "lucide-react";
import { stripCompanySuffix } from "@/lib/formatCompanyName";
import type { VideoMentionItem } from "@/lib/youtube/queries";

const SENTIMENT_STYLE: Record<string, { label: string; className: string }> = {
  bullish: {
    label: "看多",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-400 dark:ring-emerald-400/20",
  },
  bearish: {
    label: "看空",
    className: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-400/10 dark:text-red-400 dark:ring-red-400/20",
  },
  neutral: {
    label: "中性",
    className: "bg-zinc-50 text-zinc-600 ring-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:ring-white/10",
  },
};

const AGREEMENT_LABEL: Record<string, string> = {
  agree: "系統已同步",
  aheadOfSystem: "領先系統",
  noData: "無法比對",
};

export function StockMentionBadge({ mention }: { mention: VideoMentionItem }) {
  const sentiment = SENTIMENT_STYLE[mention.sentiment] ?? SENTIMENT_STYLE.neutral;
  const displayName = mention.ticker
    ? `${mention.ticker} ${mention.companyName ? stripCompanySuffix(mention.companyName) : ""}`.trim()
    : mention.rawNameOrTicker;

  // 進場/出場條件用title屬性做簡易tooltip，這個badge本身空間很小（一支影片可能好幾檔股票
  // 並排），完整內容留給StockMentionsPanel.tsx（個股detail頁）那邊完整顯示
  const entryExitTitle = [
    mention.entryReason && `進場理由：${mention.entryReason}`,
    mention.exitCondition && `出場條件：${mention.exitCondition}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div
      className={`flex flex-col gap-0.5 rounded-md px-2 py-1 text-xs ring-1 ${sentiment.className}`}
      title={entryExitTitle || undefined}
    >
      <div className="flex items-center gap-1.5 font-medium">
        <span>{displayName}</span>
        {mention.isNewStock && <span className="text-[10px] font-normal text-amber-600 dark:text-amber-400">新股</span>}
        {!mention.ticker && <span className="text-[10px] font-normal text-zinc-400 dark:text-zinc-500">待確認</span>}
        {entryExitTitle && (
          <span title={entryExitTitle}>
            <ClipboardList className="h-2.5 w-2.5 shrink-0 text-zinc-400 dark:text-zinc-500" strokeWidth={2.25} />
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-[10px] font-normal text-zinc-500 dark:text-zinc-400">
        <span>{sentiment.label}</span>
        {mention.agreement && (
          <>
            <span>·</span>
            <span
              className={
                mention.agreement === "aheadOfSystem"
                  ? "inline-flex items-center gap-0.5 font-medium text-amber-600 dark:text-amber-400"
                  : ""
              }
            >
              {mention.agreement === "aheadOfSystem" && <Flame className="h-2.5 w-2.5" strokeWidth={2.25} />}
              {AGREEMENT_LABEL[mention.agreement] ?? mention.agreement}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
