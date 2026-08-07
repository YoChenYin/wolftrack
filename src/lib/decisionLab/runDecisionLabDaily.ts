import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { queryGlobalMarketData } from "./queryGlobalMarket";
import { classifyRegime } from "./regimeEngine";
import { computeTradingScore } from "./tradingScore";
import { generateScenarios } from "./scenarioGenerator";
import { generateTradingPlan } from "./tradingPlan";

export interface DecisionLabDailyResult {
  snapshotDate: string;
  regime: string;
  tradingScore: number;
  maxPossibleScore: number;
}

/**
 * Decision Lab（總經頁最上方）每日執行：M1全球市場 → M7 Regime → M8 Trading Score →
 * M9 Scenario → M10 Trading Plan，寫入 macro_daily_snapshots + scenario_forecasts。
 * 前提：src/lib/marketData/globalMacroSeries.ts 的資料要先同步過（見 sync-global-macro-series.ts），
 * 這支只讀不抓。
 */
export async function runDecisionLabDaily(): Promise<DecisionLabDailyResult> {
  const { entries, spxBars, vixCloses } = await queryGlobalMarketData();
  if (spxBars.length < 25) throw new Error("SPX 歷史資料不足，無法計算 Regime");
  if (vixCloses.length === 0) throw new Error("VIX 資料不足");

  const snapshotDate = spxBars[spxBars.length - 1].date;
  const vixLevel = vixCloses[vixCloses.length - 1];

  const { regime, reasoning } = classifyRegime(spxBars, vixCloses);
  const scoreResult = computeTradingScore(regime, vixLevel);
  const scenarios = generateScenarios(regime);
  const plan = generateTradingPlan(regime);

  const globalMarketDataJson = entries as unknown as Prisma.InputJsonValue;
  const volatilityDataJson = { vix: vixLevel } as Prisma.InputJsonValue;
  const scoreBreakdownJson = { factors: scoreResult.factors, regimeReasoning: reasoning } as unknown as Prisma.InputJsonValue;

  await prisma.macroDailySnapshot.upsert({
    where: { snapshotDate: new Date(snapshotDate) },
    update: {
      globalMarketData: globalMarketDataJson,
      volatilityData: volatilityDataJson,
      regime,
      tradingScore: scoreResult.score,
      maxPossibleScore: scoreResult.maxPossibleScore,
      scoreBreakdown: scoreBreakdownJson,
      tradingPlanStrategy: plan.strategy,
      tradingPlanReason: plan.reason,
      suggestedSizePct: plan.suggestedSizePct,
    },
    create: {
      snapshotDate: new Date(snapshotDate),
      globalMarketData: globalMarketDataJson,
      volatilityData: volatilityDataJson,
      regime,
      tradingScore: scoreResult.score,
      maxPossibleScore: scoreResult.maxPossibleScore,
      scoreBreakdown: scoreBreakdownJson,
      tradingPlanStrategy: plan.strategy,
      tradingPlanReason: plan.reason,
      suggestedSizePct: plan.suggestedSizePct,
    },
  });

  for (const s of scenarios) {
    await prisma.scenarioForecast.upsert({
      where: { snapshotDate_label: { snapshotDate: new Date(snapshotDate), label: s.label } },
      update: { description: s.description, probability: s.probability, condition: s.condition, risk: s.risk, strategy: s.strategy },
      create: {
        snapshotDate: new Date(snapshotDate),
        label: s.label,
        description: s.description,
        probability: s.probability,
        condition: s.condition,
        risk: s.risk,
        strategy: s.strategy,
      },
    });
  }

  return { snapshotDate, regime, tradingScore: scoreResult.score, maxPossibleScore: scoreResult.maxPossibleScore };
}
