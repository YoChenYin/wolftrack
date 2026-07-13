import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { prisma } from "@/lib/prisma";
import { runYoutubeParseAndResolve } from "@/lib/youtube/runYoutubeParseAndResolve";

interface IngestSuccessBody {
  id: number;
  transcript: string;
  transcriptSource: "caption" | "whisper";
}

interface IngestFailureBody {
  id: number;
  failed: true;
}

/**
 * 給 youtube-transcribe.yml（GitHub Actions）用：回傳擷取結果。成功時存transcript並
 * fire-and-forget觸發LLM解析；失敗時累加transcriptAttempts，超過上限就不會再被
 * pending-transcripts撿到（保護GH Actions免費分鐘數，不會無限重試）。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as IngestSuccessBody | IngestFailureBody;

  if ("failed" in body) {
    await prisma.youtubeVideo.update({
      where: { id: body.id },
      data: { transcriptAttempts: { increment: 1 }, transcriptFailedAt: new Date() },
    });
    return NextResponse.json({ status: "recorded-failure" }, { status: 202 });
  }

  await prisma.youtubeVideo.update({
    where: { id: body.id },
    data: { transcript: body.transcript, transcriptSource: body.transcriptSource },
  });

  runYoutubeParseAndResolve(body.id)
    .then(() => console.log(`[youtube/ingest-transcript] parsed video ${body.id}`))
    .catch((err) => console.error(`[youtube/ingest-transcript] parse failed for video ${body.id}:`, err));

  return NextResponse.json({ status: "started" }, { status: 202 });
}
