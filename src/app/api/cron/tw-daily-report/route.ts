import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { generateDailyReport } from "@/lib/trend/tw/generateDailyReport";

/**
 * 排程觸發：台股每日異動報告v1（見dailyMarketDiff.ts）。掛在tw-daily/decision-os-daily
 * 後面（.github/workflows/daily-batch.yml），需要當天的daily_trend_signals/tw_daily_price
 * 已經寫完才有東西可以比對。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  generateDailyReport()
    .then((result) => {
      console.log(`[cron/tw-daily-report] ${result.status}: ${JSON.stringify(result)}`);
    })
    .catch((err) => {
      console.error("[cron/tw-daily-report] failed:", err);
    });

  return NextResponse.json({ status: "started" }, { status: 202 });
}
