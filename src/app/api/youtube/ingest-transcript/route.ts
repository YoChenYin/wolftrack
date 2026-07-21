import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { prisma } from "@/lib/prisma";

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
 * 給 scripts/youtube-transcribe.py（在GitHub Actions runner內執行）用：回傳擷取結果。
 * 只負責存transcript，不在這裡觸發LLM解析——2026-07-21之前是fire-and-forget觸發，依賴
 * Zeabur container活到背景Promise跑完，production實測成功率只有約1成（推測跟container
 * 重啟/自動部署有關）。改成獨立的 /api/youtube/parse-pending，由GitHub Actions排程
 * awaited呼叫，見該檔案說明。失敗時累加transcriptAttempts，超過上限就不會再被
 * pending-transcripts撿到（不會無限重試）。
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

  return NextResponse.json({ status: "transcript-saved" }, { status: 202 });
}
