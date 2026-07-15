import { prisma } from "@/lib/prisma";
import { YOUTUBE_CHANNELS } from "@/config/youtubeChannels";
import { fetchChannelRss } from "./fetchChannelRss";

export interface YoutubeDiscoveryResult {
  newVideos: number;
  checked: number;
}

/** Podcast RSS會回傳整個節目歷史（不像YouTube RSS只給最新~15支），只處理近期集數，
 * 避免第一次跑或feed URL換過之後，把好幾百集歷史存量一次性排進轉錄佇列
 * （faster-whisper一集要十幾分鐘，好幾百集會讓container長時間滿載）*/
const MAX_LOOKBACK_DAYS = 7;

/**
 * 掃描3個固定節目的Podcast RSS feed，把還沒見過、且在近期發布的集數存成 stub row
 * （transcript 為 null），等 /api/cron/youtube-transcribe 下載音檔+跑faster-whisper後回填。
 */
export async function runYoutubeDiscovery(): Promise<YoutubeDiscoveryResult> {
  let newVideos = 0;
  let checked = 0;
  const cutoff = Date.now() - MAX_LOOKBACK_DAYS * 86_400_000;

  for (const channel of YOUTUBE_CHANNELS) {
    const entries = await fetchChannelRss(channel.podcastFeedUrl);
    const recentEntries = entries.filter((e) => new Date(e.publishedAt).getTime() >= cutoff);
    checked += recentEntries.length;

    for (const entry of recentEntries) {
      const existing = await prisma.youtubeVideo.findUnique({ where: { videoId: entry.videoId } });
      if (existing) continue;

      await prisma.youtubeVideo.create({
        data: {
          channelId: channel.channelId,
          videoId: entry.videoId,
          title: entry.title,
          publishedAt: new Date(entry.publishedAt),
          audioUrl: entry.audioUrl,
        },
      });
      newVideos++;
    }
  }

  return { newVideos, checked };
}
