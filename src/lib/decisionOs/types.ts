/**
 * 台指期 Decision OS 共用型別。完整設計見 docs/taifex-decision-os-prd.html。
 * MVP 階段只實作 L3(台股環境)/L4(法人籌碼)/L6(技術分析)——這三層的資料源已經驗證可用；
 * L1(全球市場)/L2(總體風險)/L5(市場情緒) 資料源還缺（NASDAQ/SOX、事件行事曆、大額交易人），
 * 見 PRD 第15節「資料源現況總表」，先不接進來假裝有資料。
 */

/** -2..+2，對應 PRD 第4節的星等↔分數對照 */
export type IndicatorScoreValue = -2 | -1 | 0 | 1 | 2;

export interface IndicatorScore {
  key: string;
  label: string;
  score: IndicatorScoreValue;
  /** 1-5 星，score+3 (-2→1星, +2→5星) */
  stars: 1 | 2 | 3 | 4 | 5;
  /** 這個指標當下的實際讀值，null 代表資料不足（暖身期未滿等） */
  value: number | null;
  /** 一句話說明為什麼是這個分數，UI 展開時顯示 */
  detail: string;
}

export type LayerKey = "L3" | "L4" | "L6";

export interface LayerScore {
  layer: LayerKey;
  label: string;
  /** 該層所有指標分數的平均，範圍 -2..+2；指標為空陣列時為 null（資料完全缺失） */
  score: number | null;
  indicators: IndicatorScore[];
}

/** 層權重，PRD 第4節——總和 10.0，讓總分理論最大值對齊 ±20 錨點。L1/L2/L5 權重保留但 MVP 不產生分數 */
export const LAYER_WEIGHTS: Record<LayerKey, number> = {
  L3: 1.5,
  L4: 2.5,
  L6: 3.0,
};
