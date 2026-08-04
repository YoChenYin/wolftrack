import { PlaySquare } from "lucide-react";
import { InfoTooltip } from "../InfoTooltip";
import { VideoMentionCard } from "./VideoMentionCard";
import type { VideoMentionSummary } from "@/lib/youtube/queries";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";

/** v1不需要client互動（篩選/分頁），server component直接render，比照這個專案其他TW-only區塊的做法 */
export function VideoMentionsSection({ videos }: { videos: VideoMentionSummary[] }) {
  return (
    <Card>
      <SectionHeader
        icon={PlaySquare}
        iconColor="rose"
        title="網紅視角"
        tooltip={
          <InfoTooltip>
            抓取3個台股財經YouTube頻道（理財達人秀、游庭皓的財經皓角、Gooaye股癌）的內容，用LLM解析出提到的個股與看多看空立場，並跟系統當下的戰術狀態交叉比對。「領先系統」代表網紅已經看多、但系統還沒對這檔股票亮燈，是最值得留意的落差案例。
          </InfoTooltip>
        }
      />
      {videos.length === 0 ? (
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">目前還沒有已處理完的影片。</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {videos.map((video) => (
            <VideoMentionCard key={video.id} video={video} />
          ))}
        </div>
      )}
    </Card>
  );
}
