/** 選股績效驗證的型別/標籤，跟trackRecord.ts（會import prisma）分開，client元件才能直接用 */
export const MAX_HOLDING_DAYS = 20;

export type EntrySignal = "trustTurnBuy" | "combinedBuy" | "buyDip" | "bottomPattern";
export type ExitSignal = "trustTurnSell" | "combinedSell" | "maxHolding";
export type TradeStatus = "closed" | "open" | "pendingEntry";

export const ENTRY_SIGNAL_LABEL: Record<EntrySignal, string> = {
  trustTurnBuy: "投信轉買",
  combinedBuy: "投信外資合買",
  buyDip: "逢低布局",
  bottomPattern: "底部出現",
};

export const EXIT_SIGNAL_LABEL: Record<ExitSignal, string> = {
  trustTurnSell: "投信轉賣",
  combinedSell: "投信外資合賣",
  maxHolding: `持有滿${MAX_HOLDING_DAYS}日`,
};

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
  /** 持有中的部位是最新收盤價 */
  markPrice: number | null;
  markDate: string | null;
  /** 已出場＝實現報酬，持有中＝未實現報酬 */
  returnPct: number | null;
  taiexReturnPct: number | null;
  excessReturnPct: number | null;
  holdingDays: number | null;
}
