import { LAYER_WEIGHTS, type LayerScore } from "./types";

export interface DecisionTier {
  minScore: number;
  stars: 1 | 2 | 3 | 4 | 5;
  label: string;
  stance: "bull" | "bear" | "neutral";
}

/**
 * PRD 第5節錨點表，依 minScore 由高到低排列，取第一個 totalScore >= minScore 的級距（下界含）。
 * MVP 只有 L3/L4/L6 有分數，理論最大值因此低於滿權重的±20，見 computeDecision() 的 maxPossibleScore。
 */
const TIERS: DecisionTier[] = [
  { minScore: 15, stars: 5, label: "非常適合做多", stance: "bull" },
  { minScore: 8, stars: 4, label: "偏多", stance: "bull" },
  { minScore: 3, stars: 3, label: "保守偏多", stance: "bull" },
  { minScore: -2, stars: 2, label: "等待", stance: "neutral" },
  { minScore: -7, stars: 2, label: "偏空", stance: "bear" },
  { minScore: -14, stars: 1, label: "做空", stance: "bear" },
  { minScore: -Infinity, stars: 1, label: "空方趨勢", stance: "bear" },
];

export interface DecisionResult {
  totalScore: number;
  maxPossibleScore: number;
  tier: DecisionTier;
  layerScores: LayerScore[];
}

/**
 * 確定性 Decision Engine（PRD 第5節「基準版」）：Total = Σ(層分數 × 層權重)。
 * 這是 Agent 辯論引擎（PRD 第6節，尚未實作）上線前的生產環境判斷依據，也是回測用的版本。
 */
export function computeDecision(layerScores: LayerScore[]): DecisionResult {
  let weightedSum = 0;
  let maxPossibleScore = 0;

  for (const layer of layerScores) {
    const weight = LAYER_WEIGHTS[layer.layer];
    maxPossibleScore += 2 * weight;
    if (layer.score !== null) {
      weightedSum += layer.score * weight;
    }
  }

  const totalScore = Math.round(weightedSum * 100) / 100;
  const tier = TIERS.find((t) => totalScore >= t.minScore) ?? TIERS[TIERS.length - 1];

  return { totalScore, maxPossibleScore, tier, layerScores };
}
