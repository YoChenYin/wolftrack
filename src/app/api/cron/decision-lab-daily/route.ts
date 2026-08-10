import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { runDecisionLabDaily } from "@/lib/decisionLab/runDecisionLabDaily";

/**
 * 排程觸發：Decision Lab 每日計算（Regime/Trading Score/Scenario/Trading Plan）。
 * 必須排在 global-macro-sync 後面（見 daily-batch.yml 的時間緩衝），不然會讀到前一天的資料。
 *
 * ⚠️2026-08-10：原本是fire-and-forget，改同步等待，理由跟 decision-os-daily 同一支route的
 * 說明一致——這支本身很快，fire-and-forget唯一的效果是讓GitHub Actions看不到真正的失敗。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDecisionLabDaily();
    console.log(`[cron/decision-lab-daily] done: ${result.snapshotDate} regime=${result.regime} score=${result.tradingScore}/${result.maxPossibleScore}`);
    return NextResponse.json({ status: "done", ...result });
  } catch (err) {
    console.error("[cron/decision-lab-daily] failed:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
