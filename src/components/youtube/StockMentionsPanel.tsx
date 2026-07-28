import { Flame, PlaySquare } from "lucide-react";
import { InfoTooltip } from "../InfoTooltip";
import { findYoutubeChannel } from "@/config/youtubeChannels";
import type { StockMentionItem } from "@/lib/youtube/queries";
import { Card, SubCard } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";

const SENTIMENT_LABEL: Record<string, string> = { bullish: "看多", bearish: "看空", neutral: "中性" };
const AGREEMENT_LABEL: Record<string, string> = {
  agree: "系統已同步",
  aheadOfSystem: "領先系統",
  noData: "無法比對",
};

export function StockMentionsPanel({ mentions }: { mentions: StockMentionItem[] }) {
  if (mentions.length === 0) {
    return (
      <Card>
        <SectionHeader icon={PlaySquare} iconColor="rose" title="近期媒體提及" />
        <p className="mt-2 text-xs text-zinc-400">這檔股票目前沒有被追蹤的YouTube頻道提到。</p>
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader
        icon={PlaySquare}
        iconColor="rose"
        title="近期媒體提及"
        tooltip={<InfoTooltip>這檔股票在追蹤的YouTube財經頻道裡被提到的紀錄，含情緒判斷與系統交叉驗證結果。</InfoTooltip>}
      />
      <div className="mt-3 flex flex-col gap-2">
        {mentions.map((m) => {
          const channel = findYoutubeChannel(m.channelId);
          return (
            <SubCard key={m.id} className="text-xs">
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
                    <span
                      className={
                        m.agreement === "aheadOfSystem"
                          ? "inline-flex items-center gap-0.5 font-medium text-amber-600"
                          : ""
                      }
                    >
                      {m.agreement === "aheadOfSystem" && <Flame className="h-2.5 w-2.5" strokeWidth={2.25} />}
                      {AGREEMENT_LABEL[m.agreement] ?? m.agreement}
                    </span>
                  </>
                )}
              </div>
              <p className="mt-1 text-zinc-500">{m.reasoningExcerpt}</p>
              {(m.entryReason || m.exitCondition) && (
                <div className="mt-1.5 flex flex-col gap-0.5 rounded-lg bg-white p-1.5 text-[11px] ring-1 ring-zinc-900/[0.04]">
                  {m.entryReason && (
                    <p>
                      <span className="font-medium text-zinc-500">進場理由：</span>
                      <span className="text-zinc-600">{m.entryReason}</span>
                    </p>
                  )}
                  {m.exitCondition && (
                    <p>
                      <span className="font-medium text-zinc-500">出場條件：</span>
                      <span className="text-zinc-600">{m.exitCondition}</span>
                    </p>
                  )}
                </div>
              )}
            </SubCard>
          );
        })}
      </div>
    </Card>
  );
}
