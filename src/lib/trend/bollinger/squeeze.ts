import type { OhlcvBar } from "../types";
import type { BollingerAnalysisConfig } from "./types";
import type { BollingerSeries } from "./series";

/** 今天 Band Width 是否落在近期較窄的 percentile 區間內（見 DEFAULT_BOLLINGER_CONFIG.squeezePercentileThreshold） */
export function isSqueezeAt(series: BollingerSeries, index: number, config: BollingerAnalysisConfig): boolean {
  const rank = series.bandwidthPercentileRank[index];
  return rank !== null && rank <= config.squeezePercentileThreshold;
}

export type SqueezeBreakoutDirection = "bullish" | "bearish" | null;

/**
 * Squeeze 本身不是買賣訊號，只有等到價格真正「向上突破 Upper Band」或「向下跌破 Lower Band」，
 * 且突破前不久曾經處於 Squeeze 狀態，才算數。只在「今天剛突破、昨天還沒突破」那天觸發一次，
 * 避免突破後每天都重複回報同一個訊號。
 */
export function detectSqueezeBreakout(
  bars: OhlcvBar[],
  series: BollingerSeries,
  targetIndex: number,
  config: BollingerAnalysisConfig
): SqueezeBreakoutDirection {
  if (targetIndex < 1) return null;

  const start = Math.max(0, targetIndex - config.breakoutLookbackDays);
  let squeezeSeenRecently = false;
  for (let i = start; i < targetIndex; i++) {
    if (isSqueezeAt(series, i, config)) {
      squeezeSeenRecently = true;
      break;
    }
  }
  if (!squeezeSeenRecently) return null;

  const upper = series.bb.upper[targetIndex];
  const lower = series.bb.lower[targetIndex];
  const prevUpper = series.bb.upper[targetIndex - 1];
  const prevLower = series.bb.lower[targetIndex - 1];
  const close = bars[targetIndex].close;
  const prevClose = bars[targetIndex - 1].close;
  if (upper === null || lower === null) return null;

  const brokeAboveToday = close > upper;
  const wasAboveYesterday = prevUpper !== null && prevClose > prevUpper;
  if (brokeAboveToday && !wasAboveYesterday) return "bullish";

  const brokeBelowToday = close < lower;
  const wasBelowYesterday = prevLower !== null && prevClose < prevLower;
  if (brokeBelowToday && !wasBelowYesterday) return "bearish";

  return null;
}
