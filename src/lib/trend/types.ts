export interface OhlcvBar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * 美股版三段式（src/lib/trend/classify.ts）："reversal"/"pullback"/"bullish"，"none" = 三種
 * 分類條件皆不符合，當日不歸類進任何戰術面板欄位（不會寫入 daily_trend_signals）。
 *
 * "limitMove" = 台股版專用：當日觸及漲跌停(±10%)，不套用一般分類邏輯，標記為特殊狀態
 * （會寫入 daily_trend_signals，跟 "none" 不同）。美股版不會產生這個狀態。
 *
 * "chipLeading" = 舊版台股邏輯（2026-07-09~2026-07-23）留下的歷史值，"entry"/"exit" 是
 * 2026-07-23~2026-08-17 版籌碼流策略的歷史值，2026-08-17改版後都不會再產生新資料（見下方
 * 多空五段式說明），只是為了讓舊資料還能正常顯示才保留這幾個union member，不要在新程式碼裡使用。
 *
 * 多空五段式 = 台股版目前的籌碼流策略狀態（2026-08-17起，取代原本entry/exit/buyDip三段式，
 * src/lib/trend/tw/classifyChipFlow.ts），UI上分「多方」「空方」兩個tab：
 * 多方（優先序：投信轉買 > 投信外資合買 > 逢低布局）：
 * - "trustTurnBuy"（投信轉買）：投信由賣轉買的翻轉日（今日淨買超>0、昨日<=0）。
 * - "combinedBuy"（投信外資合買）：外資+投信「當天同時」淨買超，UI標註連續第幾天。
 * - "buyDip"（逢低布局）：股價回落季線(MA60)±1.5%以內、籌碼集中度(5日)≥15%。2026-07-23版
 *   backtest驗證過這組條件有真實、穩健的超額報酬（20日中位數約+2.1%~+2.3%，勝率70%+），
 *   是這整套策略裡目前唯一有backtest證據支持的訊號，改版後條件本身沒有變。
 * 空方（優先序：投信轉賣 > 投信外資合賣，沒有逢低布局的空方對應概念）：
 * - "trustTurnSell"（投信轉賣）：投信由買轉賣的翻轉日。
 * - "combinedSell"（投信外資合賣）：外資+投信「當天同時」淨賣超，UI標註連續第幾天。
 * 美股版不會產生這五個狀態（沒有投信/外資籌碼資料）。
 */
export type TrendStatus =
  | "reversal"
  | "pullback"
  | "bullish"
  | "none"
  | "limitMove"
  | "chipLeading"
  | "entry"
  | "exit"
  | "buyDip"
  | "trustTurnBuy"
  | "combinedBuy"
  | "trustTurnSell"
  | "combinedSell";

/** 會寫入 daily_trend_signals 的狀態（排除 "none"） */
export type WritableTrendStatus = Exclude<TrendStatus, "none">;

export interface SubScores {
  ma: number;
  momentum: number;
  adx: number;
  relStrength: number;
  volume: number;
}

export interface IndicatorSnapshot {
  ma20: number | null;
  ma50: number | null;
  ma200: number | null;
  rsi14: number | null;
  adx14: number | null;
  macdHist: number | null;
  avgVolume20d: number | null;
}

export interface DailySignal {
  tradeDate: string;
  closePrice: number;
  volume: number;
  indicators: IndicatorSnapshot;
  scores: SubScores;
  coreScore: number;
  status: TrendStatus;
  reversalPointDate: string | null;
  priceAtSignal: number | null;
}
