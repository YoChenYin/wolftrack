import type { OhlcvBar } from "../types";
import type { BollingerAnalysisConfig } from "./types";
import type { BollingerSeries } from "./series";
import { isBullishReversalCandle, isBearishReversalCandle } from "./candlePatterns";

export interface SignalEvaluation {
  fired: boolean;
  reasons: string[];
}

const NO_SIGNAL: SignalEvaluation = { fired: false, reasons: [] };

/** 近 fromIndex+1..toIndex 之間，是否曾經高過 bars[fromIndex].high（用來判斷「無法持續創新高」） */
function hasNewHighAfter(bars: OhlcvBar[], fromIndex: number, toIndex: number): boolean {
  const baseHigh = bars[fromIndex].high;
  for (let i = fromIndex + 1; i <= toIndex; i++) {
    if (bars[i].high > baseHigh) return true;
  }
  return false;
}

function volumeConfirmationReason(
  bars: OhlcvBar[],
  avgVolume: (number | null)[],
  index: number,
  config: BollingerAnalysisConfig
): string | null {
  const avg = avgVolume[index];
  if (avg === null || avg <= 0) return null;
  if (bars[index].volume > avg * config.volumeSpikeMultiplier) return "Volume increased alongside the move";
  return null;
}

/**
 * Signal A — 下軌超跌（需求文件「三、Signal A」）。
 * 不是「碰到下軌」就觸發，而是要求一段完整序列依序成立：
 * 曾經觸及/跌破下軌 → （不必同一天）下軌後續走平而非續跌 → （不必同一天）出現止跌K線
 * → 今天重新站回下軌之上。
 *
 * 「觸及」跟「下軌走平」刻意不要求同一天成立：觸及下軌通常發生在下跌最猛烈的當下，此時
 * 下軌本身（= MA20 - 2*STD）往往還在因為波動度剛放大而繼續往下走，要再過幾天下跌動能
 * 減緩、股價止穩，下軌才會真正走平。如果要求兩者同一天成立，會導致這個訊號在真實資料上
 * 幾乎打不中。
 *
 * 不特別去重「連續好幾天都符合」的情況：跟 classify.ts 的三段式分類一樣，這是純粹的
 * 逐日判斷，一旦觸及下軌的那一天超出 oversoldWindowDays 視窗，訊號自然就不會再成立，
 * 不需要額外的「只觸發一次」機制。
 */
export function evaluateOversoldRebound(
  bars: OhlcvBar[],
  series: BollingerSeries,
  targetIndex: number,
  config: BollingerAnalysisConfig
): SignalEvaluation {
  const lower = series.bb.lower[targetIndex];
  if (lower === null || targetIndex < 1) return NO_SIGNAL;

  const close = bars[targetIndex].close;
  const reclaimedToday = close > lower;
  if (!reclaimedToday) return NO_SIGNAL;

  const start = Math.max(1, targetIndex - config.oversoldWindowDays);
  let touchIndex: number | null = null;
  let touchLower: number | null = null;
  for (let i = targetIndex - 1; i >= start; i--) {
    const iLower = series.bb.lower[i];
    if (iLower === null) continue;
    if (bars[i].close <= iLower * (1 + config.nearBandPct / 100)) {
      touchIndex = i;
      touchLower = iLower;
      break;
    }
  }
  if (touchIndex === null || touchLower === null) return NO_SIGNAL;

  let lowerBandFlattened = false;
  for (let i = touchIndex; i < targetIndex; i++) {
    if (series.lowerSlope[i] === "flat" || series.lowerSlope[i] === "up") {
      lowerBandFlattened = true;
      break;
    }
  }
  if (!lowerBandFlattened) return NO_SIGNAL;

  let stallCandle = false;
  for (let i = Math.max(1, touchIndex); i < targetIndex; i++) {
    if (isBullishReversalCandle(bars[i], bars[i - 1])) {
      stallCandle = true;
      break;
    }
  }
  if (!stallCandle) return NO_SIGNAL;

  return {
    fired: true,
    reasons: [
      `Price touched/undercut Lower Band on ${bars[touchIndex].date} (close ${bars[touchIndex].close.toFixed(2)} vs lower ${touchLower.toFixed(2)})`,
      "Lower Band has since flattened out rather than continuing to fall",
      "A stabilizing (bullish reversal) candle appeared near the low",
      `Price recovered back above Lower Band today (${close.toFixed(2)} > ${lower.toFixed(2)})`,
    ],
  };
}

/**
 * 往回找「股價收盤持續站在 MA20 之上」這段連續區間最早的一天（= 真正的突破日），
 * 條件是這段連續區間必須落在 windowDays 之內、中途沒有收盤跌破過 MA20。
 * 找不到（代表這段連續區間早於 windowDays，或今天根本沒站上 MA20）就回傳 null。
 *
 * 用連續區間、而不是單純比較「昨天 vs 今天」，是因為 MA20 是 20 日均線，斜率天生落後於價格：
 * 股價站上 MA20 當下，均線斜率往往還沒轉正/走平（還在反映稍早的下跌），要晚個幾天斜率才會跟上。
 * 若只看「今天剛穿越」那一天的斜率，多數真實的突破都會因為斜率還沒跟上而被誤判成不成立。
 */
function findMa20CrossAboveStreak(
  bars: OhlcvBar[],
  series: BollingerSeries,
  targetIndex: number,
  windowDays: number
): number | null {
  const earliest = Math.max(1, targetIndex - windowDays);
  let i = targetIndex;
  while (i >= earliest) {
    const ma = series.bb.middle[i];
    if (ma === null || bars[i].close <= ma) return null;
    const prevMa = series.bb.middle[i - 1];
    if (prevMa !== null && bars[i - 1].close < prevMa) return i;
    i--;
  }
  return null;
}

/** findMa20CrossAboveStreak 的鏡像版本（跌破後持續收在 MA20 之下） */
function findMa20CrossBelowStreak(
  bars: OhlcvBar[],
  series: BollingerSeries,
  targetIndex: number,
  windowDays: number
): number | null {
  const earliest = Math.max(1, targetIndex - windowDays);
  let i = targetIndex;
  while (i >= earliest) {
    const ma = series.bb.middle[i];
    if (ma === null || bars[i].close >= ma) return null;
    const prevMa = series.bb.middle[i - 1];
    if (prevMa !== null && bars[i - 1].close > prevMa) return i;
    i--;
  }
  return null;
}

/**
 * Signal B — 突破 MA20（需求文件「三、Signal B」），權重高於單純的 Signal A。
 * 條件：股價持續站上 MA20 的區間裡能找到真正的突破日 → 今天 MA20 斜率不再下降 →
 * 且「昨天斜率還是下降」（今天是這段站上 MA20 期間，斜率第一次跟上轉為走平/上升的一天）。
 * 這個「今天才第一次符合」的限制是為了只在確認的當下觸發一次，不要整段站上期間每天都重複報。
 */
export function evaluateMa20Breakout(
  bars: OhlcvBar[],
  series: BollingerSeries,
  targetIndex: number,
  config: BollingerAnalysisConfig
): SignalEvaluation {
  if (targetIndex < 1) return NO_SIGNAL;

  const slope = series.ma20Slope[targetIndex];
  if (slope === "down" || slope === null) return NO_SIGNAL;

  const crossIndex = findMa20CrossAboveStreak(bars, series, targetIndex, config.ma20CrossWindowDays);
  if (crossIndex === null) return NO_SIGNAL;

  if (targetIndex > crossIndex) {
    const prevSlope = series.ma20Slope[targetIndex - 1];
    const slopeAlreadyConfirmedEarlier = prevSlope === "flat" || prevSlope === "up";
    if (slopeAlreadyConfirmedEarlier) return NO_SIGNAL;
  }

  const ma = series.bb.middle[targetIndex] as number;
  const close = bars[targetIndex].close;
  const reasons = [
    crossIndex === targetIndex
      ? `Price crossed above MA20 today (${close.toFixed(2)} > ${ma.toFixed(2)})`
      : `Price broke above MA20 on ${bars[crossIndex].date} and has held above it since`,
    slope === "up" ? "MA20 slope turned positive" : "MA20 slope flattened out from its decline",
  ];
  const volumeReason = volumeConfirmationReason(bars, series.avgVolume, targetIndex, config);
  if (volumeReason) reasons.push(volumeReason);

  return { fired: true, reasons };
}

/**
 * Signal C — 上軌過熱（需求文件「四、Signal C」）。跟 Signal A 對稱（含同樣的「觸及」與
 * 「反轉」不須同一天成立、也不特別去重連續觸發的處理，見 evaluateOversoldRebound 的說明）：
 * 曾經觸及/突破上軌 → 之後沒能再創新高 → 這段期間出現反轉K線 → 今天重新跌回上軌之內。
 */
export function evaluateOverboughtReversal(
  bars: OhlcvBar[],
  series: BollingerSeries,
  targetIndex: number,
  config: BollingerAnalysisConfig
): SignalEvaluation {
  const upper = series.bb.upper[targetIndex];
  if (upper === null || targetIndex < 1) return NO_SIGNAL;

  const close = bars[targetIndex].close;
  const backInsideToday = close < upper;
  if (!backInsideToday) return NO_SIGNAL;

  const start = Math.max(1, targetIndex - config.overboughtWindowDays);
  let touchIndex: number | null = null;
  let touchUpper: number | null = null;
  for (let i = targetIndex - 1; i >= start; i--) {
    const iUpper = series.bb.upper[i];
    if (iUpper === null) continue;
    if (bars[i].high >= iUpper * (1 - config.nearBandPct / 100)) {
      touchIndex = i;
      touchUpper = iUpper;
      break;
    }
  }
  if (touchIndex === null || touchUpper === null) return NO_SIGNAL;

  if (hasNewHighAfter(bars, touchIndex, targetIndex)) return NO_SIGNAL;

  let reversalCandle = false;
  for (let i = Math.max(1, touchIndex); i < targetIndex; i++) {
    if (isBearishReversalCandle(bars[i], bars[i - 1])) {
      reversalCandle = true;
      break;
    }
  }
  if (!reversalCandle) return NO_SIGNAL;

  return {
    fired: true,
    reasons: [
      `Price touched/exceeded Upper Band on ${bars[touchIndex].date} (high ${bars[touchIndex].high.toFixed(2)} vs upper ${touchUpper.toFixed(2)})`,
      "No follow-through new high since then",
      "A bearish reversal candle appeared near the high",
      `Price closed back inside Upper Band today (${close.toFixed(2)} < ${upper.toFixed(2)})`,
    ],
  };
}

/**
 * Signal D — 跌破 MA20（需求文件「四、Signal D」），跟 Signal B 對稱（含同樣的斜率延遲處理）。
 */
export function evaluateMa20Breakdown(
  bars: OhlcvBar[],
  series: BollingerSeries,
  targetIndex: number,
  config: BollingerAnalysisConfig
): SignalEvaluation {
  if (targetIndex < 1) return NO_SIGNAL;

  const slope = series.ma20Slope[targetIndex];
  if (slope === "up" || slope === null) return NO_SIGNAL;

  const crossIndex = findMa20CrossBelowStreak(bars, series, targetIndex, config.ma20CrossWindowDays);
  if (crossIndex === null) return NO_SIGNAL;

  if (targetIndex > crossIndex) {
    const prevSlope = series.ma20Slope[targetIndex - 1];
    const slopeAlreadyConfirmedEarlier = prevSlope === "flat" || prevSlope === "down";
    if (slopeAlreadyConfirmedEarlier) return NO_SIGNAL;
  }

  const ma = series.bb.middle[targetIndex] as number;
  const close = bars[targetIndex].close;
  const reasons = [
    crossIndex === targetIndex
      ? `Price broke below MA20 today (${close.toFixed(2)} < ${ma.toFixed(2)})`
      : `Price broke below MA20 on ${bars[crossIndex].date} and has stayed below it since`,
    slope === "down" ? "MA20 slope turned negative" : "MA20 slope flattened out from its rise",
  ];
  const volumeReason = volumeConfirmationReason(bars, series.avgVolume, targetIndex, config);
  if (volumeReason) reasons.push("Volume increased alongside the breakdown");

  return { fired: true, reasons };
}
