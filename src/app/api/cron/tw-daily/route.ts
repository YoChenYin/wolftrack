import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { getTwDailyPipelineState, isTwDailyPipelineRunning, runTwDailyPipeline } from "@/lib/marketData/twDailyPipeline";

/**
 * 排程觸發：台股每日增量更新（補今天一天的股價+三大法人+PE/PB -> 重算訊號 -> 每日異動報告）。
 * 由 GitHub Actions（.github/workflows/daily-batch.yml）在台股收盤後打這支；抓800檔要跑一段
 * 時間，一樣用背景 fire-and-forget 避免佔住 HTTP 連線。
 *
 * 2026-09-30：主要觸發來源改成app內排程（src/lib/scheduler/twDailyScheduler.ts），GitHub
 * 這邊變成備援——GitHub排程常延遲好幾小時才打進來，那時app內排程通常已經更新完了，
 * 這裡直接回skipped不重抓。要強制重跑加 ?force=1。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isTwDailyPipelineRunning()) {
    return NextResponse.json({ status: "already-running" }, { status: 202 });
  }

  const force = request.nextUrl.searchParams.get("force") === "1";
  if (!force) {
    // 狀態檢查本身失敗（TWSE暫時連不上等）時照舊執行更新，不能因為多了這道檢查反而讓備援失效
    const state = await getTwDailyPipelineState().catch((err) => {
      console.error("[cron/tw-daily] state check failed, running anyway:", err);
      return null;
    });
    if (state?.alreadyDone) {
      return NextResponse.json({ status: "skipped", reason: "already-updated", latestTradeDate: state.latestTradeDate });
    }
  }

  runTwDailyPipeline(force ? "cron-route-forced" : "cron-route").catch((err) => {
    console.error("[cron/tw-daily] failed:", err);
  });

  return NextResponse.json({ status: "started" }, { status: 202 });
}
