import type { MarketRegime, ScoreFactor, TradingScoreResult } from "./types";
import { SCORE_FACTOR_WEIGHTS } from "./types";

/**
 * M8 Trading Score（docs/decision-lab-prd.html 第8節）。Phase 1 只有 Trend(SPX regime) 跟
 * Volatility(VIX) 兩個因子有真實資料——Macro/Liquidity/Sentiment/Breadth 都還缺資料源，
 * 這裡誠實記為 null，score只加總「有資料的因子」，maxPossibleScore告訴使用者滿分實際上限是多少，
 * 不會假裝100分制但其實只有35分的因子在起作用。
 *
 * Liquidity 這裡刻意不拿台指期選擇權PCR頂替：那是台股期貨的籌碼指標，跟這裡談的「全球市場流動性」
 * （ETF Flow/外資部位/融資/公債殖利率走勢）是不同的概念，混用會誤導使用者以為有全球流動性訊號。
 */
function trendFactorScore(regime: MarketRegime): number {
  const table: Record<MarketRegime, number> = {
    strongBull: 90,
    weakBull: 65,
    range: 50,
    weakBear: 35,
    strongBear: 10,
    volatile: 40,
    distribution: 45,
    accumulation: 55,
    capitulation: 20,
  };
  return table[regime];
}

function volatilityFactorScore(vixLevel: number): number {
  if (vixLevel < 15) return 90;
  if (vixLevel < 20) return 70;
  if (vixLevel < 25) return 50;
  if (vixLevel < 30) return 30;
  return 10;
}

export function computeTradingScore(regime: MarketRegime, vixLevel: number): TradingScoreResult {
  const factors: ScoreFactor[] = [
    {
      key: "trend",
      label: "Trend",
      weight: SCORE_FACTOR_WEIGHTS.trend,
      value: trendFactorScore(regime),
      detail: `依當前市場狀態(${regime})評分`,
    },
    {
      key: "volatility",
      label: "Volatility",
      weight: SCORE_FACTOR_WEIGHTS.volatility,
      value: volatilityFactorScore(vixLevel),
      detail: `VIX ${vixLevel.toFixed(1)}`,
    },
    { key: "macro", label: "Macro", weight: SCORE_FACTOR_WEIGHTS.macro, value: null, detail: "事件行事曆資料源尚未建置" },
    { key: "liquidity", label: "Liquidity", weight: SCORE_FACTOR_WEIGHTS.liquidity, value: null, detail: "ETF Flow/外資部位資料源尚未建置" },
    { key: "sentiment", label: "Sentiment", weight: SCORE_FACTOR_WEIGHTS.sentiment, value: null, detail: "Fear&Greed/AAII資料源尚未建置" },
    { key: "breadth", label: "Breadth", weight: SCORE_FACTOR_WEIGHTS.breadth, value: null, detail: "美股全市場廣度資料源尚未建置" },
  ];

  let weightedSum = 0;
  let maxPossibleScore = 0;
  for (const f of factors) {
    if (f.value !== null) {
      weightedSum += (f.value / 100) * f.weight;
      maxPossibleScore += f.weight;
    }
  }

  return { score: Math.round(weightedSum), maxPossibleScore, factors };
}
