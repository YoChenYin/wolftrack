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
  keySignals: string[];
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
    keySignals: video.keySignals,
    mentions: video.mentions.map(toMentionItem),
  }));
}

export interface StockMentionOverviewItem {
  stockId: number;
  ticker: string;
  companyName: string;
  /** 提過這檔股票的頻道slug，已去重 */
  channelIds: string[];
  mentionCount: number;
  latestSentiment: string;
  latestPublishedAt: string;
  latestAgreement: string | null;
}

/**
 * 給首頁「網紅視角」總覽用：近N天內被提到的個股，跨頻道合併同一檔股票的重複提及，
 * 依「幾個不同頻道都提到」排序（跨頻道一致性比單一頻道講很多次更有參考價值）。
 * 只算已成功解析出stockId的提及；LLM判定不出對應股票的原始名稱不計入合併統計。
 */
export async function fetchStockMentionOverview(daysBack = 14): Promise<StockMentionOverviewItem[]> {
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  const mentions = await prisma.youtubeStockMention.findMany({
    where: { stockId: { not: null }, video: { publishedAt: { gte: since } } },
    include: {
      stock: { select: { ticker: true, companyName: true } },
      video: { select: { channelId: true, publishedAt: true } },
    },
    orderBy: { video: { publishedAt: "desc" } },
  });

  const byStock = new Map<number, StockMentionOverviewItem>();
  for (const m of mentions) {
    if (!m.stock || m.stockId === null) continue;

    let entry = byStock.get(m.stockId);
    if (!entry) {
      // mentions已依video.publishedAt desc排序，第一次遇到這檔股票時就是最新一筆提及
      entry = {
        stockId: m.stockId,
        ticker: m.stock.ticker,
        companyName: m.stock.companyName,
        channelIds: [],
        mentionCount: 0,
        latestSentiment: m.sentiment,
        latestPublishedAt: m.video.publishedAt.toISOString(),
        latestAgreement: m.agreement,
      };
      byStock.set(m.stockId, entry);
    }

    entry.mentionCount += 1;
    if (!entry.channelIds.includes(m.video.channelId)) {
      entry.channelIds.push(m.video.channelId);
    }
  }

  return Array.from(byStock.values()).sort((a, b) => {
    if (b.channelIds.length !== a.channelIds.length) return b.channelIds.length - a.channelIds.length;
    return b.latestPublishedAt.localeCompare(a.latestPublishedAt);
  });
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
