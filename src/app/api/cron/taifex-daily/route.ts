import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { runTaifexDailyUpdate } from "@/lib/marketData/runTaifexDailyUpdate";

/**
 * 排程觸發：台指期每日更新（台指期近月行情 + 選擇權Put/Call比）。
 * 由 GitHub Actions（.github/workflows/daily-batch.yml）在台股收盤後打這支。
 * 只需2次TAIFEX API請求，一樣用背景 fire-and-forget 避免佔住 HTTP 連線。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  runTaifexDailyUpdate()
    .then((result) => {
      console.log(
        `[cron/taifex-daily] done: futures written=${result.futuresWritten}, put/call ratio days written=${result.putCallRatioWritten}`
      );
    })
    .catch((err) => {
      console.error("[cron/taifex-daily] failed:", err);
    });

  return NextResponse.json({ status: "started" }, { status: 202 });
}
