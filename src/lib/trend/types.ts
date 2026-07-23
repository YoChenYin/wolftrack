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
 * "chipLeading" = 舊版台股邏輯（2026-07-09~2026-07-23）留下的歷史值，2026-07-23改版後
 * 不會再產生新的（見下方 entry/exit/buyDip 說明），只是為了讓舊資料還能正常顯示才保留這個
 * union member，不要在新程式碼裡使用。
 *
 * "entry"/"exit"/"buyDip" = 台股版新的籌碼流策略三段式狀態（2026-07-23起，取代原本共用的
 * reversal/pullback/bullish，src/lib/trend/tw/classifyChipFlow.ts）：
 * - "entry"（進場）：投信/外資近3個月買超、買超力道與籌碼集中度呈5日>10日>20日加速排列、
 *   KD黃金交叉且K持續走強、MA5>10>20多頭排列。⚠️回測顯示這組條件本身的超額報酬接近打平
 *   （20日中位數約-0.04%），不是明確有alpha的訊號，比較像是「符合使用者定義的進場條件」
 *   而非「經驗證有效的買進訊號」，UI上需要如實揭露這點。
 * - "exit"（出場）：MA5跌破MA10、投信/外資賣超力道2日>5日>10日加速、或近3日噴出後跌破
 *   對應均線的停利規則。回測驗證投信外資賣超加速是六個候選出場條件裡預測力最強的
 *   （20日中位超額報酬-1.6%~-2.1%），MA死叉次之，K轉弱因為預測力最弱且會過早出場已經拿掉。
 * - "buyDip"（逢低布局）：股價回落季線(MA60)±1.5%以內、籌碼集中度(5日)≥15%。回測驗證這組
 *   條件有真實、穩健的超額報酬（20日中位數約+2.1%~+2.3%，勝率70%+），是目前這套策略裡
 *   唯一有明確alpha的訊號。
 * 美股版不會產生這三個狀態（沒有投信/外資籌碼資料）。
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
  | "buyDip";

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
