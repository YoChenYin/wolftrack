import type { DailySignal, OhlcvBar } from "./types";
import { computeIndicatorSeries, type IndicatorSeries } from "./indicators";
import {
  combineCoreScore,
  scoreAdx,
  scoreMaAlignment,
  scoreMomentum,
  scoreRelStrength,
  scoreVolume,
} from "./coreScore";
import { classifyTrend } from "./classify";

function diffOrNull(a: number | null, b: number | null): number | null {
  return a !== null && b !== null ? a - b : null;
}

/**
 * 計算某一天（targetIndex）的 Core Score + 三段分類。
 * series 需由 computeIndicatorSeries(bars) 預先算好（讓呼叫端可以對同一檔股票的
 * 多個交易日重複使用同一份 series，避免每天都重新計算整條歷史）。
 * benchmarkSeries/benchmarkTargetIndex 用於「相對強度」因子，需對齊到同一交易日。
 */
export function calculateTrendSignalAtIndex(
  bars: OhlcvBar[],
  series: IndicatorSeries,
  targetIndex: number,
  benchmarkSeries?: IndicatorSeries,
  benchmarkTargetIndex?: number,
  isLimitMove?: boolean
): DailySignal {
  const bar = bars[targetIndex];

  const maScore = scoreMaAlignment(
    bar.close,
    series.ma20[targetIndex],
    series.ma50[targetIndex],
    series.ma200[targetIndex]
  );
  const momentumScore = scoreMomentum(series.rsi14[targetIndex], series.roc20[targetIndex]);
  const adxScore = scoreAdx(series.adx14[targetIndex]);

  let relStrengthScore = 50;
  if (benchmarkSeries && benchmarkTargetIndex !== undefined) {
    const excess20 = diffOrNull(series.roc20[targetIndex], benchmarkSeries.roc20[benchmarkTargetIndex]);
    const excess60 = diffOrNull(series.roc60[targetIndex], benchmarkSeries.roc60[benchmarkTargetIndex]);
    relStrengthScore = scoreRelStrength(excess20, excess60);
  }

  const volumeScore = scoreVolume(series.avgVolume5[targetIndex], series.avgVolume20[targetIndex]);

  const coreScore = combineCoreScore({
    ma: maScore,
    momentum: momentumScore,
    adx: adxScore,
    relStrength: relStrengthScore,
    volume: volumeScore,
  });

  const classification = classifyTrend({ bars, series, targetIndex, isLimitMove });

  return {
    tradeDate: bar.date,
    closePrice: bar.close,
    volume: bar.volume,
    indicators: {
      ma20: series.ma20[targetIndex],
      ma50: series.ma50[targetIndex],
      ma200: series.ma200[targetIndex],
      rsi14: series.rsi14[targetIndex],
      adx14: series.adx14[targetIndex],
      macdHist: series.macdHist[targetIndex],
      avgVolume20d: series.avgVolume20[targetIndex],
    },
    scores: {
      ma: maScore,
      momentum: momentumScore,
      adx: adxScore,
      relStrength: relStrengthScore,
      volume: volumeScore,
    },
    coreScore,
    status: classification.status,
    reversalPointDate: classification.reversalPointDate,
    priceAtSignal: classification.priceAtSignal,
  };
}

/**
 * 便利函式：輸入某檔股票的完整歷史 OHLCV（依日期由舊到新排序），
 * 輸出「最新一天」的 Core Score 與三段分類結果。
 * benchmarkBars（如 SPY）若提供，須與 bars 涵蓋同一段日期範圍（結尾為同一天）才能正確算相對強度。
 */
export function calculateTrendSignal(bars: OhlcvBar[], benchmarkBars?: OhlcvBar[]): DailySignal {
  const series = computeIndicatorSeries(bars);
  const targetIndex = bars.length - 1;

  let benchmarkSeries: IndicatorSeries | undefined;
  let benchmarkTargetIndex: number | undefined;
  if (benchmarkBars && benchmarkBars.length > 0) {
    benchmarkSeries = computeIndicatorSeries(benchmarkBars);
    benchmarkTargetIndex = benchmarkBars.length - 1;
  }

  return calculateTrendSignalAtIndex(bars, series, targetIndex, benchmarkSeries, benchmarkTargetIndex);
}

export type { DailySignal, OhlcvBar } from "./types";
export { computeIndicatorSeries } from "./indicators";
