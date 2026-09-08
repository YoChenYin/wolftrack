import type { OhlcvBar } from "../types";
import {
  DEFAULT_BOLLINGER_CONFIG,
  type BollingerAnalysisConfig,
  type BollingerDayResult,
  type BollingerSignalType,
} from "./types";
import { computeBollingerSeries, type BollingerSeries } from "./series";
import { classifyBollingerTrend } from "./trend";
import { detectSqueezeBreakout, isSqueezeAt } from "./squeeze";
import {
  evaluateMa20Breakdown,
  evaluateMa20Breakout,
  evaluateOverboughtReversal,
  evaluateOversoldRebound,
  type SignalEvaluation,
} from "./signals";
import type { TrendClassification } from "./trend";

const SIGNAL_LABELS: Record<BollingerSignalType, string> = {
  buyOversold: "Potential Buy — Oversold",
  buyMa20Breakout: "Buy Confirmation — MA20 Breakout",
  sellOverbought: "Potential Sell — Overbought",
  sellMa20Breakdown: "Trend Weakening — MA20 Breakdown",
  squeezeBullishBreakout: "Bollinger Squeeze — Bullish Breakout",
  squeezeBearishBreakout: "Bollinger Squeeze — Bearish Breakout",
  squeezeWatch: "Bollinger Squeeze — Awaiting Breakout",
  hold: "Hold",
};

/**
 * 把 Signal A/B/C/D、Squeeze 突破、趨勢基準這幾種來源合併成單一 signal + score + reasons。
 * 優先序（需求文件「七、訊號優先級」只要求要有分數與理由，沒有規定各訊號間的優先序，
 * ⚠️假設：權重照需求文件字面意思——Signal B/D 明確寫「權重應高於」A/C，Squeeze 突破代表
 * 盤整後方向已經確認，同樣視為強訊號；沒有任何訊號觸發時，退回用趨勢本身當作 Hold 的基礎分數，
 * 對應需求文件「八、輸出格式」範例：Strong Bullish + 無明確反轉 → Signal: Hold, Score: +1）：
 *
 * MA20 Breakout(+2) / Breakdown(-2) > Squeeze Breakout(±2) > Oversold Rebound(+1) /
 * Overbought Reversal(-1) > Squeeze Watch(0) > 趨勢基準分數(Strong Bullish/Bullish=+1,
 * Bearish=-1, Range-bound/Neutral=0)。
 *
 * Signal A 與 B 若在同一天一起成立（例如急殺急拉的V轉，當天同時站回下軌又站上MA20），
 * 理由會合併呈現，但分數不疊加，維持在 [-2, 2] 的範圍內。
 */
function combineDailySignal(
  breakout: SignalEvaluation,
  breakdown: SignalEvaluation,
  oversold: SignalEvaluation,
  overbought: SignalEvaluation,
  squeezeBreakout: "bullish" | "bearish" | null,
  isSqueezeToday: boolean,
  trendLabel: string,
  trendReasons: string[],
  trendScore: -1 | 0 | 1
): { signal: BollingerSignalType; score: -2 | -1 | 0 | 1 | 2; reasons: string[] } {
  if (breakout.fired) {
    const reasons = oversold.fired ? [...oversold.reasons, ...breakout.reasons] : breakout.reasons;
    return { signal: "buyMa20Breakout", score: 2, reasons };
  }
  if (breakdown.fired) {
    const reasons = overbought.fired ? [...overbought.reasons, ...breakdown.reasons] : breakdown.reasons;
    return { signal: "sellMa20Breakdown", score: -2, reasons };
  }
  if (squeezeBreakout === "bullish") {
    return {
      signal: "squeezeBullishBreakout",
      score: 2,
      reasons: ["Band Width was recently in a low-percentile Squeeze", "Price broke out above the Upper Band"],
    };
  }
  if (squeezeBreakout === "bearish") {
    return {
      signal: "squeezeBearishBreakout",
      score: -2,
      reasons: ["Band Width was recently in a low-percentile Squeeze", "Price broke down below the Lower Band"],
    };
  }
  if (oversold.fired) {
    return { signal: "buyOversold", score: 1, reasons: oversold.reasons };
  }
  if (overbought.fired) {
    return { signal: "sellOverbought", score: -1, reasons: overbought.reasons };
  }
  if (isSqueezeToday) {
    return {
      signal: "squeezeWatch",
      score: 0,
      reasons: ["Band Width contracted into a low-percentile Squeeze — waiting for a directional breakout"],
    };
  }
  return { signal: "hold", score: trendScore, reasons: trendLabel === "Neutral" ? trendReasons : [...trendReasons, "No breakout or reversal confirmation yet"] };
}

function trendBaselineScore(trend: TrendClassification["trend"]): -1 | 0 | 1 {
  if (trend === "strongBullish" || trend === "bullish") return 1;
  if (trend === "bearish") return -1;
  return 0;
}

/** 分析單一交易日（targetIndex），series 需先用 computeBollingerSeries(bars, config) 算好 */
export function analyzeBollingerDay(
  bars: OhlcvBar[],
  series: BollingerSeries,
  targetIndex: number,
  config: BollingerAnalysisConfig = DEFAULT_BOLLINGER_CONFIG
): BollingerDayResult {
  const bar = bars[targetIndex];
  const upper = series.bb.upper[targetIndex];
  const middle = series.bb.middle[targetIndex];
  const lower = series.bb.lower[targetIndex];
  const bandwidth = series.bb.bandwidth[targetIndex];
  const percentB = series.bb.percentB[targetIndex];

  if (upper === null || middle === null || lower === null || bandwidth === null || percentB === null) {
    return {
      date: bar.date,
      close: bar.close,
      bands: null,
      ma20Slope: null,
      bandwidthDirection: null,
      isSqueeze: false,
      trend: "neutral",
      trendLabel: "Neutral",
      signal: "hold",
      signalLabel: SIGNAL_LABELS.hold,
      score: 0,
      reasons: ["Warming up — not enough bars yet to compute the full Bollinger Bands period"],
    };
  }

  const trendResult = classifyBollingerTrend(bars, series, targetIndex, config);
  const oversold = evaluateOversoldRebound(bars, series, targetIndex, config);
  const breakout = evaluateMa20Breakout(bars, series, targetIndex, config);
  const overbought = evaluateOverboughtReversal(bars, series, targetIndex, config);
  const breakdown = evaluateMa20Breakdown(bars, series, targetIndex, config);
  const squeezeBreakout = detectSqueezeBreakout(bars, series, targetIndex, config);
  const isSqueezeToday = isSqueezeAt(series, targetIndex, config);

  const combined = combineDailySignal(
    breakout,
    breakdown,
    oversold,
    overbought,
    squeezeBreakout,
    isSqueezeToday,
    trendResult.label,
    trendResult.reasons,
    trendBaselineScore(trendResult.trend)
  );

  return {
    date: bar.date,
    close: bar.close,
    bands: { upper, middle, lower, bandwidth, percentB },
    ma20Slope: series.ma20Slope[targetIndex],
    bandwidthDirection: series.bandwidthDirection[targetIndex],
    isSqueeze: isSqueezeToday,
    trend: trendResult.trend,
    trendLabel: trendResult.label,
    signal: combined.signal,
    signalLabel: SIGNAL_LABELS[combined.signal],
    score: combined.score,
    reasons: combined.reasons,
  };
}

/** 分析整段歷史（依日期由舊到新排序的 bars），回傳每個交易日的完整分析結果 */
export function analyzeBollingerBands(
  bars: OhlcvBar[],
  config: Partial<BollingerAnalysisConfig> = {}
): BollingerDayResult[] {
  const fullConfig: BollingerAnalysisConfig = { ...DEFAULT_BOLLINGER_CONFIG, ...config };
  const series = computeBollingerSeries(bars, fullConfig);
  return bars.map((_, i) => analyzeBollingerDay(bars, series, i, fullConfig));
}

/** 便利函式：只回傳最新一天的分析結果，不用像 analyzeBollingerBands 一樣算完整段歷史 */
export function analyzeLatestBollingerDay(
  bars: OhlcvBar[],
  config: Partial<BollingerAnalysisConfig> = {}
): BollingerDayResult {
  const fullConfig: BollingerAnalysisConfig = { ...DEFAULT_BOLLINGER_CONFIG, ...config };
  const series = computeBollingerSeries(bars, fullConfig);
  return analyzeBollingerDay(bars, series, bars.length - 1, fullConfig);
}

export { computeBollingerSeries } from "./series";
export type { BollingerSeries } from "./series";
