import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { fetchTwQuarterlyEpsSnapshot } from "@/lib/marketData/fetchTwQuarterlyEps";

/**
 * 排程觸發：台股季度累積EPS快照（TWSE t187ap14_L + TPEx mopsfin_t187ap14_O，見
 * quarterlyEpsClient.ts）。財報公告日期比月營收分散（各公司申報時間不同，集中在
 * 季底後1.5-2個月），用跟tw-revenue一樣的「每月固定跑幾天當緩衝」策略，不用天天跑
 * （端點只回傳同一期資料，天天打純粹浪費請求）。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  fetchTwQuarterlyEpsSnapshot()
    .then((result) => {
      console.log(`[cron/tw-quarterly-eps] done: wrote=${result.written}, skipped=${result.skipped}`);
    })
    .catch((err) => {
      console.error("[cron/tw-quarterly-eps] failed:", err);
    });

  return NextResponse.json({ status: "started" }, { status: 202 });
}
