import { prisma } from "@/lib/prisma";
import type { TrendStatus } from "@/generated/prisma/enums";
import { MAX_HOLDING_DAYS, type EntrySignal, type ExitSignal, type TrackRecordTrade } from "./trackRecordMeta";

/**
 * 2026-09新增：選股績效驗證（/tw/track-record）——不是回測，是把平台「真的每天寫進
 * daily_trend_signals的選股結果」照一套固定的進出場規則模擬成逐筆交易，驗證使用者如果
 * 照著網站的訊號進出，實際會賺賠多少。跟TwSignalBacktestEvent（用現行規則回溯重跑歷史）
 * 是不同性質的東西：這裡只用上線後實際產生過的訊號，資料少但沒有「事後套規則」的疑慮。
 *
 * 進出場規則：
 * - 進場訊號：投信轉買/投信外資合買/逢低布局，或底部型態（頭肩底/N字底）新出現。只看
 *   「新出現」那天（前一個交易日不是同一個多方訊號），連續多天的合買/持續成形的底部型態
 *   只算一次，出場後要等下一次新訊號才會再進場。
 * - 出場訊號：同一檔出現投信轉賣/投信外資合賣，或持有滿MAX_HOLDING_DAYS個交易日強制出場。
 * - 成交價：訊號是收盤後批次算出來的，當天收盤價其實買不到，進場/反向訊號出場一律用
 *   「訊號隔一個交易日的開盤價」；持有期滿是事先知道的，用第N個交易日的收盤價出場。
 * - 持有中的部位用最新收盤價算未實現報酬。
 *
 * 已知限制：tw_daily_price是原始價格沒有除權息還原（見backtestWalkForward.ts說明），
 * 除息日股價下跌會被算成虧損；不含手續費/證交稅。
 */

/** 2026-08-17籌碼流策略改版（見classifyChipFlow.ts），這天之前寫入的是舊版分類，不列入 */
export const TRACK_RECORD_START_DATE = "2026-08-17";

const BUY_STATUSES = new Set<TrendStatus>(["trustTurnBuy", "combinedBuy", "buyDip"]);
const SELL_STATUSES = new Set<TrendStatus>(["trustTurnSell", "combinedSell"]);

interface SignalDay {
  status: TrendStatus;
  triggerReason: string | null;
  hasBottomPattern: boolean;
  bottomPatternDescription: string | null;
}

interface Bar {
  date: string;
  open: number;
  close: number;
}

function entrySignalOf(day: SignalDay | undefined): EntrySignal | null {
  if (!day || SELL_STATUSES.has(day.status)) return null;
  if (BUY_STATUSES.has(day.status)) return day.status as EntrySignal;
  return day.hasBottomPattern ? "bottomPattern" : null;
}

function pctChange(from: number, to: number): number | null {
  if (from === 0) return null;
  return Math.round(((to - from) / from) * 10000) / 100;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 大盤比較基準用同一組日期+同一種價格（開盤/收盤）算，跟個股的成交方式一致 */
function taiexReturn(
  taiexByDate: Map<string, Bar>,
  fromDate: string,
  fromField: "open" | "close",
  toDate: string,
  toField: "open" | "close"
): number | null {
  const from = taiexByDate.get(fromDate);
  const to = taiexByDate.get(toDate);
  if (!from || !to) return null;
  return pctChange(from[fromField], to[toField]);
}

function simulateStock(
  ticker: string,
  companyName: string,
  bars: Bar[],
  signalsByDate: Map<string, SignalDay>,
  taiexByDate: Map<string, Bar>
): TrackRecordTrade[] {
  const trades: TrackRecordTrade[] = [];
  let holding: TrackRecordTrade | null = null;
  let entryIdx = -1;
  let prevEntrySignal: EntrySignal | null = null;

  const closeTrade = (
    trade: TrackRecordTrade,
    exitIdx: number,
    field: "open" | "close",
    exitSignal: ExitSignal,
    exitSignalDate: string,
    exitSignalReason: string | null
  ) => {
    const exitBar = bars[exitIdx];
    trade.status = "closed";
    trade.exitSignal = exitSignal;
    trade.exitSignalDate = exitSignalDate;
    trade.exitSignalReason = exitSignalReason;
    trade.exitDate = exitBar.date;
    trade.exitPrice = exitBar[field];
    trade.returnPct = pctChange(trade.entryPrice!, exitBar[field]);
    trade.taiexReturnPct = taiexReturn(taiexByDate, trade.entryDate!, "open", exitBar.date, field);
    trade.holdingDays = exitIdx - entryIdx + (field === "close" ? 1 : 0);
  };

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const day = signalsByDate.get(bar.date);

    if (holding) {
      const heldDays = i - entryIdx + 1;
      if (heldDays >= MAX_HOLDING_DAYS) {
        closeTrade(holding, i, "close", "maxHolding", bar.date, null);
        holding = null;
      } else if (day && SELL_STATUSES.has(day.status)) {
        const exitSignal = day.status as ExitSignal;
        if (i + 1 < bars.length) {
          closeTrade(holding, i + 1, "open", exitSignal, bar.date, day.triggerReason);
          holding = null;
        } else {
          // 反向訊號出現在最新一天，隔天開盤才會出場——先標記出場訊號，報酬仍以最新收盤價計
          holding.exitSignal = exitSignal;
          holding.exitSignalDate = bar.date;
          holding.exitSignalReason = day.triggerReason;
        }
      }
    }

    const entrySignal = entrySignalOf(day);
    const isNewSignal = entrySignal !== null && entrySignal !== prevEntrySignal;
    prevEntrySignal = entrySignal;

    if (!holding && isNewSignal && day) {
      const trade: TrackRecordTrade = {
        ticker,
        companyName,
        status: "pendingEntry",
        entrySignal,
        entrySignalDate: bar.date,
        entrySignalReason: entrySignal === "bottomPattern" ? day.bottomPatternDescription : day.triggerReason,
        entryDate: null,
        entryPrice: null,
        exitSignal: null,
        exitSignalDate: null,
        exitSignalReason: null,
        exitDate: null,
        exitPrice: null,
        markPrice: null,
        markDate: null,
        returnPct: null,
        taiexReturnPct: null,
        excessReturnPct: null,
        holdingDays: null,
      };
      trades.push(trade);
      if (i + 1 < bars.length) {
        trade.status = "open";
        trade.entryDate = bars[i + 1].date;
        trade.entryPrice = bars[i + 1].open;
        entryIdx = i + 1;
        holding = trade;
      }
    }
  }

  if (holding) {
    const last = bars[bars.length - 1];
    holding.markPrice = last.close;
    holding.markDate = last.date;
    holding.returnPct = pctChange(holding.entryPrice!, last.close);
    holding.taiexReturnPct = taiexReturn(taiexByDate, holding.entryDate!, "open", last.date, "close");
    holding.holdingDays = bars.length - entryIdx;
  }

  for (const t of trades) {
    if (t.returnPct !== null && t.taiexReturnPct !== null) {
      t.excessReturnPct = Math.round((t.returnPct - t.taiexReturnPct) * 100) / 100;
    }
  }
  return trades;
}

async function loadBars(stockIds: number[]): Promise<Map<number, Bar[]>> {
  const rows = await prisma.twDailyPrice.findMany({
    where: { stockId: { in: stockIds }, tradeDate: { gte: new Date(TRACK_RECORD_START_DATE) } },
    select: { stockId: true, tradeDate: true, open: true, close: true },
    orderBy: [{ stockId: "asc" }, { tradeDate: "asc" }],
  });
  const result = new Map<number, Bar[]>();
  for (const r of rows) {
    const bars = result.get(r.stockId) ?? [];
    bars.push({ date: toDateString(r.tradeDate), open: Number(r.open), close: Number(r.close) });
    result.set(r.stockId, bars);
  }
  return result;
}

export async function computeTrackRecord(): Promise<TrackRecordTrade[]> {
  const signalRows = await prisma.dailyTrendSignal.findMany({
    where: {
      tradeDate: { gte: new Date(TRACK_RECORD_START_DATE) },
      stock: { market: "TW", NOT: { industry: { contains: "ETF" } } },
      OR: [{ status: { in: [...BUY_STATUSES, ...SELL_STATUSES] } }, { bottomPatternStage: { not: null } }],
    },
    select: {
      stockId: true,
      tradeDate: true,
      status: true,
      triggerReason: true,
      bottomPatternStage: true,
      bottomPatternDescription: true,
      stock: { select: { ticker: true, companyName: true } },
    },
  });

  const signalsByStock = new Map<number, { ticker: string; companyName: string; days: Map<string, SignalDay> }>();
  for (const r of signalRows) {
    const entry = signalsByStock.get(r.stockId) ?? { ticker: r.stock.ticker, companyName: r.stock.companyName, days: new Map() };
    entry.days.set(toDateString(r.tradeDate), {
      status: r.status,
      triggerReason: r.triggerReason,
      hasBottomPattern: r.bottomPatternStage !== null,
      bottomPatternDescription: r.bottomPatternDescription,
    });
    signalsByStock.set(r.stockId, entry);
  }

  // 只有出現過多方訊號的股票才需要撈價格，只有空方訊號的不會產生交易
  const candidateIds = [...signalsByStock.entries()]
    .filter(([, s]) => [...s.days.values()].some((d) => entrySignalOf(d) !== null))
    .map(([id]) => id);
  if (candidateIds.length === 0) return [];

  const taiexStock = await prisma.stock.findUnique({ where: { market_ticker: { market: "TW", ticker: "TAIEX" } }, select: { id: true } });
  const barsByStock = await loadBars(taiexStock ? [...candidateIds, taiexStock.id] : candidateIds);
  const taiexByDate = new Map((taiexStock ? barsByStock.get(taiexStock.id) ?? [] : []).map((b) => [b.date, b]));

  const trades: TrackRecordTrade[] = [];
  for (const id of candidateIds) {
    const s = signalsByStock.get(id)!;
    const bars = barsByStock.get(id);
    if (!bars || bars.length === 0) continue;
    trades.push(...simulateStock(s.ticker, s.companyName, bars, s.days, taiexByDate));
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
