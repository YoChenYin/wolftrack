import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { prisma } from "@/lib/prisma";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const MAX_ATTEMPTS = 3;

/**
 * 給 youtube-transcribe.yml（GitHub Actions）用：回傳還沒有transcript、且失敗次數
 * 沒超過上限的影片清單。限制筆數是為了讓每次 GH Actions 執行時間可預期（yt-dlp+Whisper
 * 一支就可能跑好幾分鐘）。
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
      OR: [{ transcriptFailedAt: null }, { transcriptAttempts: { lt: MAX_ATTEMPTS } }],
    },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: { id: true, videoId: true, title: true },
  });

  return NextResponse.json({ videos });
}
