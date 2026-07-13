import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { fetchTwMonthlyRevenueSnapshot } from "@/lib/marketData/fetchTwMonthlyRevenue";

/**
 * 排程觸發：台股月營收快照（TWSE t187ap05_L + TPEx mopsfin_t187ap05_O，見 monthlyRevenueClient.ts）。
 * 官方每月10日左右公布上月營收，所以獨立排一個「每月10-12號」的排程，不用像股價/訊號那樣天天跑
 * （跑了也沒用，端點只會回傳同一期資料，天天打純粹浪費請求）。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  fetchTwMonthlyRevenueSnapshot()
    .then((result) => {
      console.log(`[cron/tw-revenue] done: wrote=${result.written}, skipped=${result.skipped}`);
    })
    .catch((err) => {
      console.error("[cron/tw-revenue] failed:", err);
    });

  return NextResponse.json({ status: "started" }, { status: 202 });
}
