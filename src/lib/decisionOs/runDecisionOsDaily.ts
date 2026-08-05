import { prisma } from "@/lib/prisma";
import type { OhlcvBar } from "@/lib/trend/types";
import { scoreL3TwMarket } from "./layers/scoreL3TwMarket";
import { scoreL4Flow } from "./layers/scoreL4Flow";
import { scoreL6Technical } from "./layers/scoreL6Technical";
import { computeDecision } from "./decisionEngine";
import { evaluateGates, type GateResult } from "./gates/evaluateGates";
import { computeRisk } from "./riskEngine";
import type { LayerScore } from "./types";

async function getOrCreateDefaultRiskProfile() {
  const existing = await prisma.userRiskProfile.findFirst();
  if (existing) return existing;
  // ⚠️預設帳戶資金100萬元，僅供MVP demo，實際應由使用者於Onboarding輸入（見PRD第8節/第16節）
  return prisma.userRiskProfile.create({ data: { accountEquity: 1_000_000 } });
}

/**
 * stance=bull/bear 時是「支持/反對這個方向」；stance=neutral 時沒有方向可支持或反對，
 * 改成「偏多訊號/偏空訊號」兩組——語意上是同一個 supporting/opposing 欄位，但neutral情境下
 * DashboardSummary.tsx 會換成中性的標籤文字，不會顯示成語意矛盾的「反對理由」。
 */
function buildReasons(layerScores: LayerScore[], stance: "bull" | "bear" | "neutral"): { supporting: string[]; opposing: string[] } {
  const supporting: string[] = [];
  const opposing: string[] = [];
  for (const layer of layerScores) {
    for (const ind of layer.indicators) {
      if (ind.score === 0) continue;
      const isBullSignal = ind.score > 0;
      const favors = stance === "bull" ? isBullSignal : stance === "bear" ? !isBullSignal : isBullSignal;
      if (favors) supporting.push(`[${layer.label}] ${ind.detail}`);
      else opposing.push(`[${layer.label}] ${ind.detail}`);
    }
  }
  return { supporting, opposing };
}

export interface DecisionOsDailyResult {
  tradeDate: string;
  totalScore: number;
  tierLabel: string;
  gatesTriggered: number;
}

/**
 * 台指期 Decision OS 每日執行：算 L3/L4/L6 分數 → Decision Engine → Gate 檢查 → Risk 引擎 → 寫入 decision_snapshots。
 * MVP 範圍（只有這三層有分數、Gate只做市場資料能算的項目）的完整說明見各子模組的檔案註解與
 * docs/taifex-decision-os-prd.html 第15-16節。
 */
export async function runDecisionOsDaily(): Promise<DecisionOsDailyResult> {
  const taiexStock = await prisma.stock.findUnique({ where: { market_ticker: { market: "TW", ticker: "TAIEX" } } });
  if (!taiexStock) throw new Error("找不到 TAIEX 合成股票紀錄");

  const priceRows = await prisma.twDailyPrice.findMany({
    where: { stockId: taiexStock.id },
    orderBy: { tradeDate: "asc" },
    take: -300, // 最近300筆（Prisma負數take=從尾端取，等同「最新300筆」的正序排列）
  });
  if (priceRows.length < 25) {
    throw new Error("TAIEX 歷史資料不足，無法計算技術指標");
  }

  const bars: OhlcvBar[] = priceRows.map((r) => ({
    date: r.tradeDate.toISOString().slice(0, 10),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
  }));
  const tradeDate = bars[bars.length - 1].date;

  const latestPcr = await prisma.twOptionsPutCallRatio.findFirst({ orderBy: { tradeDate: "desc" } });

  const l3 = scoreL3TwMarket(bars);
  const l4 = scoreL4Flow(latestPcr ? Number(latestPcr.putCallOiRatioPct) : null);
  const { layer: l6, regime } = scoreL6Technical(bars);

  const decision = computeDecision([l3, l4, l6]);

  const gateResults: GateResult[] = evaluateGates(bars);
  if (regime.atrRatio !== null && regime.atrRatio > 1.5) {
    gateResults.push({
      gateNumber: 12,
      gateName: "波動度過高",
      action: "建議倉位減半",
      detail: `ATR為20日均值的${(regime.atrRatio * 100).toFixed(0)}%`,
    });
  }
  if (regime.bandwidthSqueeze) {
    gateResults.push({
      gateNumber: 25,
      gateName: "布林帶寬過窄",
      action: "禁止趨勢單，只能區間策略",
      detail: "帶寬低於20日均值的50%，屬盤整格局",
    });
  }

  const riskProfile = await getOrCreateDefaultRiskProfile();
  const entryPrice = bars[bars.length - 1].close;
  const { supporting, opposing } = buildReasons([l3, l4, l6], decision.tier.stance);

  let strategy: "swingLong" | "swingShort" | "rangeBound" | "flat" = "flat";
  let suggestedSizePct = 0;
  let stopLossPrice: number | null = null;
  let takeProfitPrice: number | null = null;
  let entryCondition = "訊號不足或風險偏高，今日建議空手觀望。";

  const hardBlockingGates = gateResults.filter((g) => g.action.includes("禁止") || g.action.includes("不交易"));

  if (decision.tier.stance !== "neutral" && regime.atr14 !== null && hardBlockingGates.length === 0) {
    const risk = computeRisk({
      accountEquity: Number(riskProfile.accountEquity),
      riskPerTradePct: Number(riskProfile.riskPerTradePct),
      atrStopMultiplier: Number(riskProfile.atrStopMultiplier),
      entryPrice,
      atr14: regime.atr14,
      stance: decision.tier.stance,
    });
    gateResults.push(...risk.gates);

    if (risk.gates.length === 0) {
      strategy = decision.tier.stance === "bull" ? "swingLong" : "swingShort";
      suggestedSizePct = risk.suggestedSizePct;
      stopLossPrice = risk.stopPrice;
      takeProfitPrice = risk.takeProfitPrice;
      entryCondition = `現價附近（收盤${entryPrice.toFixed(0)}）${decision.tier.stance === "bull" ? "站穩" : "跌破"}後進場，風報比${risk.rewardRiskRatio.toFixed(2)}`;
    } else {
      entryCondition = "風控引擎否決本次交易（停損過寬或風報比不足），今日建議空手。";
    }
  } else if (decision.tier.stance !== "neutral" && hardBlockingGates.length > 0) {
    entryCondition = `${hardBlockingGates.map((g) => g.gateName).join("、")}——關卡引擎否決新倉，今日建議空手。`;
  } else if (decision.tier.stance === "neutral") {
    strategy = regime.bandwidthSqueeze ? "rangeBound" : "flat";
  }

  const riskLevel: "low" | "medium" | "high" =
    regime.atrRatio !== null && regime.atrRatio > 1.3
      ? "high"
      : regime.atrRatio !== null && regime.atrRatio < 0.8
        ? "low"
        : "medium";

  await prisma.decisionSnapshot.upsert({
    where: { tradeDate: new Date(tradeDate) },
    update: {
      l3TwMarketScore: l3.score,
      l4FlowScore: l4.score,
      l6TechnicalScore: l6.score,
      totalScore: decision.totalScore,
      finalStance: decision.tier.stance,
      finalConfidence: Math.round((Math.abs(decision.totalScore) / decision.maxPossibleScore) * 100),
      strategy,
      riskLevel,
      suggestedSizePct,
      entryCondition,
      stopLossPrice,
      takeProfitPrice,
      supportingReasons: supporting,
      opposingReasons: opposing,
    },
    create: {
      tradeDate: new Date(tradeDate),
      l3TwMarketScore: l3.score,
      l4FlowScore: l4.score,
      l6TechnicalScore: l6.score,
      totalScore: decision.totalScore,
      finalStance: decision.tier.stance,
      finalConfidence: Math.round((Math.abs(decision.totalScore) / decision.maxPossibleScore) * 100),
      strategy,
      riskLevel,
      suggestedSizePct,
      entryCondition,
      stopLossPrice,
      takeProfitPrice,
      supportingReasons: supporting,
      opposingReasons: opposing,
    },
  });

  await prisma.gateTrigger.deleteMany({ where: { tradeDate: new Date(tradeDate) } });
  if (gateResults.length > 0) {
    await prisma.gateTrigger.createMany({
      data: gateResults.map((g) => ({
        tradeDate: new Date(tradeDate),
        gateNumber: g.gateNumber,
        gateName: g.gateName,
        action: g.action,
        detail: g.detail,
      })),
    });
  }

  return { tradeDate, totalScore: decision.totalScore, tierLabel: decision.tier.label, gatesTriggered: gateResults.length };
}
