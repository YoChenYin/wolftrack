import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { generateDailyReport } from "@/lib/trend/tw/generateDailyReport";

/**
 * 排程觸發：台股每日異動報告v1（見dailyMarketDiff.ts）。掛在tw-daily/decision-os-daily
 * 後面（.github/workflows/daily-batch.yml），需要當天的daily_trend_signals/tw_daily_price
 * 已經寫完才有東西可以比對。
 *
 * 2026-08-26：原本是fire-and-forget（回202「started」後才真的跑generateDailyReport()），
 * 排查每日異動報告一度500時發現這比institutional-reports當初的問題更嚴重——那邊至少
 * response內容會反映真實結果只是workflow沒去讀，這支連response本身都不反映結果，workflow
 * 就算補echo也查不出東西。generateDailyReport()是輕量的DB讀寫（不像tw-daily/taifex-daily
 * 要爬外部網站），沒有fire-and-forget的必要，改成awaited、回傳真實結果，失敗時回500。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await generateDailyReport();
    console.log(`[cron/tw-daily-report] ${result.status}: ${JSON.stringify(result)}`);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/tw-daily-report] failed:", err);
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}
