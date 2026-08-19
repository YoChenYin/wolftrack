import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { runInstitutionalReportIngestBatch } from "@/lib/marketData/runInstitutionalReportIngest";

/**
 * 排程觸發：法人報告（目前只接玉山證券「台股熱點」「總經盤勢」，見esunsecClient.ts），
 * awaited等它真的跑完才回應（不是fire-and-forget，見runEarningsCallAnalysis.ts同樣的
 * 設計理由），單次呼叫限制在小批次、幾秒到幾十秒內完成。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runInstitutionalReportIngestBatch();
  return NextResponse.json(result);
}
