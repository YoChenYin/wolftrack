import { prisma } from "@/lib/prisma";
import type { Market } from "@/generated/prisma/enums";

export interface ExpectationGapNoteView {
  id: string;
  market: Market;
  ticker: string;
  noteDate: string;
  currentPrice: number;
  consensusEps: number | null;
  consensusTargetPrice: number | null;
  ownEps: number | null;
  ownTargetPe: number | null;
  varianceDriver: string;
  thesis: string;
  status: "active" | "confirmed" | "invalidated";
  outcomeNote: string | null;
  /** ownEps * ownTargetPe，兩者都有值才算得出來 */
  ownTargetPrice: number | null;
  /** (own-consensus)/consensus，EPS層面的預期差幅度 */
  epsVariancePct: number | null;
  /** (own目標價-市場共識目標價)/市場共識目標價 */
  targetPriceVariancePct: number | null;
  /** 相對筆記當下股價的潛在漲跌空間 */
  upsideFromCurrentPct: number | null;
}

export async function queryExpectationGapNotes(): Promise<ExpectationGapNoteView[]> {
  const rows = await prisma.expectationGapNote.findMany({ orderBy: { noteDate: "desc" } });
  return rows.map((r) => {
    const currentPrice = Number(r.currentPrice);
    const consensusEps = r.consensusEps !== null ? Number(r.consensusEps) : null;
    const consensusTargetPrice = r.consensusTargetPrice !== null ? Number(r.consensusTargetPrice) : null;
    const ownEps = r.ownEps !== null ? Number(r.ownEps) : null;
    const ownTargetPe = r.ownTargetPe !== null ? Number(r.ownTargetPe) : null;

    const ownTargetPrice = ownEps !== null && ownTargetPe !== null ? ownEps * ownTargetPe : null;
    const epsVariancePct = consensusEps !== null && consensusEps !== 0 && ownEps !== null ? ((ownEps - consensusEps) / consensusEps) * 100 : null;
    const targetPriceVariancePct =
      consensusTargetPrice !== null && consensusTargetPrice !== 0 && ownTargetPrice !== null
        ? ((ownTargetPrice - consensusTargetPrice) / consensusTargetPrice) * 100
        : null;
    const upsideFromCurrentPct = ownTargetPrice !== null ? ((ownTargetPrice - currentPrice) / currentPrice) * 100 : null;

    return {
      id: r.id.toString(),
      market: r.market,
      ticker: r.ticker,
      noteDate: r.noteDate.toISOString().slice(0, 10),
      currentPrice,
      consensusEps,
      consensusTargetPrice,
      ownEps,
      ownTargetPe,
      varianceDriver: r.varianceDriver,
      thesis: r.thesis,
      status: r.status,
      outcomeNote: r.outcomeNote,
      ownTargetPrice,
      epsVariancePct,
      targetPriceVariancePct,
      upsideFromCurrentPct,
    };
  });
}
