import type { OhlcvBar } from "../types";
import type { BollingerAnalysisConfig, BollingerTrend } from "./types";
import type { BollingerSeries } from "./series";

/** 近 windowDays 天內，收盤價創「windowDays 天新高」的次數（Strong Bullish 用：判斷是否持續創高） */
function closingNewHighCount(bars: OhlcvBar[], targetIndex: number, windowDays: number): number {
  const start = Math.max(0, targetIndex - windowDays + 1);
  let count = 0;
  for (let i = start; i <= targetIndex; i++) {
    let isHigh = true;
    for (let j = Math.max(0, i - windowDays); j < i; j++) {
      if (bars[j].close >= bars[i].close) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) count++;
  }
  return count;
}

export interface TrendClassification {
  trend: BollingerTrend;
  label: string;
  reasons: string[];
}

/**
 * 五段趨勢分類（需求文件「五、趨勢判斷」），互斥、依序判斷：
 * Strong Bullish → Bullish → Bearish → Range-bound → Neutral（都不符合時的預設值，
 * 需求文件沒有明確定義這個 fallback，⚠️假設：用在暖身期或多空/寬窄條件都對不齊的過渡日）。
 */
export function classifyBollingerTrend(
  bars: OhlcvBar[],
  series: BollingerSeries,
  targetIndex: number,
  config: BollingerAnalysisConfig
): TrendClassification {
  const close = bars[targetIndex].close;
  const middle = series.bb.middle[targetIndex];
  const maSlope = series.ma20Slope[targetIndex];
  const upperSlope = series.upperSlope[targetIndex];
  const lowerSlope = series.lowerSlope[targetIndex];
  const percentB = series.bb.percentB[targetIndex];

  if (middle === null || maSlope === null || upperSlope === null || lowerSlope === null) {
    return { trend: "neutral", label: "Neutral", reasons: ["Not enough history yet for a full Bollinger read"] };
  }

  const isBullishBase = maSlope === "up" && upperSlope === "up" && lowerSlope === "up" && close > middle;
  if (isBullishBase) {
    const nearUpperBand = percentB !== null && percentB >= config.strongBullishPercentBThreshold;
    const makingNewHighs =
      closingNewHighCount(bars, targetIndex, config.newHighWindowDays) >= config.strongBullishMinNewHighCount;
    if (nearUpperBand && makingNewHighs) {
      return {
        trend: "strongBullish",
        label: "Strong Bullish — Do Not Sell Solely Because Price Touches Upper Band",
        reasons: [
          "Price riding near the Upper Band",
          "MA20 and Upper Band both rising",
          "Price continues making new highs",
        ],
      };
    }
    return {
      trend: "bullish",
      label: "Bullish",
      reasons: ["MA20 slope is rising", "Upper Band and Lower Band both rising", "Price above MA20"],
    };
  }

  const isBearishBase = maSlope === "down" && upperSlope === "down" && lowerSlope === "down" && close < middle;
  if (isBearishBase) {
    return {
      trend: "bearish",
      label: "Bearish",
      reasons: ["MA20 slope is falling", "Upper Band and Lower Band both falling", "Price below MA20"],
    };
  }

  const bandwidthRank = series.bandwidthPercentileRank[targetIndex];
  const isNarrowBand = bandwidthRank !== null && bandwidthRank <= config.rangeBoundBandwidthPercentile;
  if (maSlope === "flat" && isNarrowBand) {
    return {
      trend: "rangeBound",
      label: "Range-bound",
      reasons: [
        "MA20 slope is roughly flat",
        "Band Width contracted relative to recent history",
        "Price oscillating between Upper Band and Lower Band",
      ],
    };
  }

  return {
    trend: "neutral",
    label: "Neutral",
    reasons: ["Bands and MA20 are not aligned into a clear directional trend"],
  };
}
