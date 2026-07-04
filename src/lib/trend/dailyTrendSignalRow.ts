import type { DailySignal, WritableTrendStatus } from "./types";

/** DailySignal -> Prisma DailyTrendSignal 欄位映射，mock seed 腳本和真實 Polygon 批次腳本共用 */
export function buildDailyTrendSignalRow(signal: DailySignal) {
  return {
    closePrice: signal.closePrice,
    volume: BigInt(Math.round(signal.volume)),
    ma20: signal.indicators.ma20,
    ma50: signal.indicators.ma50,
    ma200: signal.indicators.ma200,
    rsi14: signal.indicators.rsi14,
    adx14: signal.indicators.adx14,
    macdHist: signal.indicators.macdHist,
    avgVolume20d: signal.indicators.avgVolume20d,
    coreScore: signal.coreScore,
    maScore: signal.scores.ma,
    momentumScore: signal.scores.momentum,
    adxScore: signal.scores.adx,
    relStrengthScore: signal.scores.relStrength,
    volumeScore: signal.scores.volume,
    status: signal.status as WritableTrendStatus,
    reversalPointDate: signal.reversalPointDate ? new Date(signal.reversalPointDate) : null,
    priceAtSignal: signal.priceAtSignal,
  };
}
