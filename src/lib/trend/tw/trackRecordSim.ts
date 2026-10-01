import { sma } from "@/lib/trend/indicators";
import type { EntrySignal, ExitRule, ExitSignal } from "./trackRecordMeta";

/**
 * 選股績效驗證的逐筆交易模擬核心（純函式，不碰DB）——/tw/track-record（trackRecord.ts，用
 * daily_trend_signals實際寫入的訊號）跟出場規則研究腳本（scripts/compare-track-record-exits.ts，
 * 用歷史資料回溯重算訊號）共用同一份模擬邏輯，確保研究比較出來的規則跟頁面上實際算的一致。
 *
 * 成交價規則：
 * - 進場：訊號隔一個交易日開盤價（訊號是收盤後才算出來的）
 * - 盤中停損/停利：當天最低價碰到停損價／最高價碰到目標價就成交，跳空開低/開高時用開盤價
 * - 收盤後才知道的出場條件（反向訊號、投信連賣、跌破均線）：隔天開盤價
 * - 持有期滿：第N個交易日收盤價（事先知道，收盤前就能下單）
 */

export interface SimBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface SimDay {
  status: string;
  triggerReason: string | null;
  /** 這天有底部型態（即將突破或已確認） */
  hasBottomPattern: boolean;
  bottomPatternDescription: string | null;
  bottomPatternTargetPrice: number | null;
}

export interface SimTrade {
  entrySignal: EntrySignal;
  entrySignalDate: string;
  entrySignalReason: string | null;
  /** 進場成交那根bar的index，null＝訊號出現在最新一天，隔天還沒開盤 */
  entryIndex: number | null;
  entryPrice: number | null;
  exitSignal: ExitSignal | null;
  exitSignalDate: string | null;
  exitSignalReason: string | null;
  /** 出場成交那根bar的index，null＝還沒出場（持有中，或出場訊號在最新一天、隔天才會成交） */
  exitIndex: number | null;
  exitPrice: number | null;
  exitField: "open" | "close" | "intraday" | null;
  /** 型態停利用的目標價（只有底部型態進場才有） */
  targetPrice: number | null;
}

const BUY_STATUSES = new Set(["trustTurnBuy", "combinedBuy", "buyDip"]);
const SELL_STATUSES = new Set(["trustTurnSell", "combinedSell"]);

export function isSellStatus(status: string): boolean {
  return SELL_STATUSES.has(status);
}

export function entrySignalOf(day: SimDay | undefined): EntrySignal | null {
  if (!day || SELL_STATUSES.has(day.status)) return null;
  if (BUY_STATUSES.has(day.status)) return day.status as EntrySignal;
  return day.hasBottomPattern ? "bottomPattern" : null;
}

/** 持有中部位的狀態，模擬交易跟使用者實際持倉（evaluatePosition）共用 */
interface PositionState {
  entryIndex: number;
  entryPrice: number;
  targetPrice: number | null;
  stopPrice: number | null;
  maxCloseSinceEntry: number;
  trustSellStreak: number;
}

type ExitDecision =
  /** 當天就成交（盤中停損/停利、持有期滿收盤） */
  | { kind: "filled"; signal: ExitSignal; index: number; price: number; field: "close" | "intraday"; reason: string | null }
  /** 收盤後才確認的訊號，隔天開盤成交 */
  | { kind: "nextOpen"; signal: ExitSignal; reason: string | null };

/**
 * 第i天持有中部位要不要出場，順序：盤中停損→盤中停利→持有期滿→收盤後條件（反向訊號/
 * 投信連賣/移動停利）。會更新pos的最高收盤/投信連賣天數，所以每天只能呼叫一次、要照順序。
 */
function checkExit(
  pos: PositionState,
  bars: SimBar[],
  i: number,
  ma: (number | null)[] | null,
  day: SimDay | undefined,
  trustNet: number | undefined,
  rule: ExitRule
): ExitDecision | null {
  const bar = bars[i];
  const heldDays = i - pos.entryIndex + 1;

  // 保守起見同一天先檢查停損再檢查停利
  if (pos.stopPrice !== null && bar.low <= pos.stopPrice) {
    return { kind: "filled", signal: "stopLoss", index: i, price: Math.min(bar.open, pos.stopPrice), field: "intraday", reason: null };
  }
  if (pos.targetPrice !== null && pos.targetPrice > pos.entryPrice && bar.high >= pos.targetPrice) {
    return { kind: "filled", signal: "takeProfit", index: i, price: Math.max(bar.open, pos.targetPrice), field: "intraday", reason: null };
  }
  if (heldDays >= rule.maxHoldingDays) {
    return { kind: "filled", signal: "maxHolding", index: i, price: bar.close, field: "close", reason: null };
  }

  pos.maxCloseSinceEntry = Math.max(pos.maxCloseSinceEntry, bar.close);
  pos.trustSellStreak = trustNet !== undefined && trustNet < 0 ? pos.trustSellStreak + 1 : 0;

  if (rule.reverseSignal && day && SELL_STATUSES.has(day.status)) {
    return { kind: "nextOpen", signal: day.status as ExitSignal, reason: day.triggerReason };
  }
  if (rule.trustSellStreak !== null && pos.trustSellStreak >= rule.trustSellStreak) {
    return { kind: "nextOpen", signal: "trustSellStreak", reason: null };
  }
  if (
    ma &&
    ma[i] !== null &&
    pos.maxCloseSinceEntry >= pos.entryPrice * (1 + rule.trailingActivatePct / 100) &&
    bar.close < (ma[i] as number)
  ) {
    return { kind: "nextOpen", signal: "trailingStop", reason: null };
  }
  return null;
}

/**
 * bars：日期升序，可以包含startIndex之前的暖身資料（算均線用），交易只會從startIndex開始。
 * trustNetBuyByDate：投信每日淨買賣超（張或股都可以，只看正負號），trustSellStreak規則用。
 */
export function simulateTrades(
  bars: SimBar[],
  days: Map<string, SimDay>,
  trustNetBuyByDate: Map<string, number>,
  rule: ExitRule,
  startIndex = 0
): SimTrade[] {
  const trades: SimTrade[] = [];
  const ma = rule.trailingMa ? sma(bars.map((b) => b.close), rule.trailingMa) : null;

  let holding: SimTrade | null = null;
  let pos: PositionState | null = null;
  let prevEntrySignal: EntrySignal | null = null;

  for (let i = startIndex; i < bars.length; i++) {
    const bar = bars[i];
    const day = days.get(bar.date);

    if (holding && pos && i >= pos.entryIndex) {
      const decision = checkExit(pos, bars, i, ma, day, trustNetBuyByDate.get(bar.date), rule);
      if (decision?.kind === "filled") {
        Object.assign(holding, {
          exitIndex: decision.index,
          exitPrice: decision.price,
          exitField: decision.field,
          exitSignal: decision.signal,
          exitSignalDate: bar.date,
          exitSignalReason: decision.reason,
        });
        holding = null;
      } else if (decision?.kind === "nextOpen") {
        holding.exitSignal = decision.signal;
        holding.exitSignalDate = bar.date;
        holding.exitSignalReason = decision.reason;
        if (i + 1 < bars.length) {
          holding.exitIndex = i + 1;
          holding.exitPrice = bars[i + 1].open;
          holding.exitField = "open";
          holding = null;
        }
        // 出場訊號出現在最新一天：隔天開盤才會成交，先留在持有中
      }
    }

    const entrySignal = entrySignalOf(day);
    const isNewSignal = entrySignal !== null && entrySignal !== prevEntrySignal;
    prevEntrySignal = entrySignal;

    // 隔天開盤才出場的部位，當天還算持有中，不能同一天又進場
    if (!holding && isNewSignal && day && !(trades.length > 0 && (trades[trades.length - 1].exitIndex ?? -1) > i)) {
      const trade: SimTrade = {
        entrySignal,
        entrySignalDate: bar.date,
        entrySignalReason: entrySignal === "bottomPattern" ? day.bottomPatternDescription : day.triggerReason,
        entryIndex: null,
        entryPrice: null,
        exitSignal: null,
        exitSignalDate: null,
        exitSignalReason: null,
        exitIndex: null,
        exitPrice: null,
        exitField: null,
        targetPrice: entrySignal === "bottomPattern" ? day.bottomPatternTargetPrice : null,
      };
      trades.push(trade);
      if (i + 1 < bars.length) {
        trade.entryIndex = i + 1;
        trade.entryPrice = bars[i + 1].open;
        holding = trade;
        pos = {
          entryIndex: i + 1,
          entryPrice: trade.entryPrice,
          targetPrice: rule.patternTakeProfit ? trade.targetPrice : null,
          stopPrice: rule.stopLossPct !== null ? trade.entryPrice * (1 - rule.stopLossPct / 100) : null,
          maxCloseSinceEntry: 0,
          trustSellStreak: 0,
        };
      }
    }
  }

  return trades;
}

export interface PositionEvaluation {
  /** 進場日之後的交易日數（含進場日），進場日的收盤資料還沒進來時是0 */
  heldDays: number;
  latestDate: string | null;
  latestClose: number | null;
  returnPct: number | null;
  /** 移動停利是否已經啟動（持有期間最高收盤曾經獲利≥門檻） */
  trailingActive: boolean;
  /** 最新一天的均線值，移動停利啟動後收盤跌破它就出場 */
  trailingMaValue: number | null;
  /** 持有期間最高收盤價 */
  maxClose: number | null;
  /** 出場訊號：null＝續抱 */
  exit: {
    signal: ExitSignal;
    signalDate: string;
    /** filled＝當天已經成交（盤中觸價/期滿收盤）；nextOpen＝隔天開盤賣出（訊號在最新一天時還沒成交） */
    timing: "filled" | "nextOpen";
    /** 成交價（nextOpen且隔天資料已經進來時是隔天開盤價），還沒成交時是null */
    price: number | null;
    fillDate: string | null;
  } | null;
}

/**
 * 使用者實際持倉的出場追蹤（/tw/track-record「我的進場追蹤」）：跟模擬交易用同一套checkExit，
 * 差別是進場日/進場價是使用者自己填的（盤中買進，所以進場日當天就算第1天），停損/停利價
 * 也用使用者紀錄上的值（從底部型態訊號進場時會自動帶入型態目標價）。
 */
export function evaluatePosition(
  bars: SimBar[],
  entryDate: string,
  entryPrice: number,
  rule: ExitRule,
  targetPrice: number | null,
  stopPrice: number | null
): PositionEvaluation {
  const ma = rule.trailingMa ? sma(bars.map((b) => b.close), rule.trailingMa) : null;
  const entryIndex = bars.findIndex((b) => b.date >= entryDate);
  const empty: PositionEvaluation = {
    heldDays: 0,
    latestDate: bars.at(-1)?.date ?? null,
    latestClose: bars.at(-1)?.close ?? null,
    returnPct: null,
    trailingActive: false,
    trailingMaValue: null,
    maxClose: null,
    exit: null,
  };
  if (entryIndex === -1) return empty;

  const pos: PositionState = { entryIndex, entryPrice, targetPrice, stopPrice, maxCloseSinceEntry: 0, trustSellStreak: 0 };
  const noTrust = new Map<string, number>();
  for (let i = entryIndex; i < bars.length; i++) {
    const decision = checkExit(pos, bars, i, ma, undefined, noTrust.get(bars[i].date), rule);
    if (!decision) continue;
    const filled = decision.kind === "filled";
    const fill = filled ? { index: decision.index, price: decision.price } : i + 1 < bars.length ? { index: i + 1, price: bars[i + 1].open } : null;
    const exitPrice = fill?.price ?? bars[i].close;
    return {
      heldDays: (fill?.index ?? i) - entryIndex + 1,
      latestDate: bars.at(-1)!.date,
      latestClose: bars.at(-1)!.close,
      returnPct: ((exitPrice - entryPrice) / entryPrice) * 100,
      trailingActive: pos.maxCloseSinceEntry >= entryPrice * (1 + rule.trailingActivatePct / 100),
      trailingMaValue: ma?.[i] ?? null,
      maxClose: pos.maxCloseSinceEntry || null,
      exit: {
        signal: decision.signal,
        signalDate: bars[i].date,
        timing: filled ? "filled" : "nextOpen",
        price: fill?.price ?? null,
        fillDate: fill ? bars[fill.index].date : null,
      },
    };
  }

  const last = bars.length - 1;
  return {
    heldDays: last - entryIndex + 1,
    latestDate: bars[last].date,
    latestClose: bars[last].close,
    returnPct: ((bars[last].close - entryPrice) / entryPrice) * 100,
    trailingActive: pos.maxCloseSinceEntry >= entryPrice * (1 + rule.trailingActivatePct / 100),
    trailingMaValue: ma?.[last] ?? null,
    maxClose: pos.maxCloseSinceEntry || null,
    exit: null,
  };
}
