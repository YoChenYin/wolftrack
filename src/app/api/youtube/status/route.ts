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

  const [total, withTranscript, processed, permanentlyFailed, recentFailures] = await Promise.all([
    prisma.youtubeVideo.count(),
    prisma.youtubeVideo.count({ where: { transcript: { not: null } } }),
    prisma.youtubeVideo.count({ where: { processedAt: { not: null } } }),
    prisma.youtubeVideo.count({ where: { transcript: null, transcriptAttempts: { gte: 3 } } }),
    prisma.youtubeVideo.findMany({
      where: { transcript: { not: null }, processedAt: null },
      select: { id: true, videoId: true, title: true, transcriptSource: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  return NextResponse.json({
    total,
    withTranscript,
    processed,
    permanentlyFailedTranscript: permanentlyFailed,
    stuckAfterTranscript: withTranscript - processed,
    sampleStuckAfterTranscript: recentFailures,
  });
}
