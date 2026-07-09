import { NextRequest, NextResponse } from "next/server";
import { findIndustryThemeByName } from "@/lib/valuation/groupConfig";
import { computeGroupValuation } from "@/lib/valuation/computeGroupValuation";

/**
 * GET /api/theme-valuation?theme={theme_name}
 *
 * 給首頁「選了非全部的板塊」時用：板塊現在對應 group_config.json 的 theme_name（見
 * sectorTrendsQuery.ts 的 buildStockFilter），選定某個 theme 後除了篩戰術面板，也順便
 * 秀出這個族群全部成員的 PE/PB 估值比較（跟個股詳情頁的供應鏈估值比較共用 computeGroupValuation）。
 * 只有 TW 有 group_config theme，US 不會呼叫這支 API。
 */
export async function GET(request: NextRequest) {
  const themeName = request.nextUrl.searchParams.get("theme");
  if (!themeName) {
    return NextResponse.json({ error: "Missing theme" }, { status: 400 });
  }

  const theme = findIndustryThemeByName(themeName);
  if (!theme) {
    return NextResponse.json({ error: `Unknown theme "${themeName}"` }, { status: 404 });
  }

  const valuation = await computeGroupValuation(theme);
  return NextResponse.json(valuation);
}
