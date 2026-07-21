import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { prisma } from "@/lib/prisma";

/**
 * 診斷用端點：一眼看出影片卡在pipeline的哪一步（發現 -> 抓字幕/轉文字 -> LLM解析），
 * 不用另外去翻GitHub Actions/Zeabur log交叉比對。只回傳彙總數字，不是完整清單。
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [total, withTranscript, processed, permanentlyFailedTranscript, permanentlyFailedParse, recentFailures, allVideos] =
    await Promise.all([
      prisma.youtubeVideo.count(),
      prisma.youtubeVideo.count({ where: { transcript: { not: null } } }),
      prisma.youtubeVideo.count({ where: { processedAt: { not: null } } }),
      prisma.youtubeVideo.count({ where: { transcript: null, transcriptAttempts: { gte: 3 } } }),
      prisma.youtubeVideo.count({ where: { processedAt: null, transcript: { not: null }, parseAttempts: { gte: 3 } } }),
      prisma.youtubeVideo.findMany({
        where: { transcript: { not: null }, processedAt: null },
        select: { id: true, videoId: true, title: true, transcriptSource: true, parseAttempts: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.youtubeVideo.findMany({
        select: {
          channelId: true,
          transcript: true,
          processedAt: true,
          transcriptAttempts: true,
          parseAttempts: true,
        },
      }),
    ]);

  // 用來確認「只有某幾個頻道一直卡住」是不是特定頻道的下載/轉錄問題（例如某個Podcast host
  // 的CDN在雲端runner IP上表現跟本地不同），而不是全體backlog的均勻延遲
  const byChannel: Record<
    string,
    {
      total: number;
      withTranscript: number;
      processed: number;
      permanentlyFailedTranscript: number;
      permanentlyFailedParse: number;
    }
  > = {};
  for (const video of allVideos) {
    const bucket = (byChannel[video.channelId] ??= {
      total: 0,
      withTranscript: 0,
      processed: 0,
      permanentlyFailedTranscript: 0,
      permanentlyFailedParse: 0,
    });
    bucket.total += 1;
    if (video.transcript !== null) bucket.withTranscript += 1;
    if (video.processedAt !== null) bucket.processed += 1;
    if (video.transcript === null && video.transcriptAttempts >= 3) bucket.permanentlyFailedTranscript += 1;
    if (video.processedAt === null && video.transcript !== null && video.parseAttempts >= 3) {
      bucket.permanentlyFailedParse += 1;
    }
  }

  return NextResponse.json({
    total,
    withTranscript,
    processed,
    permanentlyFailedTranscript,
    permanentlyFailedParse,
    stuckAfterTranscript: withTranscript - processed,
    sampleStuckAfterTranscript: recentFailures,
    byChannel,
  });
}
