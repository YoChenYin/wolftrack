import { stripCompanySuffix } from "@/lib/formatCompanyName";
import type { VideoMentionItem } from "@/lib/youtube/queries";

const SENTIMENT_STYLE: Record<string, { label: string; className: string }> = {
  bullish: { label: "看多", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  bearish: { label: "看空", className: "bg-red-50 text-red-700 ring-red-200" },
  neutral: { label: "中性", className: "bg-zinc-50 text-zinc-600 ring-zinc-200" },
};

const AGREEMENT_LABEL: Record<string, string> = {
  agree: "系統已同步",
  aheadOfSystem: "🔥 領先系統",
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
        {mention.isNewStock && <span className="text-[10px] font-normal text-amber-600">新股</span>}
        {!mention.ticker && <span className="text-[10px] font-normal text-zinc-400">待確認</span>}
        {entryExitTitle && <span className="text-[10px]" title={entryExitTitle}>📋</span>}
      </div>
      <div className="flex items-center gap-1.5 text-[10px] font-normal text-zinc-500">
        <span>{sentiment.label}</span>
        {mention.agreement && (
          <>
            <span>·</span>
            <span className={mention.agreement === "aheadOfSystem" ? "font-medium text-amber-600" : ""}>
              {AGREEMENT_LABEL[mention.agreement] ?? mention.agreement}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
