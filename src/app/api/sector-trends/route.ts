import { NextRequest, NextResponse } from "next/server";
import type { Market } from "@/generated/prisma/enums";
import {
  tacticalStatusesForMarket,
  fetchSectorTrendsForMode,
  fetchSectorTrendsGrouped,
  type TacticalStatus,
} from "@/lib/trend/sectorTrendsQuery";

const VALID_MARKETS: Market[] = ["US", "TW"];

/**
 * GET /api/sector-trends?market={US|TW}&sector={sectorCode}&theme={themeCode}&mode={...}&limit={n}
 *
 * mode 的合法值依market而定：US是reversal/pullback/bullish，TW是entry/exit/buyDip
 * （2026-07-23改版，兩個市場用不同的三段式詞彙，見 sectorTrendsQuery.ts 的 TacticalStatus 說明）。
 *
 * - market 省略：預設 US（維持既有美股版行為不變）
 * - sector 省略或 "all"：不篩選板塊
 * - theme 省略或 "all"：不篩選題材（AI infra / 散熱 / 被動元件 / CPO / PCB，目前只有 US 有資料）
 * - mode 省略：回傳三種狀態各自排行（給三欄戰術面板一次拿齊資料用）；有給則只回傳該狀態
 * - 只回傳「最新一個有資料的交易日」（daily_trend_signals 裡該 market 下的 MAX(trade_date)）
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const marketParam = searchParams.get("market") ?? "US";
  const sectorCode = searchParams.get("sector");
  const themeCode = searchParams.get("theme");
  const modeParam = searchParams.get("mode");
  const limitParam = searchParams.get("limit");

  if (!VALID_MARKETS.includes(marketParam as Market)) {
    return NextResponse.json(
      { error: `Invalid market "${marketParam}". Must be one of: ${VALID_MARKETS.join(", ")}` },
      { status: 400 }
    );
  }
  const market = marketParam as Market;
  const validModesForMarket = tacticalStatusesForMarket(market);

  if (modeParam && !validModesForMarket.includes(modeParam as TacticalStatus)) {
    return NextResponse.json(
      { error: `Invalid mode "${modeParam}" for market "${market}". Must be one of: ${validModesForMarket.join(", ")}` },
      { status: 400 }
    );
  }

  if (modeParam) {
    const result = await fetchSectorTrendsForMode({
      market,
      sectorCode,
      themeCode,
      mode: modeParam as TacticalStatus,
      limit: limitParam ? Number(limitParam) : undefined,
    });
    return NextResponse.json(result);
  }

  const result = await fetchSectorTrendsGrouped({
    market,
    sectorCode,
    themeCode,
    limit: limitParam ? Number(limitParam) : undefined,
  });
  return NextResponse.json(result);
}
