import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { prisma } from "@/lib/prisma";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const MAX_ATTEMPTS = 3;

/**
 * 給 scripts/youtube-transcribe.py（在Zeabur container內執行）用：回傳還沒有transcript、
 * 且失敗次數沒超過上限的集數清單，含Podcast MP3下載連結。限制筆數是為了讓每次執行時間
 * 可預期（下載音檔+跑Whisper一支就可能跑好幾分鐘）。
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT;

  const videos = await prisma.youtubeVideo.findMany({
    where: {
      transcript: null,
      audioUrl: { not: null },
      OR: [{ transcriptFailedAt: null }, { transcriptAttempts: { lt: MAX_ATTEMPTS } }],
    },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: { id: true, videoId: true, title: true, audioUrl: true },
  });

  return NextResponse.json({ videos });
}
