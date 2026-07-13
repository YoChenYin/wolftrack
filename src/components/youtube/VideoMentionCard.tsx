import { findYoutubeChannel } from "@/config/youtubeChannels";
import { StockMentionBadge } from "./StockMentionBadge";
import type { VideoMentionSummary } from "@/lib/youtube/queries";

export function VideoMentionCard({ video }: { video: VideoMentionSummary }) {
  const channel = findYoutubeChannel(video.channelId);

  return (
    <div className="rounded border border-zinc-100 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-zinc-500">{channel?.displayName ?? video.channelId}</span>
        <span className="text-[11px] text-zinc-400">{video.publishedAt.slice(0, 10)}</span>
      </div>
      <p className="mt-1 text-sm font-medium text-zinc-800">{video.title}</p>
      {video.summary && <p className="mt-1 text-xs text-zinc-500">{video.summary}</p>}
      {video.mentions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {video.mentions.map((mention) => (
            <StockMentionBadge key={mention.id} mention={mention} />
          ))}
        </div>
      )}
    </div>
  );
}
