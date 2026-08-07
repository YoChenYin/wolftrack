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

/**
 * PRD第8節權重：Macro20/Liquidity20/Trend20/Sentiment15/Volatility15/Breadth10，加總100。
 *
 * Trend/Volatility已用 scripts/calibrate-decision-weights.ts 校準過（SPX+VIX 2016-2026，
 * 2283個交易日，IC vs 未來5/10/20日報酬）——結論是「不調整」，原因記錄如下：
 * 兩者IC在train/test/全樣本、三個窗口都「穩定為負」（例如20日：Trend=-0.128、Volatility=-0.189，
 * 樣本外一致甚至更負），且Volatility的|IC|穩定大於Trend。若照標準做法（|IC|越大權重越高）會把
 * Volatility權重調高，但這裡不能照做：負IC代表volScore（VIX低=高分）跟未來報酬是反向關係，
 * 最可能的解讀是VIX急升後常見的均值回歸式反彈（恐慌後跌深反彈），這跟regimeEngine.ts裡
 * capitulation regime的假設方向一致，但跟這個線性因子「VIX低=偏多」的計分邏輯方向相反。
 * 也就是說volScore目前的正負號本身可能沒有對齊它想抓的效應，這是計分邏輯要重新設計的問題
 * （例如改用VIX的變化率/相對歷史分位數，而不是絕對水位），不是單純調權重能修好的；
 * 硬把權重往上調只會放大一個方向可能算反的因子。維持PRD原值，留待Volatility計分邏輯
 * 重新設計後再校準。Macro/Liquidity/Sentiment/Breadth目前資料不足（value恆為null），未校準。
 */
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
