import { NextResponse } from "next/server";
import { computeThemeHeatmap } from "@/lib/valuation/computeThemeHeatmap";

/**
 * GET /api/theme-heatmap
 *
 * 給首頁「所有板塊熱圖」用，回傳全部 43 個 theme 的 5/10/20 日平均報酬率。
 * 跟板塊/theme 篩選是否有選定無關，一次算全部（TW only，US 沒有 group_config theme）。
 */
export async function GET() {
  const cells = await computeThemeHeatmap();
  return NextResponse.json({ cells });
}
