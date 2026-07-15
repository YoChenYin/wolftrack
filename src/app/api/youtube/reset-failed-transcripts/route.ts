import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { prisma } from "@/lib/prisma";

/**
 * 手動復原用：把transcriptAttempts歸零、transcriptFailedAt清掉，讓已經失敗滿3次、
 * 被pending-transcripts永久排除的影片重新進入待處理清單。用途：解決像「GitHub Actions
 * runner IP被YouTube bot check擋下來」這種暫時性、修完就會好的失敗（cookies加上去之後，
 * 這些影片應該就能重新成功），不是常態性重試機制。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 可選limit：小規模測試時只想解鎖少數幾支影片，不用一次全部重新解鎖
  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined;

  const targets = await prisma.youtubeVideo.findMany({
    where: { transcript: null },
    select: { id: true },
    take: limit,
  });

  const result = await prisma.youtubeVideo.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: { transcriptAttempts: 0, transcriptFailedAt: null },
  });

  return NextResponse.json({ reset: result.count });
}
