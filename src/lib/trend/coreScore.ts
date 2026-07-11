import { clamp } from "./utils";
import type { SubScores } from "./types";

/**
 * ⚠️假設：五因子權重，出自 docs/trend-core-implementation-logic.md 第1章。
 * TODO: 待業務/量化端核對權重是否符合原本設計。
 */
export const CORE_SCORE_WEIGHTS = {
  ma: 0.3,
  momentum: 0.25,
  adx: 0.2,
  relStrength: 0.15,
  volume: 0.1,
} as const;

/** 均線排列：價格 vs 20/50/200MA 相對位置 + 均線多頭排列程度，0-100 */
export function scoreMaAlignment(
  close: number,
  ma20: number | null,
  ma50: number | null,
  ma200: number | null,
  /**
   * 2026-07-11：中短線強訊號 MA5>MA10>MA20，選填（只有台股版會傳，見 calculateTwDailySignal.ts）。
   * 美股版維持原本 5 項檢查、分母不變（沒有對應美股回測證據前不動美股行為）。
   * TODO: 待回測驗證這個因子對 20 日超額報酬的實際貢獻，目前只是加進均線排列分數，還沒獨立驗證過。
   */
  ma5?: number | null,
  ma10?: number | null
): number {
  const checks = [
    ma20 !== null && close > ma20,
    ma50 !== null && close > ma50,
    ma200 !== null && close > ma200,
    ma20 !== null && ma50 !== null && ma20 > ma50,
    ma50 !== null && ma200 !== null && ma50 > ma200,
  ];
  if (ma5 !== undefined && ma10 !== undefined) {
    checks.push(ma5 !== null && ma10 !== null && ma20 !== null && ma5 > ma10 && ma10 > ma20);
  }
  const passed = checks.filter(Boolean).length;
  return (passed / checks.length) * 100;
}

/**
 * RSI 子分數：50-70 為佳（滿分），>80 過熱扣分。
 * ⚠️假設：分段線性內插，非官方公式。TODO: 待業務端確認。
 */
function scoreRsi(rsi14: number | null): number {
  if (rsi14 === null) return 50;
  if (rsi14 <= 30) return 20;
  if (rsi14 <= 50) return 20 + ((rsi14 - 30) / 20) * 60; // 20 -> 80
  if (rsi14 <= 70) return 100; // 50-70 為佳
  if (rsi14 <= 80) return 100 - ((rsi14 - 70) / 10) * 40; // 100 -> 60
  return 40; // >80 過熱扣分
}

/** 動能：RSI(14) 與 ROC(20) 各半權重，0-100 */
export function scoreMomentum(rsi14: number | null, roc20: number | null): number {
  const rsiScore = scoreRsi(rsi14);
  const rocScore = roc20 === null ? 50 : clamp(50 + roc20 * 2, 0, 100);
  return rsiScore * 0.5 + rocScore * 0.5;
}

/** 趨勢強度：ADX(14)，數值越高分數越高，⚠️假設 ADX=50 對應滿分 100 */
export function scoreAdx(adx14: number | null): number {
  if (adx14 === null) return 50;
  return clamp((adx14 / 50) * 100, 0, 100);
}

/** 相對強度：該股 20/60 日超額報酬（相對 benchmark）平均，⚠️假設 ±20% 超額報酬對應 0-100 */
export function scoreRelStrength(excessReturn20: number | null, excessReturn60: number | null): number {
  const vals = [excessReturn20, excessReturn60].filter((v): v is number => v !== null);
  if (vals.length === 0) return 50;
  const avgExcess = vals.reduce((a, b) => a + b, 0) / vals.length;
  return clamp(50 + avgExcess * 2.5, 0, 100);
}

/** 量能確認：近5日均量 / 近20日均量放大比例，⚠️假設 1.5倍對應滿分 */
export function scoreVolume(avgVolume5: number | null, avgVolume20: number | null): number {
  if (avgVolume5 === null || avgVolume20 === null || avgVolume20 === 0) return 50;
  const ratio = avgVolume5 / avgVolume20;
  return clamp(50 + (ratio - 1) * 100, 0, 100);
}

export function combineCoreScore(scores: SubScores): number {
  const raw =
    scores.ma * CORE_SCORE_WEIGHTS.ma +
    scores.momentum * CORE_SCORE_WEIGHTS.momentum +
    scores.adx * CORE_SCORE_WEIGHTS.adx +
    scores.relStrength * CORE_SCORE_WEIGHTS.relStrength +
    scores.volume * CORE_SCORE_WEIGHTS.volume;
  return Math.round(clamp(raw, 0, 100) * 100) / 100;
}
