import type { DecisionOsSnapshotView } from "@/lib/decisionOs/queryLatestSnapshot";
import type { DecisionLabSnapshotView } from "@/lib/decisionLab/querySnapshot";
import { REGIME_LABELS, type MarketRegime } from "@/lib/decisionLab/types";

/**
 * 台指期 Decision OS（台股/台指本身的多空判斷）跟 Decision Lab（全球總經環境判斷）
 * 是兩套完全獨立的系統、看不同市場（TAIEX vs SPX）、用不同資料源，本來就沒有互相
 * 呼叫或共用權重——這裡只做「事後對照」：兩邊結論方向一不一致，讓使用者自己判斷
 * 這代表「台股走勢背離全球環境」還是「兩邊都指向同個方向、訊心度較高」，不是
 * 幫兩套系統加總出一個新分數（加總沒有意義：權重/校準方式完全不同，見PRD）。
 */

export type CrossCheckDirection = "bull" | "bear" | "neutral";
export type CrossCheckAlignment = "alignedBull" | "alignedBear" | "alignedNeutral" | "partial" | "diverged";

export interface CrossCheckResult {
  osDirection: CrossCheckDirection | null;
  labDirection: CrossCheckDirection | null;
  alignment: CrossCheckAlignment | null;
  summary: string;
}

const BULLISH_REGIMES: MarketRegime[] = ["strongBull", "weakBull", "accumulation"];
const BEARISH_REGIMES: MarketRegime[] = ["strongBear", "weakBear", "distribution", "capitulation"];

function regimeDirection(regime: MarketRegime): CrossCheckDirection {
  if (BULLISH_REGIMES.includes(regime)) return "bull";
  if (BEARISH_REGIMES.includes(regime)) return "bear";
  return "neutral";
}

const STANCE_ZH: Record<CrossCheckDirection, string> = { bull: "多", bear: "空", neutral: "中性" };

export function computeCrossCheck(
  os: DecisionOsSnapshotView | null,
  lab: DecisionLabSnapshotView | null
): CrossCheckResult {
  const osDirection: CrossCheckDirection | null = os ? os.finalStance : null;
  const labDirection: CrossCheckDirection | null = lab ? regimeDirection(lab.regime) : null;

  if (osDirection === null || labDirection === null) {
    return { osDirection, labDirection, alignment: null, summary: "兩套系統至少有一邊還沒有今日快照，暫時無法對照。" };
  }

  let alignment: CrossCheckAlignment;
  let summary: string;

  if (osDirection === labDirection) {
    alignment = osDirection === "bull" ? "alignedBull" : osDirection === "bear" ? "alignedBear" : "alignedNeutral";
    summary =
      osDirection === "neutral"
        ? "台指本身跟全球總經環境都沒有明確方向，兩邊一致指向觀望。"
        : `台指本身的判斷（${STANCE_ZH[osDirection]}）跟全球總經環境（${REGIME_LABELS[lab!.regime]}）方向一致，訊心度相對較高。`;
  } else if (osDirection === "neutral" || labDirection === "neutral") {
    alignment = "partial";
    const which = osDirection === "neutral" ? "台指本身" : "全球總經環境";
    const other = osDirection === "neutral" ? `全球總經環境（${REGIME_LABELS[lab!.regime]}）` : `台指本身（${STANCE_ZH[osDirection]}）`;
    summary = `${which}目前沒有明確方向，但${other}偏${STANCE_ZH[osDirection === "neutral" ? labDirection : osDirection]}——算部分確認，不是完全一致。`;
  } else {
    alignment = "diverged";
    summary = `台指本身判斷${STANCE_ZH[osDirection]}，但全球總經環境是${REGIME_LABELS[lab!.regime]}（偏${STANCE_ZH[labDirection]}）——兩套系統方向分歧，建議降低信心度、嚴守停損。`;
  }

  return { osDirection, labDirection, alignment, summary };
}
