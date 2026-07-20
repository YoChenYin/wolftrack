import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { prisma } from "@/lib/prisma";
import { parseTranscript } from "@/lib/youtube/parseTranscript";

/**
 * 一次性補值用：keySignals欄位是2026-07-17之後才加的，在那之前就已經processedAt的舊影片
 * 不會自動回填（沒有重新觸發LLM解析）。只重新呼叫parseTranscript拿keySignals覆蓋，
 * 不碰mentions表——runYoutubeParseAndResolve會對mentions做create，重跑整條pipeline會
 * 造成同一支影片的個股提及重複insert，這裡刻意繞過那段。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined;

  const targets = await prisma.youtubeVideo.findMany({
    where: { processedAt: { not: null }, transcript: { not: null }, keySignals: { isEmpty: true } },
    select: { id: true, transcript: true },
    take: limit,
  });

  const results: { id: number; keySignalsCount: number }[] = [];
  for (const video of targets) {
    try {
      const analysis = await parseTranscript(video.transcript!);
      await prisma.youtubeVideo.update({
        where: { id: video.id },
        data: { keySignals: analysis.keySignals },
      });
      results.push({ id: video.id, keySignalsCount: analysis.keySignals.length });
    } catch (err) {
      console.error(`[backfill-key-signals] failed for video ${video.id}:`, err);
    }
  }

  return NextResponse.json({ attempted: targets.length, updated: results.length, results });
}
