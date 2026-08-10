import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { runTaifexDailyUpdate } from "@/lib/marketData/runTaifexDailyUpdate";

/**
 * 排程觸發：台指期每日更新（台指期近月行情 + 選擇權Put/Call比）。
 * 由 GitHub Actions（.github/workflows/daily-batch.yml）在台股收盤後打這支。
 * 只需2次TAIFEX API請求，很快，改成同步等待讓curl -sf能反映真正的成功/失敗
 * （2026-08-10：這支本身沒問題，是同一批fire-and-forget route裡順手一起改的，
 * 理由見 decision-os-daily route 的說明）。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runTaifexDailyUpdate();
    console.log(
      `[cron/taifex-daily] done: futures written=${result.futuresWritten}, put/call ratio days written=${result.putCallRatioWritten}`
    );
    return NextResponse.json({ status: "done", ...result });
  } catch (err) {
    console.error("[cron/taifex-daily] failed:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
