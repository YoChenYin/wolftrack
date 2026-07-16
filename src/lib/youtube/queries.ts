import { prisma } from "@/lib/prisma";

const MENTION_INCLUDE = {
  stock: { select: { ticker: true, companyName: true } },
} as const;

export interface VideoMentionItem {
  id: string;
  rawNameOrTicker: string;
  ticker: string | null;
  companyName: string | null;
  sentiment: string;
  agreement: string | null;
  isNewStock: boolean;
  entryReason: string | null;
  exitCondition: string | null;
}

export interface VideoMentionSummary {
  id: number;
  channelId: string;
  title: string;
  publishedAt: string;
  summary: string | null;
  mentions: VideoMentionItem[];
}

function toMentionItem(row: {
  id: bigint;
  rawNameOrTicker: string;
  sentiment: string;
  agreement: string | null;
  isNewStock: boolean;
  entryReason: string | null;
  exitCondition: string | null;
  stock: { ticker: string; companyName: string } | null;
}): VideoMentionItem {
  return {
    id: row.id.toString(),
    rawNameOrTicker: row.rawNameOrTicker,
    ticker: row.stock?.ticker ?? null,
    companyName: row.stock?.companyName ?? null,
    sentiment: row.sentiment,
    agreement: row.agreement,
    isNewStock: row.isNewStock,
    entryReason: row.entryReason,
    exitCondition: row.exitCondition,
  };
}

/** 給首頁「網紅視角」用：最近已處理完（有summary）的影片，含每支影片的個股提及 */
export async function fetchRecentVideoMentions(limit = 10): Promise<VideoMentionSummary[]> {
  const videos = await prisma.youtubeVideo.findMany({
    where: { processedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    take: limit,
    include: { mentions: { include: MENTION_INCLUDE } },
  });

  return videos.map((video) => ({
    id: video.id,
    channelId: video.channelId,
    title: video.title,
    publishedAt: video.publishedAt.toISOString(),
    summary: video.summary,
    mentions: video.mentions.map(toMentionItem),
  }));
}

export interface StockMentionItem extends VideoMentionItem {
  videoTitle: string;
  videoPublishedAt: string;
  channelId: string;
  reasoningExcerpt: string;
}

/** 給個股detail頁用：這支股票最近被哪些影片提到、情緒/交叉驗證結果 */
export async function fetchStockMentions(stockId: number, limit = 10): Promise<StockMentionItem[]> {
  const mentions = await prisma.youtubeStockMention.findMany({
    where: { stockId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { ...MENTION_INCLUDE, video: { select: { title: true, publishedAt: true, channelId: true } } },
  });

  return mentions.map((m) => ({
    ...toMentionItem(m),
    videoTitle: m.video.title,
    videoPublishedAt: m.video.publishedAt.toISOString(),
    channelId: m.video.channelId,
    reasoningExcerpt: m.reasoningExcerpt,
  }));
}
