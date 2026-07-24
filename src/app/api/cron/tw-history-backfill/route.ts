import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { runTwHistoryBackfillBatch } from "@/lib/marketData/backfillTwHistory";

/**
 * 2026-07-25：把台股價格/籌碼/營收回補到10年歷史，分批觸發（見 backfillTwHistory.ts 說明，
 * 每次呼叫只消耗一小批FinMind API額度，awaited等它真的跑完才回應，不是fire-and-forget——
 * 2026-07-21修youtube LLM解析時得到的教訓：長時間工作不能丟給不等待的背景Promise，
 * Zeabur container重啟會直接砍斷；這裡刻意設計成單次呼叫很快（幾秒內），
 * 由GitHub Actions排程反覆呼叫很多次來達成長時間、可控速率的回補。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runTwHistoryBackfillBatch();
  return NextResponse.json(result);
}
