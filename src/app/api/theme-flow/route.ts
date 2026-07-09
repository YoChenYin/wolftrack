import { NextResponse } from "next/server";
import { computeThemeFlow } from "@/lib/valuation/computeThemeFlow";

/**
 * GET /api/theme-flow
 *
 * 給首頁「資金流動」折線圖用：14個大分類過去20個交易日的族群平均累積報酬指數時間序列。
 * TW only（US 沒有 group_config theme）。
 */
export async function GET() {
  const result = await computeThemeFlow();
  return NextResponse.json(result);
}
