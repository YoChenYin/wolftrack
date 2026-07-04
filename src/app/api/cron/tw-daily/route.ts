import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { runTwDailyUpdate } from "@/lib/marketData/runTwDailyUpdate";

/**
 * 排程觸發：台股每日增量更新（補今天一天的股價+三大法人+PE/PB -> 重算訊號）。
 * 由 GitHub Actions（.github/workflows/daily-batch.yml）或 Zeabur Cron 在台股收盤後打這支。
 * 只需 3-4 次 TWSE API 請求，跑得比美股快很多，但一樣用背景 fire-and-forget 避免佔住 HTTP 連線。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  runTwDailyUpdate()
    .then((result) => {
      console.log(
        `[cron/tw-daily] done: prices=${result.pricesUpdated}, institutional=${result.institutionalUpdated}, signals wrote=${result.batch.written}, valuation wrote=${result.valuation.written}`
      );
    })
    .catch((err) => {
      console.error("[cron/tw-daily] failed:", err);
    });

  return NextResponse.json({ status: "started" }, { status: 202 });
}
