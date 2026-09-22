import { Flame, Snowflake, Radar, type LucideIcon } from "lucide-react";

export type ThemeMomentumBucket = "leading" | "outflowing" | "accumulating";

export interface ThemeMomentumInput {
  return1d: number | null;
  return5d: number | null;
  concentration1d: number | null;
  concentration5d: number | null;
  sampleSize: number;
}

/** 樣本數<這個門檻不分類——單一個股噪音很容易冒充整個族群的訊號 */
const MIN_SAMPLE_SIZE = 2;
/** 本週籌碼集中度門檻(%絕對值)，今日同方向才算「還在進行中」而不是已經退燒 */
const MIN_CONCENTRATION_PCT = 0.5;
/** 本週報酬門檻(%)，超過視為「已經在噴」，用來把leading跟accumulating分開 */
const STRONG_RETURN_PCT = 1.5;

/**
 * 板塊資金雷達（ThemeCapitalRadar.tsx）的分類邏輯：純函式，不碰DB，方便調門檻常數。
 * 三個桶互斥（concentrating跟outflowing因為正負門檻不可能同時成立）：
 * - leading（強勢籌碼集中）：這週籌碼集中+今天還在買+這週報酬已經噴出
 * - accumulating（悄悄進場中）：這週籌碼集中+今天還在買，但報酬還沒噴出——籌碼領先股價的情境
 * - outflowing（資金流出）：這週籌碼淨流出+今天還在賣
 */
export function classifyThemeMomentum(cell: ThemeMomentumInput): ThemeMomentumBucket | null {
  if (cell.sampleSize < MIN_SAMPLE_SIZE) return null;
  if (cell.concentration1d === null || cell.concentration5d === null) return null;

  const concentrating = cell.concentration5d > MIN_CONCENTRATION_PCT && cell.concentration1d > 0;
  const outflowing = cell.concentration5d < -MIN_CONCENTRATION_PCT && cell.concentration1d < 0;
  const strong = cell.return5d !== null && cell.return5d > STRONG_RETURN_PCT;

  if (concentrating) return strong ? "leading" : "accumulating";
  if (outflowing) return "outflowing";
  return null;
}

export interface ThemeMomentumMeta {
  icon: LucideIcon;
  color: "emerald" | "rose" | "blue";
  label: string;
}

/** 跟 tacticalStatusMeta.ts 既有的色彩語意保持一致——TACTICAL_STATUS_META.reversal
 * 用Radar+blue+「提早佈局」，概念上就是這裡的accumulating */
export const THEME_MOMENTUM_META: Record<ThemeMomentumBucket, ThemeMomentumMeta> = {
  leading: { icon: Flame, color: "emerald", label: "強勢籌碼集中" },
  outflowing: { icon: Snowflake, color: "rose", label: "資金流出" },
  accumulating: { icon: Radar, color: "blue", label: "悄悄進場中" },
};
