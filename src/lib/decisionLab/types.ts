/**
 * Decision Lab（總經頁最上方，見 docs/decision-lab-prd.html）共用型別。
 * Phase 1 範圍：M1(全球市場) + M7(Regime) + M8(Trading Score) + M9(Scenario) + M10(Trading Plan)
 * + M11(風險建議) + M12(Execution Checklist，純前端狀態，無對應型別)。
 */

export type MarketRegime =
  | "strongBull"
  | "weakBull"
  | "range"
  | "weakBear"
  | "strongBear"
  | "volatile"
  | "distribution"
  | "accumulation"
  | "capitulation";

export const REGIME_LABELS: Record<MarketRegime, string> = {
  strongBull: "強勢多頭",
  weakBull: "溫和多頭",
  range: "區間盤整",
  weakBear: "溫和空頭",
  strongBear: "強勢空頭",
  volatile: "劇烈波動",
  distribution: "高檔派發",
  accumulation: "低檔吸籌",
  capitulation: "恐慌性賣壓",
};

export interface GlobalMarketEntry {
  ticker: string;
  label: string;
  close: number;
  changePct: number | null;
  gapPct: number | null;
}

export interface RegimeResult {
  regime: MarketRegime;
  reasoning: string;
}

export type ScoreFactorKey = "macro" | "liquidity" | "trend" | "sentiment" | "volatility" | "breadth";

export interface ScoreFactor {
  key: ScoreFactorKey;
  label: string;
  weight: number; // 0-100
  /** null = 資料不足，該因子貢獻0分且不計入maxPossibleScore，UI要誠實標示，不是假裝算出了0分 */
  value: number | null; // 0-100 該因子自己的分數
  detail: string;
}

/** PRD第8節權重：Macro20/Liquidity20/Trend20/Sentiment15/Volatility15/Breadth10，加總100 */
export const SCORE_FACTOR_WEIGHTS: Record<ScoreFactorKey, number> = {
  macro: 20,
  liquidity: 20,
  trend: 20,
  sentiment: 15,
  volatility: 15,
  breadth: 10,
};

export interface TradingScoreResult {
  score: number; // 0-100，只加總有資料的因子
  maxPossibleScore: number; // 有資料的因子權重總和，可能<100
  factors: ScoreFactor[];
}

export type TradingStrategy = "trendFollowing" | "breakout" | "meanReversion" | "scalping" | "noTrade";

export const STRATEGY_LABELS: Record<TradingStrategy, string> = {
  trendFollowing: "Trend Following",
  breakout: "Breakout",
  meanReversion: "Mean Reversion",
  scalping: "Scalping",
  noTrade: "No Trade",
};

export interface TradingPlanResult {
  strategy: TradingStrategy;
  reason: string;
  suggestedSizePct: 0 | 25 | 50 | 75 | 100;
}

export interface ScenarioCase {
  label: "A" | "B" | "C";
  description: string;
  probability: number;
  condition: string;
  risk: string;
  strategy: string;
}
