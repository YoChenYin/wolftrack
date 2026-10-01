import { prisma } from "@/lib/prisma";
import { TRACK_RECORD_EXIT_RULE, type TrackRecordTrade } from "./trackRecordMeta";
import { entrySignalOf, simulateTrades, type SimBar, type SimDay, type SimTrade } from "./trackRecordSim";

/**
 * 2026-09新增：選股績效驗證（/tw/track-record）——不是回測，是把平台「真的每天寫進
 * daily_trend_signals的選股結果」照一套固定的進出場規則模擬成逐筆交易，驗證使用者如果
 * 照著網站的訊號進出，實際會賺賠多少。跟TwSignalBacktestEvent（用現行規則回溯重跑歷史）
 * 是不同性質的東西：這裡只用上線後實際產生過的訊號，資料少但沒有「事後套規則」的疑慮。
 *
 * 進場：投信轉買/投信外資合買/逢低布局，或底部型態（頭肩底/N字底）新出現的那天，隔天開盤買進。
 * 只看「新出現」那天，連續多天的同一訊號只算一次，出場後要等下一次新訊號才會再進場。
 * 出場：見trackRecordMeta.ts的TRACK_RECORD_EXIT_RULE（2026-10-01改成移動停利+型態目標價+
 * 最長持有期，選擇依據見scripts/compare-track-record-exits.ts），模擬邏輯在trackRecordSim.ts。
 *
 * 已知限制：tw_daily_price是原始價格沒有除權息還原（見backtestWalkForward.ts說明），
 * 除息日股價下跌會被算成虧損；不含手續費/證交稅。
 */

/** 2026-08-17籌碼流策略改版（見classifyChipFlow.ts），這天之前寫入的是舊版分類，不列入 */
export const TRACK_RECORD_START_DATE = "2026-08-17";
/** 移動停利要算均線，價格從起始日往前多抓一段當暖身（日曆天，涵蓋均線天數+連假） */
const PRICE_WARMUP_CALENDAR_DAYS = 45;

function pctChange(from: number, to: number): number | null {
  if (from === 0) return null;
  return Math.round(((to - from) / from) * 10000) / 100;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toTrade(ticker: string, companyName: string, sim: SimTrade, bars: SimBar[], taiexByDate: Map<string, SimBar>): TrackRecordTrade {
  const trade: TrackRecordTrade = {
    ticker,
    companyName,
    status: sim.entryIndex === null ? "pendingEntry" : sim.exitIndex === null ? "open" : "closed",
    entrySignal: sim.entrySignal,
    entrySignalDate: sim.entrySignalDate,
    entrySignalReason: sim.entrySignalReason,
    entryDate: sim.entryIndex !== null ? bars[sim.entryIndex].date : null,
    entryPrice: sim.entryPrice,
    exitSignal: sim.exitSignal,
    exitSignalDate: sim.exitSignalDate,
    exitSignalReason: sim.exitSignalReason,
    exitDate: sim.exitIndex !== null ? bars[sim.exitIndex].date : null,
    exitPrice: sim.exitPrice,
    exitPriceType: sim.exitField,
    markPrice: null,
    markDate: null,
    returnPct: null,
    taiexReturnPct: null,
    excessReturnPct: null,
    holdingDays: null,
  };
  if (sim.entryIndex === null || sim.entryPrice === null) return trade;

  // 已出場用出場價，持有中用最新收盤價；大盤基準用同一段期間（進場日開盤→出場日/最新日收盤）
  const endIndex = sim.exitIndex ?? bars.length - 1;
  const endPrice = sim.exitPrice ?? bars[endIndex].close;
  if (sim.exitIndex === null) {
    trade.markPrice = endPrice;
    trade.markDate = bars[endIndex].date;
  }
  trade.returnPct = pctChange(sim.entryPrice, endPrice);
  const taiexIn = taiexByDate.get(bars[sim.entryIndex].date);
  const taiexOut = taiexByDate.get(bars[endIndex].date);
  if (taiexIn && taiexOut) {
    const endField = sim.exitField === "open" ? "open" : "close";
    trade.taiexReturnPct = pctChange(taiexIn.open, taiexOut[endField]);
  }
  if (trade.returnPct !== null && trade.taiexReturnPct !== null) {
    trade.excessReturnPct = Math.round((trade.returnPct - trade.taiexReturnPct) * 100) / 100;
  }
  trade.holdingDays = endIndex - sim.entryIndex + (sim.exitField === "open" ? 0 : 1);
  return trade;
}

async function loadBars(stockIds: number[]): Promise<Map<number, SimBar[]>> {
  const from = new Date(TRACK_RECORD_START_DATE);
  from.setUTCDate(from.getUTCDate() - PRICE_WARMUP_CALENDAR_DAYS);
  const rows = await prisma.twDailyPrice.findMany({
    where: { stockId: { in: stockIds }, tradeDate: { gte: from } },
    select: { stockId: true, tradeDate: true, open: true, high: true, low: true, close: true },
    orderBy: [{ stockId: "asc" }, { tradeDate: "asc" }],
  });
  const result = new Map<number, SimBar[]>();
  for (const r of rows) {
    const bars = result.get(r.stockId) ?? [];
    bars.push({
      date: toDateString(r.tradeDate),
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
    });
    result.set(r.stockId, bars);
  }
  return result;
}

/** 只有規則用到「投信連賣N日」時才需要撈法人資料 */
async function loadTrustNetBuy(stockIds: number[]): Promise<Map<number, Map<string, number>>> {
  const result = new Map<number, Map<string, number>>();
  if (TRACK_RECORD_EXIT_RULE.trustSellStreak === null) return result;
  const rows = await prisma.twInstitutionalTrading.findMany({
    where: { stockId: { in: stockIds }, tradeDate: { gte: new Date(TRACK_RECORD_START_DATE) } },
    select: { stockId: true, tradeDate: true, investTrustNetBuyShares: true },
  });
  for (const r of rows) {
    const m = result.get(r.stockId) ?? new Map<string, number>();
    m.set(toDateString(r.tradeDate), Number(r.investTrustNetBuyShares));
    result.set(r.stockId, m);
  }
  return result;
}

export async function computeTrackRecord(): Promise<TrackRecordTrade[]> {
  const signalRows = await prisma.dailyTrendSignal.findMany({
    where: {
      tradeDate: { gte: new Date(TRACK_RECORD_START_DATE) },
      stock: { market: "TW", NOT: { industry: { contains: "ETF" } } },
      OR: [
        { status: { in: ["trustTurnBuy", "combinedBuy", "buyDip", "trustTurnSell", "combinedSell"] } },
        { bottomPatternStage: { not: null } },
      ],
    },
    select: {
      stockId: true,
      tradeDate: true,
      status: true,
      triggerReason: true,
      bottomPatternStage: true,
      bottomPatternDescription: true,
      bottomPatternTargetPrice: true,
      stock: { select: { ticker: true, companyName: true } },
    },
  });

  const signalsByStock = new Map<number, { ticker: string; companyName: string; days: Map<string, SimDay> }>();
  for (const r of signalRows) {
    const entry = signalsByStock.get(r.stockId) ?? { ticker: r.stock.ticker, companyName: r.stock.companyName, days: new Map() };
    entry.days.set(toDateString(r.tradeDate), {
      status: r.status,
      triggerReason: r.triggerReason,
      hasBottomPattern: r.bottomPatternStage !== null,
      bottomPatternDescription: r.bottomPatternDescription,
      bottomPatternTargetPrice: r.bottomPatternTargetPrice !== null ? Number(r.bottomPatternTargetPrice) : null,
    });
    signalsByStock.set(r.stockId, entry);
  }

  // 只有出現過多方訊號的股票才需要撈價格，只有空方訊號的不會產生交易
  const candidateIds = [...signalsByStock.entries()]
    .filter(([, s]) => [...s.days.values()].some((d) => entrySignalOf(d) !== null))
    .map(([id]) => id);
  if (candidateIds.length === 0) return [];

  const taiexStock = await prisma.stock.findUnique({ where: { market_ticker: { market: "TW", ticker: "TAIEX" } }, select: { id: true } });
  const [barsByStock, trustNetByStock] = await Promise.all([
    loadBars(taiexStock ? [...candidateIds, taiexStock.id] : candidateIds),
    loadTrustNetBuy(candidateIds),
  ]);
  const taiexByDate = new Map((taiexStock ? barsByStock.get(taiexStock.id) ?? [] : []).map((b) => [b.date, b]));

  const trades: TrackRecordTrade[] = [];
  for (const id of candidateIds) {
    const s = signalsByStock.get(id)!;
    const bars = barsByStock.get(id);
    if (!bars || bars.length === 0) continue;
    const startIndex = bars.findIndex((b) => b.date >= TRACK_RECORD_START_DATE);
    if (startIndex === -1) continue;
    const sims = simulateTrades(bars, s.days, trustNetByStock.get(id) ?? new Map(), TRACK_RECORD_EXIT_RULE, startIndex);
    trades.push(...sims.map((sim) => toTrade(s.ticker, s.companyName, sim, bars, taiexByDate)));
  }

  return trades.sort((a, b) => b.entrySignalDate.localeCompare(a.entrySignalDate) || a.ticker.localeCompare(b.ticker));
}

export interface TrackRecordStats {
  count: number;
  winRatePct: number | null;
  avgReturnPct: number | null;
  avgExcessReturnPct: number | null;
  avgHoldingDays: number | null;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}

export function summarizeTrades(trades: TrackRecordTrade[]): TrackRecordStats {
  const returns = trades.map((t) => t.returnPct).filter((v): v is number => v !== null);
  return {
    count: trades.length,
    winRatePct: returns.length > 0 ? Math.round((returns.filter((r) => r > 0).length / returns.length) * 1000) / 10 : null,
    avgReturnPct: avg(returns),
    avgExcessReturnPct: avg(trades.map((t) => t.excessReturnPct).filter((v): v is number => v !== null)),
    avgHoldingDays: avg(trades.map((t) => t.holdingDays).filter((v): v is number => v !== null)),
  };
}
