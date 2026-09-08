import type { OhlcvBar } from "../types";
import { bollingerBands, sma, type BollingerBands } from "../indicators";
import type { BollingerAnalysisConfig, SlopeDirection } from "./types";

/**
 * 判斷某序列在 index 這天，相對於 lookback 天前的方向：漲/跌/走平。
 * 走平的定義是「變化幅度小於 flatThresholdPct」，避免雜訊被誤判成明確的漲或跌趨勢。
 */
export function computeSlopeDirection(
  series: (number | null)[],
  index: number,
  lookback: number,
  flatThresholdPct: number
): SlopeDirection | null {
  if (index - lookback < 0) return null;
  const cur = series[index];
  const prev = series[index - lookback];
  if (cur === null || prev === null || prev === 0) return null;
  const changePct = ((cur - prev) / Math.abs(prev)) * 100;
  if (changePct > flatThresholdPct) return "up";
  if (changePct < -flatThresholdPct) return "down";
  return "flat";
}

/**
 * Band Width 在近 window 天內的百分位排名（0~100，數字越小代表越窄）。
 * 用來判斷 Squeeze：跟「只跟固定天數前比較」不同，percentile 對極端值比較不敏感。
 * 資料不足 20 筆時回傳 null（樣本太少，percentile 沒有意義）。
 */
export function computeBandwidthPercentileRank(
  bandwidth: (number | null)[],
  index: number,
  window: number
): number | null {
  const cur = bandwidth[index];
  if (cur === null) return null;
  const start = Math.max(0, index - window + 1);
  const values: number[] = [];
  for (let i = start; i <= index; i++) {
    const v = bandwidth[i];
    if (v !== null) values.push(v);
  }
  if (values.length < Math.min(window, 20)) return null;
  const countAtOrBelow = values.filter((v) => v <= cur).length;
  return (countAtOrBelow / values.length) * 100;
}

export interface BollingerSeries {
  bb: BollingerBands;
  ma20Slope: (SlopeDirection | null)[];
  upperSlope: (SlopeDirection | null)[];
  lowerSlope: (SlopeDirection | null)[];
  bandwidthDirection: (SlopeDirection | null)[];
  bandwidthPercentileRank: (number | null)[];
  avgVolume: (number | null)[];
}

/** 一次算好整條歷史的布林通道 + 斜率 + Band Width percentile + 均量，讓每天的訊號判斷都只是查表 */
export function computeBollingerSeries(bars: OhlcvBar[], config: BollingerAnalysisConfig): BollingerSeries {
  const closes = bars.map((b) => b.close);
  const bb = bollingerBands(closes, config.period, config.stdDevMultiplier);

  const ma20Slope = bb.middle.map((_, i) =>
    computeSlopeDirection(bb.middle, i, config.slopeLookbackDays, config.slopeFlatThresholdPct)
  );
  const upperSlope = bb.upper.map((_, i) =>
    computeSlopeDirection(bb.upper, i, config.slopeLookbackDays, config.slopeFlatThresholdPct)
  );
  const lowerSlope = bb.lower.map((_, i) =>
    computeSlopeDirection(bb.lower, i, config.slopeLookbackDays, config.slopeFlatThresholdPct)
  );
  const bandwidthDirection = bb.bandwidth.map((_, i) =>
    computeSlopeDirection(bb.bandwidth, i, config.slopeLookbackDays, config.slopeFlatThresholdPct)
  );
  const bandwidthPercentileRank = bb.bandwidth.map((_, i) =>
    computeBandwidthPercentileRank(bb.bandwidth, i, config.bandwidthPercentileWindow)
  );
  const avgVolume = sma(
    bars.map((b) => b.volume),
    config.volumeAvgPeriod
  );

  return { bb, ma20Slope, upperSlope, lowerSlope, bandwidthDirection, bandwidthPercentileRank, avgVolume };
}
