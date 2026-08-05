import { prisma } from "@/lib/prisma";

export interface DecisionOsSnapshotView {
  tradeDate: string;
  totalScore: number;
  l3Score: number | null;
  l4Score: number | null;
  l6Score: number | null;
  finalStance: "bull" | "bear" | "neutral";
  finalConfidence: number;
  strategy: "swingLong" | "swingShort" | "rangeBound" | "flat";
  riskLevel: "low" | "medium" | "high";
  suggestedSizePct: number;
  entryCondition: string;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  supportingReasons: string[];
  opposingReasons: string[];
  gates: { gateNumber: number; gateName: string; action: string; detail: string }[];
}

/** 給 /futures 頁面 Dashboard 用：讀最新一筆 decision_snapshots + 當天的 Gate 觸發紀錄 */
export async function queryLatestSnapshot(): Promise<DecisionOsSnapshotView | null> {
  const snapshot = await prisma.decisionSnapshot.findFirst({ orderBy: { tradeDate: "desc" } });
  if (!snapshot) return null;

  const gates = await prisma.gateTrigger.findMany({
    where: { tradeDate: snapshot.tradeDate },
    orderBy: { gateNumber: "asc" },
  });

  return {
    tradeDate: snapshot.tradeDate.toISOString().slice(0, 10),
    totalScore: Number(snapshot.totalScore),
    l3Score: snapshot.l3TwMarketScore !== null ? Number(snapshot.l3TwMarketScore) : null,
    l4Score: snapshot.l4FlowScore !== null ? Number(snapshot.l4FlowScore) : null,
    l6Score: snapshot.l6TechnicalScore !== null ? Number(snapshot.l6TechnicalScore) : null,
    finalStance: snapshot.finalStance,
    finalConfidence: snapshot.finalConfidence,
    strategy: snapshot.strategy,
    riskLevel: snapshot.riskLevel,
    suggestedSizePct: snapshot.suggestedSizePct,
    entryCondition: snapshot.entryCondition,
    stopLossPrice: snapshot.stopLossPrice !== null ? Number(snapshot.stopLossPrice) : null,
    takeProfitPrice: snapshot.takeProfitPrice !== null ? Number(snapshot.takeProfitPrice) : null,
    supportingReasons: snapshot.supportingReasons as string[],
    opposingReasons: snapshot.opposingReasons as string[],
    gates: gates.map((g) => ({ gateNumber: g.gateNumber, gateName: g.gateName, action: g.action, detail: g.detail ?? "" })),
  };
}
