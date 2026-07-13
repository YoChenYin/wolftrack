import { prisma } from "@/lib/prisma";
import { YOUTUBE_CHANNELS } from "@/config/youtubeChannels";
import { fetchChannelRss } from "./fetchChannelRss";

export interface YoutubeDiscoveryResult {
  newVideos: number;
  checked: number;
}

/**
 * 掃描3個固定頻道的 RSS feed，把還沒見過的影片存成 stub row（transcript 為 null），
 * 等 GitHub Actions 的 youtube-transcribe workflow 抓到字幕/語音轉文字後再回填。
 */
export async function runYoutubeDiscovery(): Promise<YoutubeDiscoveryResult> {
  let newVideos = 0;
  let checked = 0;

  for (const channel of YOUTUBE_CHANNELS) {
    const entries = await fetchChannelRss(channel.channelId);
    checked += entries.length;

    for (const entry of entries) {
      const existing = await prisma.youtubeVideo.findUnique({ where: { videoId: entry.videoId } });
      if (existing) continue;

      await prisma.youtubeVideo.create({
        data: {
          channelId: channel.channelId,
          videoId: entry.videoId,
          title: entry.title,
          publishedAt: new Date(entry.publishedAt),
        },
      });
      newVideos++;
    }
  }

  return { newVideos, checked };
}
