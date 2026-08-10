import { prisma } from "@/lib/prisma";
import type { Market } from "@/generated/prisma/enums";

export interface TradeLogEntryView {
  id: string;
  market: Market;
  ticker: string;
  side: "long" | "short";
  signalSource: string | null;
  entryDate: string;
  entryPrice: number;
  quantity: number;
  exitDate: string | null;
  exitPrice: number | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  status: "open" | "closed" | "cancelled";
  notes: string | null;
  /** 已平倉才有值：(賣-買)*量，做空反向 */
  pnl: number | null;
  /** 已平倉才有值：相對進場價的報酬率% */
  pnlPct: number | null;
}

function computePnl(side: "long" | "short", entryPrice: number, exitPrice: number, quantity: number) {
  const diff = side === "long" ? exitPrice - entryPrice : entryPrice - exitPrice;
  return { pnl: diff * quantity, pnlPct: (diff / entryPrice) * 100 };
}

export async function queryTradeLogEntries(): Promise<TradeLogEntryView[]> {
  const rows = await prisma.tradeLogEntry.findMany({ orderBy: { entryDate: "desc" } });
  return rows.map((r) => {
    const entryPrice = Number(r.entryPrice);
    const exitPrice = r.exitPrice !== null ? Number(r.exitPrice) : null;
    const quantity = Number(r.quantity);
    const closed = r.status === "closed" && exitPrice !== null;
    const { pnl, pnlPct } = closed ? computePnl(r.side, entryPrice, exitPrice!, quantity) : { pnl: null, pnlPct: null };
    return {
      id: r.id.toString(),
      market: r.market,
      ticker: r.ticker,
      side: r.side,
      signalSource: r.signalSource,
      entryDate: r.entryDate.toISOString().slice(0, 10),
      entryPrice,
      quantity,
      exitDate: r.exitDate ? r.exitDate.toISOString().slice(0, 10) : null,
      exitPrice,
      stopLossPrice: r.stopLossPrice !== null ? Number(r.stopLossPrice) : null,
      takeProfitPrice: r.takeProfitPrice !== null ? Number(r.takeProfitPrice) : null,
      status: r.status,
      notes: r.notes,
      pnl,
      pnlPct,
    };
  });
}

export interface AttributionRow {
  signalSource: string;
  count: number;
  winRate: number;
  avgPnlPct: number;
  totalPnl: number;
}

/** 只算已平倉的交易，按signalSource分組——這是「訊號實際幫使用者賺錢了嗎」的真實績效歸因，
 * 跟scripts/backtest-*.ts的歷史模擬是兩回事：這裡是使用者真的照訊號進出場的紀錄。 */
export function computeAttribution(entries: TradeLogEntryView[]): AttributionRow[] {
  const closed = entries.filter((e) => e.status === "closed" && e.pnl !== null && e.pnlPct !== null);
  const groups = new Map<string, TradeLogEntryView[]>();
  for (const e of closed) {
    const key = e.signalSource ?? "manual";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  return Array.from(groups.entries())
    .map(([signalSource, group]) => {
      const wins = group.filter((e) => e.pnl! > 0).length;
      return {
        signalSource,
        count: group.length,
        winRate: (wins / group.length) * 100,
        avgPnlPct: group.reduce((a, e) => a + e.pnlPct!, 0) / group.length,
        totalPnl: group.reduce((a, e) => a + e.pnl!, 0),
      };
    })
    .sort((a, b) => b.count - a.count);
}
