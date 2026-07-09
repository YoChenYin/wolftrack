export interface OhlcvBar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * "none" = 三種分類條件皆不符合，當日不歸類進任何戰術面板欄位。
 * TODO: 待業務端確認 — spec 只定義了三種狀態，沒有定義「都不符合」時的預設行為，
 * 這是本次實作補上的第四種內部狀態，不會寫入 daily_trend_signals。
 *
 * "limitMove" = 台股版專用：當日觸及漲跌停(±10%)，不套用一般三段式分類邏輯，
 * 標記為特殊狀態（會寫入 daily_trend_signals，跟 "none" 不同）。美股版不會產生這個狀態。
 *
 * "chipLeading" = 台股版專用（2026-07-09）：技術面尚未觸發任何戰術分類（本來會是 "none"），
 * 但籌碼集中度呈現「5日>10日>20日」加速排列、且籌碼分數/強度達門檻，判斷是法人可能已經
 * 開始布局、股價還沒真的發動。跟其餘三種狀態不同，可信度天生較低（少了技術面確認），
 * 只是「觀察名單」不是「進場訊號」，會寫入 daily_trend_signals 但在 UI 上獨立區隔顯示。
 * 美股版不會產生這個狀態（US 沒有籌碼資料）。
 */
export type TrendStatus = "reversal" | "pullback" | "bullish" | "none" | "limitMove" | "chipLeading";

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
