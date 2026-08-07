import type { MarketRegime, TradingPlanResult, TradingStrategy } from "./types";

/**
 * M10 Trading Plan + M11 風險建議（docs/decision-lab-prd.html 第10/11節）。純運算，依 Regime
 * 對應策略類型跟建議倉位——這裡的「建議倉位」是總經層級的曝險參考（0/25/50/75/100%），
 * 不是台指期Decision OS那種算到「幾口合約」的精細部位，兩者服務的決策層級不同。
 */
const PLAN_TABLE: Record<MarketRegime, { strategy: TradingStrategy; reason: string; sizePct: 0 | 25 | 50 | 75 | 100 }> = {
  strongBull: { strategy: "trendFollowing", reason: "趨勢強勁明確，順勢操作風報比最佳", sizePct: 100 },
  weakBull: { strategy: "trendFollowing", reason: "偏多但動能有限，可順勢但需輕倉", sizePct: 50 },
  range: { strategy: "meanReversion", reason: "缺乏趨勢，區間高低來回操作較適合", sizePct: 50 },
  weakBear: { strategy: "trendFollowing", reason: "偏空但動能有限，可順勢但需輕倉", sizePct: 50 },
  strongBear: { strategy: "trendFollowing", reason: "空頭趨勢強勁明確，順勢操作風報比最佳", sizePct: 100 },
  volatile: { strategy: "noTrade", reason: "波動度劇烈擴張、方向不明，貿然進場風險過高", sizePct: 0 },
  distribution: { strategy: "breakout", reason: "高檔結構鬆動，等待跌破確認再行動，不追高", sizePct: 25 },
  accumulation: { strategy: "breakout", reason: "低檔結構轉強，等待突破確認再行動，不搶反彈", sizePct: 25 },
  capitulation: { strategy: "noTrade", reason: "恐慌性賣壓下，系統性風險未解除前不宜貿然進場", sizePct: 0 },
};

export function generateTradingPlan(regime: MarketRegime): TradingPlanResult {
  const plan = PLAN_TABLE[regime];
  return { strategy: plan.strategy, reason: plan.reason, suggestedSizePct: plan.sizePct };
}
