import { InfoTooltip } from "../InfoTooltip";
import { findYoutubeChannel } from "@/config/youtubeChannels";
import { stripCompanySuffix } from "@/lib/formatCompanyName";
import type { StockMentionOverviewItem } from "@/lib/youtube/queries";

const SENTIMENT_LABEL: Record<string, { label: string; className: string }> = {
  bullish: { label: "看多", className: "text-emerald-700" },
  bearish: { label: "看空", className: "text-red-700" },
  neutral: { label: "中性", className: "text-zinc-500" },
};

/** v1不需要client互動，server component直接render，比照這個專案其他TW-only區塊的做法 */
export function StockMentionOverviewSection({ items }: { items: StockMentionOverviewItem[] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="flex items-center gap-1 text-sm font-semibold text-zinc-900">
        網紅視角總覽
        <InfoTooltip>
          近2週內3個頻道提到的個股，同一檔股票在不同影片被提到會合併成一筆，依「幾個不同頻道都提到」排序——跨頻道一致提到的股票通常比單一頻道反覆講更值得留意。看多看空是最新一次提及的立場。
        </InfoTooltip>
      </h2>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-zinc-400">近2週還沒有已處理完的個股提及。</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-zinc-400">
                <th className="pb-1.5 pr-3 font-medium">個股</th>
                <th className="pb-1.5 pr-3 font-medium">提及頻道</th>
                <th className="pb-1.5 pr-3 font-medium">次數</th>
                <th className="pb-1.5 pr-3 font-medium">最新立場</th>
                <th className="pb-1.5 font-medium">最新提及日</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const sentiment = SENTIMENT_LABEL[item.latestSentiment] ?? SENTIMENT_LABEL.neutral;
                return (
                  <tr key={item.stockId} className="border-t border-zinc-100">
                    <td className="py-1.5 pr-3 font-medium text-zinc-800">
                      {item.ticker} {stripCompanySuffix(item.companyName)}
                    </td>
                    <td className="py-1.5 pr-3 text-zinc-500">
                      {item.channelIds.map((channelId) => findYoutubeChannel(channelId)?.displayName ?? channelId).join("、")}
                    </td>
                    <td className="py-1.5 pr-3 text-zinc-500">{item.mentionCount}</td>
                    <td className={`py-1.5 pr-3 font-medium ${sentiment.className}`}>
                      {sentiment.label}
                      {item.latestAgreement === "aheadOfSystem" && (
                        <span className="ml-1 font-medium text-amber-600">🔥領先系統</span>
                      )}
                    </td>
                    <td className="py-1.5 text-zinc-400">{item.latestPublishedAt.slice(0, 10)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
