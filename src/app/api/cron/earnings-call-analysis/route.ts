import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { runEarningsCallAnalysisBatch, parsePendingFilings, PROCESS_BUDGET_PER_INVOCATION } from "@/lib/marketData/runEarningsCallAnalysis";

/**
 * 2026-07-25：龍頭股法說會基本面訊號，awaited等它真的跑完才回應（不是fire-and-forget，
 * 見runEarningsCallAnalysis.ts說明），單次呼叫限制在小批次、幾秒到幾十秒內完成。
 *
 * 2026-08-21：加`?discover=false`——原本workflow裡5輪都重新掃一次全市場（290+檔）MOPS
 * 法說會清單再解析，光discovery（純HTML查詢，沒有LLM/PDF下載，見runEarningsCallAnalysis.ts
 * 的discoverNewFilings()）單輪就要跑1分半左右，5輪重複掃浪費掉的時間換算下來每週少掉2-3輪
 * 真正在解析PDF的額度。清了556篇積壓（2026-08-21發現法說會待解析數量遠超過原本每週40篇的
 * 處理量）之後這個問題更明顯，改成第一輪discover+parse，後面幾輪只parse不discover。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const skipDiscovery = request.nextUrl.searchParams.get("discover") === "false";
  if (skipDiscovery) {
    const parseResult = await parsePendingFilings(PROCESS_BUDGET_PER_INVOCATION);
    return NextResponse.json({ stocksChecked: 0, totalDiscovered: 0, totalProcessed: parseResult.processed, totalErrors: parseResult.errors });
  }

  const result = await runEarningsCallAnalysisBatch();
  return NextResponse.json(result);
}
