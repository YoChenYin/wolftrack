import { InfoTooltip } from "../InfoTooltip";
import { findYoutubeChannel } from "@/config/youtubeChannels";
import type { StockMentionItem } from "@/lib/youtube/queries";

const SENTIMENT_LABEL: Record<string, string> = { bullish: "看多", bearish: "看空", neutral: "中性" };
const AGREEMENT_LABEL: Record<string, string> = {
  agree: "系統已同步",
  aheadOfSystem: "🔥 領先系統",
  noData: "無法比對",
};

export function StockMentionsPanel({ mentions }: { mentions: StockMentionItem[] }) {
  if (mentions.length === 0) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">近期媒體提及</h2>
        <p className="mt-2 text-xs text-zinc-400">這檔股票目前沒有被追蹤的YouTube頻道提到。</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="flex items-center gap-1 text-sm font-semibold text-zinc-900">
        近期媒體提及
        <InfoTooltip>這檔股票在追蹤的YouTube財經頻道裡被提到的紀錄，含情緒判斷與系統交叉驗證結果。</InfoTooltip>
      </h2>
      <div className="mt-3 flex flex-col gap-2">
        {mentions.map((m) => {
          const channel = findYoutubeChannel(m.channelId);
          return (
            <div key={m.id} className="rounded border border-zinc-100 p-2.5 text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-zinc-600">{channel?.displayName ?? m.channelId}</span>
                <span className="text-zinc-400">{m.videoPublishedAt.slice(0, 10)}</span>
              </div>
              <p className="mt-1 text-zinc-800">{m.videoTitle}</p>
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
                <span>{SENTIMENT_LABEL[m.sentiment] ?? m.sentiment}</span>
                {m.agreement && (
                  <>
                    <span>·</span>
                    <span className={m.agreement === "aheadOfSystem" ? "font-medium text-amber-600" : ""}>
                      {AGREEMENT_LABEL[m.agreement] ?? m.agreement}
                    </span>
                  </>
                )}
              </div>
              <p className="mt-1 text-zinc-500">{m.reasoningExcerpt}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
