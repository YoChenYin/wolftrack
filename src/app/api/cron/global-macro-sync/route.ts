import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { syncGlobalMacroSeries } from "@/lib/marketData/globalMacroSeries";

/**
 * 排程觸發：Decision Lab 全球市場+波動度參考序列同步（FRED，SPX/NASDAQ/DOW/BTC/WTI/DXY/US10Y/US2Y/VIX）。
 * 由 GitHub Actions（daily-batch.yml）觸發，跑在 decision-lab-daily 之前。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  syncGlobalMacroSeries()
    .then((results) => {
      const failed = results.filter((r) => r.error);
      console.log(
        `[cron/global-macro-sync] done: ${results.length - failed.length}/${results.length} ok${failed.length > 0 ? `, failed: ${failed.map((f) => f.ticker).join(",")}` : ""}`
      );
    })
    .catch((err) => {
      console.error("[cron/global-macro-sync] failed:", err);
    });

  return NextResponse.json({ status: "started" }, { status: 202 });
}
