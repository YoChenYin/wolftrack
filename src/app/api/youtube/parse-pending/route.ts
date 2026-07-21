import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { prisma } from "@/lib/prisma";
import { runYoutubeParseAndResolve } from "@/lib/youtube/runYoutubeParseAndResolve";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_ATTEMPTS = 3;

/**
 * 給 .github/workflows/youtube-transcribe.yml 用：轉錄完成後另外觸發這支，把還沒解析的
 * 逐字稿一一awaited丟給LLM。2026-07-21之前LLM解析是在ingest-transcript裡fire-and-forget
 * 觸發，依賴Zeabur container活到背景Promise跑完，production實測成功率只有約1成——改成
 * 跟transcribe一樣由GitHub Actions排程驅動、每支都等它真的跑完才算數，失敗的話累加
 * parseAttempts，超過上限不再重試（避免卡在同一支壞逐字稿）。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT;

  const targets = await prisma.youtubeVideo.findMany({
    where: {
      transcript: { not: null },
      processedAt: null,
      OR: [{ parseFailedAt: null }, { parseAttempts: { lt: MAX_ATTEMPTS } }],
    },
    orderBy: { publishedAt: "asc" },
    take: limit,
    select: { id: true },
  });

  const results: { id: number; status: "parsed" | "failed" }[] = [];
  for (const video of targets) {
    try {
      await runYoutubeParseAndResolve(video.id);
      results.push({ id: video.id, status: "parsed" });
    } catch (err) {
      console.error(`[youtube/parse-pending] parse failed for video ${video.id}:`, err);
      await prisma.youtubeVideo.update({
        where: { id: video.id },
        data: { parseAttempts: { increment: 1 }, parseFailedAt: new Date() },
      });
      results.push({ id: video.id, status: "failed" });
    }
  }

  return NextResponse.json({
    attempted: results.length,
    parsed: results.filter((r) => r.status === "parsed").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  });
}
