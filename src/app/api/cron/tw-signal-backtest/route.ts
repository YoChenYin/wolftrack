import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { runTwSignalBacktest } from "@/lib/marketData/runTwSignalBacktest";

/**
 * 手動觸發：戰術訊號回測v1（trustTurnBuy/combinedBuy/trustTurnSell/combinedSell/
 * headShoulders/nShape，見backtestWalkForward.ts）。刻意不掛進.github/workflows/
 * daily-batch.yml的排程——這不是每天都要重跑的資料抓取，是「調整偵測邏輯參數後想重新
 * 驗證」才需要手動觸發一次的離線分析，掛進每日排程只會白白浪費資源。
 *
 * 本機測試：全部台股（288檔有足夠歷史）2.3秒跑完，prod資料量更大（更多股票、更完整的
 * 歷史）但架構上是同一套O(n²)等級的運算，預期還是在可接受時間內跑完，用fire-and-forget
 * 避免佔住HTTP連線。觸發方式：curl -X POST $APP_URL/api/cron/tw-signal-backtest
 * -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  runTwSignalBacktest()
    .then((result) => {
      console.log(
        `[cron/tw-signal-backtest] done: processed=${result.stocksProcessed}, skipped=${result.stocksSkippedInsufficientData}, events=${result.eventsWritten}, failed=${result.failed.length}`
      );
    })
    .catch((err) => {
      console.error("[cron/tw-signal-backtest] failed:", err);
    });

  return NextResponse.json({ status: "started" }, { status: 202 });
}
