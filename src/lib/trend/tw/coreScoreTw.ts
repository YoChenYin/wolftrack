import { clamp } from "@/lib/trend/utils";

/**
 * ⚠️假設：技術面/籌碼面 50/50 權重，出自 docs/wolftrack-tw-spec.md 3.1
 * 「Core Score (台股版) = 0.50 × Technical_Score + 0.50 × Chip_Score」。
 * TODO: 待業務/量化端核對比例（spec 待確認清單第1項）。
 */
export const TW_CORE_SCORE_WEIGHTS = { technical: 0.5, chip: 0.5 } as const;

export function combineCoreScoreTw(technicalScore: number, chipScore: number): number {
  const raw = technicalScore * TW_CORE_SCORE_WEIGHTS.technical + chipScore * TW_CORE_SCORE_WEIGHTS.chip;
  return Math.round(clamp(raw, 0, 100) * 100) / 100;
}
