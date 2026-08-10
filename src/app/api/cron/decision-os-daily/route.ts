import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { runDecisionOsDaily } from "@/lib/decisionOs/runDecisionOsDaily";

/**
 * 排程觸發：台指期 Decision OS 每日執行。由 GitHub Actions（daily-batch.yml）在
 * tw-daily / taifex-daily 之後打這支——依賴當天的 TAIEX 收盤價與最新 PCR 都已經更新完成。
 *
 * ⚠️2026-08-10：原本是fire-and-forget，這支本身跑很快（本機實測約3秒），改成同步等待
 * 沒有效能疑慮，換來的是curl -sf能正確反映這次到底有沒有真的算出當天的快照——之前fire-and-forget
 * 讓好幾天的GitHub Actions都顯示綠色成功，但production的decision_snapshots其實沒有新資料。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDecisionOsDaily();
    console.log(
      `[cron/decision-os-daily] done: ${result.tradeDate} totalScore=${result.totalScore} tier=${result.tierLabel} gates=${result.gatesTriggered}`
    );
    return NextResponse.json({ status: "done", ...result });
  } catch (err) {
    console.error("[cron/decision-os-daily] failed:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
