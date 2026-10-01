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
  let maxCloseSinceEntry = 0;
  let trustSellStreak = 0;
  let prevEntrySignal: EntrySignal | null = null;

  const exitAt = (trade: SimTrade, index: number, price: number, field: SimTrade["exitField"], signal: ExitSignal, signalDate: string, reason: string | null) => {
    trade.exitIndex = index;
    trade.exitPrice = price;
    trade.exitField = field;
    trade.exitSignal = signal;
    trade.exitSignalDate = signalDate;
    trade.exitSignalReason = reason;
  };

  for (let i = startIndex; i < bars.length; i++) {
    const bar = bars[i];
    const day = days.get(bar.date);

    if (holding && i >= holding.entryIndex!) {
      const entryPrice = holding.entryPrice!;
      const heldDays = i - holding.entryIndex! + 1;
      const stopPrice = rule.stopLossPct !== null ? entryPrice * (1 - rule.stopLossPct / 100) : null;
      const target = rule.patternTakeProfit ? holding.targetPrice : null;

      // 1. 盤中停損（保守起見同一天先檢查停損再檢查停利）
      if (stopPrice !== null && bar.low <= stopPrice) {
        exitAt(holding, i, Math.min(bar.open, stopPrice), "intraday", "stopLoss", bar.date, null);
        holding = null;
      } else if (target !== null && target > entryPrice && bar.high >= target) {
        // 2. 盤中觸及型態目標價
        exitAt(holding, i, Math.max(bar.open, target), "intraday", "takeProfit", bar.date, null);
        holding = null;
      } else if (heldDays >= rule.maxHoldingDays) {
        // 3. 持有期滿，當天收盤出場
        exitAt(holding, i, bar.close, "close", "maxHolding", bar.date, null);
        holding = null;
      } else {
        // 4. 收盤後才知道的條件，隔天開盤出場
        maxCloseSinceEntry = Math.max(maxCloseSinceEntry, bar.close);
        const trustNet = trustNetBuyByDate.get(bar.date);
        trustSellStreak = trustNet !== undefined && trustNet < 0 ? trustSellStreak + 1 : 0;

        let signal: ExitSignal | null = null;
        let reason: string | null = null;
        if (rule.reverseSignal && day && SELL_STATUSES.has(day.status)) {
          signal = day.status as ExitSignal;
          reason = day.triggerReason;
        } else if (rule.trustSellStreak !== null && trustSellStreak >= rule.trustSellStreak) {
          signal = "trustSellStreak";
        } else if (
          ma &&
          ma[i] !== null &&
          maxCloseSinceEntry >= entryPrice * (1 + rule.trailingActivatePct / 100) &&
          bar.close < (ma[i] as number)
        ) {
          signal = "trailingStop";
        }

        if (signal) {
          if (i + 1 < bars.length) {
            exitAt(holding, i + 1, bars[i + 1].open, "open", signal, bar.date, reason);
            holding = null;
          } else {
            // 出場訊號出現在最新一天，隔天開盤才會成交
            holding.exitSignal = signal;
            holding.exitSignalDate = bar.date;
            holding.exitSignalReason = reason;
          }
        }
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
        maxCloseSinceEntry = 0;
        trustSellStreak = 0;
      }
    }
  }

  return trades;
}
