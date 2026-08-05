import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { runDecisionOsDaily } from "@/lib/decisionOs/runDecisionOsDaily";

/**
 * 排程觸發：台指期 Decision OS 每日執行。由 GitHub Actions（daily-batch.yml）在
 * tw-daily / taifex-daily 之後打這支——依賴當天的 TAIEX 收盤價與最新 PCR 都已經更新完成。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  runDecisionOsDaily()
    .then((result) => {
      console.log(
        `[cron/decision-os-daily] done: ${result.tradeDate} totalScore=${result.totalScore} tier=${result.tierLabel} gates=${result.gatesTriggered}`
      );
    })
    .catch((err) => {
      console.error("[cron/decision-os-daily] failed:", err);
    });

  return NextResponse.json({ status: "started" }, { status: 202 });
}
