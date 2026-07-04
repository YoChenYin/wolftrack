import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { runUsDailyBatch } from "@/lib/marketData/runUsDailyBatch";

/**
 * 排程觸發：美股每日批次計算（抓 Polygon.io -> 算 Core Score -> 寫 daily_trend_signals）。
 * 由 GitHub Actions（.github/workflows/daily-batch.yml）或 Zeabur Cron 在美股收盤後打這支。
 *
 * 117 檔股票在 Polygon 免費方案 5 req/分鐘節流下要跑 ~25 分鐘，遠超過一般 reverse proxy
 * 的 HTTP timeout，所以這裡不等它跑完才回應——啟動後立刻回 202，實際工作在背景跑完，
 * 結果看 Zeabur 的 service log（Zeabur 是常駐 container，不是短命的 serverless function，
 * response 送出後背景 promise 不會被砍掉）。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  runUsDailyBatch()
    .then((result) => {
      console.log(`[cron/us-batch] done: wrote ${result.written}, skippedNone ${result.skippedNone}, skippedError ${result.skippedError}`);
      for (const line of result.log) console.log(`[cron/us-batch] ${line}`);
    })
    .catch((err) => {
      console.error("[cron/us-batch] failed:", err);
    });

  return NextResponse.json({ status: "started" }, { status: 202 });
}
