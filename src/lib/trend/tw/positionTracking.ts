import "server-only";
import { prisma } from "@/lib/prisma";
import { TRACK_RECORD_EXIT_RULE, type EntrySignal } from "./trackRecordMeta";
import { evaluatePosition, type PositionEvaluation, type SimBar } from "./trackRecordSim";

/**
 * 2026-10-01：/tw/track-record「我的進場追蹤」——使用者看到今日進場訊號、自己真的買進後，
 * 記一筆到交易紀錄（TradeLogEntry，跟/trade-log同一張表），這裡每天用績效驗證同一套出場規則
 * （TRACK_RECORD_EXIT_RULE）檢查每筆持倉該續抱還是該出場。
 */

/** 移動停利要算均線，從進場日往前多抓的日曆天數（涵蓋均線天數+連假） */
const PRICE_WARMUP_CALENDAR_DAYS = 45;

export const ENTRY_SIGNAL_TO_SOURCE = {
  trustTurnBuy: "twTrustTurnBuy",
  combinedBuy: "twCombinedBuy",
  buyDip: "twTrendBuyDip",
  bottomPattern: "twBottomPattern",
} as const satisfies Record<EntrySignal, string>;

const SOURCE_TO_ENTRY_SIGNAL: Record<string, EntrySignal> = Object.fromEntries(
  Object.entries(ENTRY_SIGNAL_TO_SOURCE).map(([signal, source]) => [source, signal as EntrySignal])
);

export interface SearchableStock {
  ticker: string;
  companyName: string;
  latestClose: number | null;
}

export interface TrackedPosition {
  id: string;
  ticker: string;
  companyName: string;
  entrySignal: EntrySignal | null;
  entryDate: string;
  entryPrice: number;
  quantity: number;
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
  evaluation: PositionEvaluation;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 搜尋欄用的全部台股清單（排除ETF，跟選股表同一個範圍），附最新收盤價當進場價預設值 */
export async function listSearchableStocks(latestDate: string | null): Promise<SearchableStock[]> {
  const stocks = await prisma.stock.findMany({
    where: { market: "TW", isActive: true, ticker: { not: "TAIEX" }, NOT: { industry: { contains: "ETF" } } },
    select: { id: true, ticker: true, companyName: true },
    orderBy: { ticker: "asc" },
  });
  const closes = latestDate
    ? await prisma.twDailyPrice.findMany({
        where: { tradeDate: new Date(latestDate), stockId: { in: stocks.map((s) => s.id) } },
        select: { stockId: true, close: true },
      })
    : [];
  const closeById = new Map(closes.map((c) => [c.stockId, Number(c.close)]));
  return stocks.map((s) => ({ ticker: s.ticker, companyName: s.companyName, latestClose: closeById.get(s.id) ?? null }));
}

/** 使用者目前持有中的台股做多部位，各自算出場狀態 */
export async function listTrackedPositions(userId: number): Promise<TrackedPosition[]> {
  const entries = await prisma.tradeLogEntry.findMany({
    where: { userId, market: "TW", side: "long", status: "open" },
    orderBy: { entryDate: "desc" },
  });
  if (entries.length === 0) return [];

  const stocks = await prisma.stock.findMany({
    where: { market: "TW", ticker: { in: [...new Set(entries.map((e) => e.ticker))] } },
    select: { id: true, ticker: true, companyName: true },
  });
  const stockByTicker = new Map(stocks.map((s) => [s.ticker, s]));

  const earliest = new Date(Math.min(...entries.map((e) => e.entryDate.getTime())));
  earliest.setUTCDate(earliest.getUTCDate() - PRICE_WARMUP_CALENDAR_DAYS);
  const priceRows = await prisma.twDailyPrice.findMany({
    where: { stockId: { in: stocks.map((s) => s.id) }, tradeDate: { gte: earliest } },
    select: { stockId: true, tradeDate: true, open: true, high: true, low: true, close: true },
    orderBy: [{ stockId: "asc" }, { tradeDate: "asc" }],
  });
  const barsByStock = new Map<number, SimBar[]>();
  for (const r of priceRows) {
    const bars = barsByStock.get(r.stockId) ?? [];
    bars.push({ date: toDateString(r.tradeDate), open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close) });
    barsByStock.set(r.stockId, bars);
  }

  return entries.map((e) => {
    const stock = stockByTicker.get(e.ticker);
    const entryPrice = Number(e.entryPrice);
    const takeProfitPrice = e.takeProfitPrice !== null ? Number(e.takeProfitPrice) : null;
    const stopLossPrice = e.stopLossPrice !== null ? Number(e.stopLossPrice) : null;
    const bars = stock ? barsByStock.get(stock.id) ?? [] : [];
    return {
      id: e.id.toString(),
      ticker: e.ticker,
      companyName: stock?.companyName ?? e.ticker,
      entrySignal: e.signalSource ? SOURCE_TO_ENTRY_SIGNAL[e.signalSource] ?? null : null,
      entryDate: toDateString(e.entryDate),
      entryPrice,
      quantity: Number(e.quantity),
      takeProfitPrice,
      stopLossPrice,
      evaluation: evaluatePosition(bars, toDateString(e.entryDate), entryPrice, TRACK_RECORD_EXIT_RULE, takeProfitPrice, stopLossPrice),
    };
  });
}
