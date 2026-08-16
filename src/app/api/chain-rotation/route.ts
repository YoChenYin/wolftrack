import { NextResponse } from "next/server";
import { listAllChainNames } from "@/lib/valuation/groupConfig";
import { computeChainRotation } from "@/lib/valuation/computeChainRotation";

/**
 * GET /api/chain-rotation
 *
 * 給首頁「產業鏈資金輪動」用：6條產業鏈各自上中下游階段近半年的族群平均累積報酬時間序列
 * + 最新籌碼集中度，一次算完回傳，前端用tab切換要看哪條鏈（TW only）。
 */
export async function GET() {
  const chainNames = listAllChainNames();
  const results = await Promise.all(chainNames.map((name) => computeChainRotation(name)));
  return NextResponse.json({ chains: results.filter((r) => r !== null) });
}
