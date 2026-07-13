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

  const result = await prisma.youtubeVideo.updateMany({
    where: { transcript: null },
    data: { transcriptAttempts: 0, transcriptFailedAt: null },
  });

  return NextResponse.json({ reset: result.count });
}
