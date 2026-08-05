import type { GateResult } from "./gates/evaluateGates";

/** 微型台指期貨(MTX)每點價值，見 docs/taifex-decision-os-prd.html 使用者輪廓（商品=MTX） */
export const MICRO_TX_POINT_VALUE = 10;

export interface RiskInput {
  accountEquity: number;
  riskPerTradePct: number;
  atrStopMultiplier: number;
  entryPrice: number;
  atr14: number;
  stance: "bull" | "bear";
  /** 距離1000點整數關卡等資訊由呼叫端算好的建議停利距離倍數（停利=停損距離 × 這個倍數），預設抓最低風報比門檻 */
  minRewardRiskRatio?: number;
}

export interface RiskOutput {
  stopDistance: number;
  stopPrice: number;
  takeProfitPrice: number;
  rewardRiskRatio: number;
  maxRiskPerTrade: number;
  positionSizeContracts: number;
  suggestedSizePct: 0 | 25 | 50 | 75 | 100;
  gates: GateResult[];
}

/**
 * 風控引擎，PRD 第8節公式。輸出建議部位大小與停損停利，並附上 Gate #26(停損距離)/#27(風報比) 的檢查結果——
 * 這兩項需要「已經算出停損停利價位」才能檢查，所以放在這裡而不是 evaluateGates.ts。
 */
export function computeRisk(input: RiskInput): RiskOutput {
  const { accountEquity, riskPerTradePct, atrStopMultiplier, entryPrice, atr14, stance, minRewardRiskRatio = 1.5 } = input;

  const stopDistance = atr14 * atrStopMultiplier;
  const stopPrice = stance === "bull" ? entryPrice - stopDistance : entryPrice + stopDistance;
  const takeProfitDistance = stopDistance * minRewardRiskRatio;
  const takeProfitPrice = stance === "bull" ? entryPrice + takeProfitDistance : entryPrice - takeProfitDistance;
  const rewardRiskRatio = takeProfitDistance / stopDistance;

  const maxRiskPerTrade = accountEquity * (riskPerTradePct / 100);
  const positionSizeContracts =
    stopDistance > 0 ? Math.floor(maxRiskPerTrade / (stopDistance * MICRO_TX_POINT_VALUE)) : 0;

  const gates: GateResult[] = [];

  // Gate #26：停損距離 > 2倍ATR 不交易（這裡的atrStopMultiplier本身若設定超過2就已經違規，屬於設定錯誤，仍要擋）
  const stopAtrMultiple = atr14 > 0 ? stopDistance / atr14 : 0;
  if (stopAtrMultiple > 2) {
    gates.push({
      gateNumber: 26,
      gateName: "停損過寬",
      action: "不交易",
      detail: `停損距離為ATR的${stopAtrMultiple.toFixed(1)}倍，超過2倍上限`,
    });
  }

  // Gate #27：風報比 < 1.5 不交易
  if (rewardRiskRatio < 1.5) {
    gates.push({
      gateNumber: 27,
      gateName: "風報比不足",
      action: "不交易",
      detail: `風報比${rewardRiskRatio.toFixed(2)}，低於1.5門檻`,
    });
  }

  const blocked = gates.length > 0;
  const suggestedSizePct = blocked ? 0 : sizePctFromContracts(positionSizeContracts);

  return {
    stopDistance: Math.round(stopDistance * 100) / 100,
    stopPrice: Math.round(stopPrice * 100) / 100,
    takeProfitPrice: Math.round(takeProfitPrice * 100) / 100,
    rewardRiskRatio: Math.round(rewardRiskRatio * 100) / 100,
    maxRiskPerTrade: Math.round(maxRiskPerTrade),
    positionSizeContracts,
    suggestedSizePct,
    gates,
  };
}

/** 部位大小換算成 0/25/50/75/100% 檔位（PRD第9節輸出格式），單純用口數是否>0映射到有意義的檔位，未來接上真實資金曲線後可以再精修 */
function sizePctFromContracts(contracts: number): 0 | 25 | 50 | 75 | 100 {
  if (contracts <= 0) return 0;
  if (contracts === 1) return 25;
  if (contracts <= 3) return 50;
  if (contracts <= 6) return 75;
  return 100;
}

export interface RMultipleStats {
  winRate: number; // 0-1
  avgWinR: number;
  avgLossR: number;
}

/** 期望值 EV（R值單位）：長期是否值得執行這套策略的核心指標，PRD第8節公式 */
export function computeExpectedValue(stats: RMultipleStats): number {
  return stats.winRate * stats.avgWinR - (1 - stats.winRate) * stats.avgLossR;
}

/** Fractional Kelly建議倉位比例，PRD第8節公式，保守係數0.25 ⚠️需回測校準 */
export function computeKellyFraction(stats: RMultipleStats, conservativeFactor = 0.25): number {
  if (stats.avgLossR === 0) return 0;
  const kelly = stats.winRate - (1 - stats.winRate) / (stats.avgWinR / stats.avgLossR);
  return Math.max(0, kelly * conservativeFactor);
}
