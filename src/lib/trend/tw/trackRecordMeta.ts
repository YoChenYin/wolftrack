/** 選股績效驗證的型別/標籤，跟trackRecord.ts（會import prisma）分開，client元件才能直接用 */
export type EntrySignal = "trustTurnBuy" | "combinedBuy" | "buyDip" | "bottomPattern";
export type ExitSignal =
  | "trustTurnSell"
  | "combinedSell"
  | "trustSellStreak"
  | "stopLoss"
  | "trailingStop"
  | "takeProfit"
  | "maxHolding";

/** 出場規則參數，見trackRecordSim.ts的simulateTrades()。null＝不啟用這個條件 */
export interface ExitRule {
  /** 持有滿N個交易日，當天收盤強制出場 */
  maxHoldingDays: number;
  /** 出現投信轉賣/投信外資合賣（單日翻轉）就出場 */
  reverseSignal: boolean;
  /** 投信連續N日淨賣超才出場（比單日翻轉更不容易被洗掉） */
  trustSellStreak: number | null;
  /** 從進場價下跌N%盤中停損 */
  stopLossPct: number | null;
  /** 移動停利：持有期間最高收盤曾經獲利≥trailingActivatePct%之後，收盤跌破N日均線就出場 */
  trailingMa: number | null;
  trailingActivatePct: number;
  /** 底部型態進場的部位，盤中觸及型態量測目標價就停利 */
  patternTakeProfit: boolean;
}
export type TradeStatus = "closed" | "open" | "pendingEntry";

/**
 * 目前績效驗證頁採用的出場規則（2026-10-01定案，取代原本的「反向訊號或持有滿20日」）。
 * 依據scripts/compare-track-record-exits.ts的比較：反向訊號是單日翻轉、太容易洗出場；
 * 停損（6~15%都試過）在前後兩段樣本都明顯拉低報酬；移動停利+拉長持有期在前後兩段、
 * 偏空環境都維持最好的勝率/中位數/最差10%。樣本以2024~2026多頭為主，空頭時期驗證有限。
 */
export const TRACK_RECORD_EXIT_RULE: ExitRule = {
  maxHoldingDays: 60,
  reverseSignal: false,
  trustSellStreak: null,
  stopLossPct: null,
  trailingMa: 10,
  trailingActivatePct: 5,
  patternTakeProfit: true,
};

export const ENTRY_SIGNAL_LABEL: Record<EntrySignal, string> = {
  trustTurnBuy: "投信轉買",
  combinedBuy: "投信外資合買",
  buyDip: "逢低布局",
  bottomPattern: "底部出現",
};

export function exitSignalLabel(signal: ExitSignal, rule: ExitRule): string {
  switch (signal) {
    case "trustTurnSell":
      return "投信轉賣";
    case "combinedSell":
      return "投信外資合賣";
    case "trustSellStreak":
      return `投信連賣${rule.trustSellStreak}日`;
    case "stopLoss":
      return `停損 -${rule.stopLossPct}%`;
    case "trailingStop":
      return `跌破${rule.trailingMa}日線`;
    case "takeProfit":
      return "達型態目標價";
    case "maxHolding":
      return `持有滿${rule.maxHoldingDays}日`;
  }
}

export interface TrackRecordTrade {
  ticker: string;
  companyName: string;
  status: TradeStatus;
  entrySignal: EntrySignal;
  entrySignalDate: string;
  entrySignalReason: string | null;
  /** 實際成交日＝訊號隔一個交易日，pendingEntry時是null（隔天資料還沒進來） */
  entryDate: string | null;
  entryPrice: number | null;
  exitSignal: ExitSignal | null;
  exitSignalDate: string | null;
  exitSignalReason: string | null;
  exitDate: string | null;
  exitPrice: number | null;
  /** 出場價是開盤價（收盤後才知道的訊號，隔天開盤出場）、收盤價（持有期滿）、或盤中觸價 */
  exitPriceType: "open" | "close" | "intraday" | null;
  /** 持有中的部位是最新收盤價 */
  markPrice: number | null;
  markDate: string | null;
  /** 已出場＝實現報酬，持有中＝未實現報酬 */
  returnPct: number | null;
  taiexReturnPct: number | null;
  excessReturnPct: number | null;
  holdingDays: number | null;
}
