import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { runEarningsCallAnalysisBatch } from "@/lib/marketData/runEarningsCallAnalysis";

/**
 * 2026-07-25：龍頭股法說會基本面訊號，awaited等它真的跑完才回應（不是fire-and-forget，
 * 見runEarningsCallAnalysis.ts說明），單次呼叫限制在小批次、幾秒到幾十秒內完成。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runEarningsCallAnalysisBatch();
  return NextResponse.json(result);
}
