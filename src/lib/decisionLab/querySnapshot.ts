import { prisma } from "@/lib/prisma";
import type { GlobalMarketEntry, MarketRegime, ScoreFactor } from "./types";

export interface DecisionLabSnapshotView {
  snapshotDate: string;
  regime: MarketRegime;
  regimeReasoning: string;
  tradingScore: number;
  maxPossibleScore: number;
  factors: ScoreFactor[];
  globalMarket: GlobalMarketEntry[];
  vix: number | null;
  tradingPlanStrategy: string;
  tradingPlanReason: string;
  suggestedSizePct: number;
  scenarios: { label: string; description: string; probability: number; condition: string; risk: string; strategy: string }[];
}

/** 給 /macro 頁面 Decision Lab 區塊用：讀最新一筆 macro_daily_snapshots + 對應的三個劇本 */
export async function queryLatestDecisionLabSnapshot(): Promise<DecisionLabSnapshotView | null> {
  const snapshot = await prisma.macroDailySnapshot.findFirst({ orderBy: { snapshotDate: "desc" } });
  if (!snapshot) return null;

  const scenarios = await prisma.scenarioForecast.findMany({
    where: { snapshotDate: snapshot.snapshotDate },
    orderBy: { label: "asc" },
  });

  const breakdown = snapshot.scoreBreakdown as unknown as { factors: ScoreFactor[]; regimeReasoning: string };
  const volatility = snapshot.volatilityData as unknown as { vix: number } | null;

  return {
    snapshotDate: snapshot.snapshotDate.toISOString().slice(0, 10),
    regime: snapshot.regime,
    regimeReasoning: breakdown.regimeReasoning,
    tradingScore: snapshot.tradingScore,
    maxPossibleScore: snapshot.maxPossibleScore,
    factors: breakdown.factors,
    globalMarket: snapshot.globalMarketData as unknown as GlobalMarketEntry[],
    vix: volatility?.vix ?? null,
    tradingPlanStrategy: snapshot.tradingPlanStrategy,
    tradingPlanReason: snapshot.tradingPlanReason,
    suggestedSizePct: snapshot.suggestedSizePct,
    scenarios: scenarios.map((s) => ({
      label: s.label,
      description: s.description,
      probability: s.probability,
      condition: s.condition,
      risk: s.risk,
      strategy: s.strategy,
    })),
  };
}
