import { NextResponse } from "next/server";
import { listAllChainNames } from "@/lib/valuation/groupConfig";
import { computeChainSignals } from "@/lib/valuation/computeChainSignals";

/**
 * GET /api/chain-signals
 *
 * 給首頁「產業鏈訊號燈號」用：算出全部6條產業鏈（半導體/AI伺服器/被動元件/記憶體/電動車/光通訊）
 * 每個階段（上游/中游/下游/支援層）目前的訊號比例+近5日報酬，一次算完回傳（TW only）。
 */
export async function GET() {
  const chainNames = listAllChainNames();
  const results = await Promise.all(chainNames.map((name) => computeChainSignals(name)));
  return NextResponse.json({ chains: results.filter((r) => r !== null) });
}
