import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { syncGlobalMacroSeries } from "@/lib/marketData/globalMacroSeries";

/**
 * 排程觸發：Decision Lab 全球市場+波動度參考序列同步（FRED，SPX/NASDAQ/DOW/BTC/WTI/DXY/US10Y/US2Y/VIX）。
 * 由 GitHub Actions（daily-batch.yml）觸發，跑在 decision-lab-daily 之前。
 *
 * ⚠️2026-08-10：原本是fire-and-forget（先回202，實際同步在背景繼續跑）——GitHub Actions的
 * curl -sf只看得到HTTP有沒有回應成功，看不到背景工作有沒有真的做完。這次production卡了好幾天
 * 都沒同步到最新資料，正是背景工作沒跑完就被中斷、但cron job卻顯示綠色成功。改成同步等待
 * （改完sync邏輯只拉增量後，正常情況每次應該只需幾秒），curl -f才能真的反映實際成功或失敗。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await syncGlobalMacroSeries();
    const failed = results.filter((r) => r.error);
    console.log(
      `[cron/global-macro-sync] done: ${results.length - failed.length}/${results.length} ok${failed.length > 0 ? `, failed: ${failed.map((f) => f.ticker).join(",")}` : ""}`
    );
    if (failed.length > 0) {
      return NextResponse.json({ status: "partial_failure", failed }, { status: 500 });
    }
    return NextResponse.json({ status: "done", results });
  } catch (err) {
    console.error("[cron/global-macro-sync] failed:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
