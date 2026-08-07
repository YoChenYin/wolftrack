import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { runDecisionLabDaily } from "@/lib/decisionLab/runDecisionLabDaily";

/**
 * 排程觸發：Decision Lab 每日計算（Regime/Trading Score/Scenario/Trading Plan）。
 * 必須排在 global-macro-sync 後面（見 daily-batch.yml 的時間緩衝），不然會讀到前一天的資料。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  runDecisionLabDaily()
    .then((result) => {
      console.log(`[cron/decision-lab-daily] done: ${result.snapshotDate} regime=${result.regime} score=${result.tradingScore}/${result.maxPossibleScore}`);
    })
    .catch((err) => {
      console.error("[cron/decision-lab-daily] failed:", err);
    });

  return NextResponse.json({ status: "started" }, { status: 202 });
}
