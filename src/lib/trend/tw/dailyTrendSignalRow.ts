import type { TwDailySignal } from "./types";

/** TwDailySignal -> Prisma DailyTrendSignal 欄位映射，mock seed 腳本和之後的真實資料批次腳本共用 */
export function buildTwDailyTrendSignalRow(signal: TwDailySignal) {
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
    technicalScore: signal.technicalScore,
    chipScore: signal.chipScore,
    maScore: signal.technicalSubScores.ma,
    momentumScore: signal.technicalSubScores.momentum,
    adxScore: signal.technicalSubScores.adx,
    relStrengthScore: signal.technicalSubScores.relStrength,
    volumeScore: signal.technicalSubScores.volume,
    chipConcentration5: signal.chipConcentration5,
    chipConcentration10: signal.chipConcentration10,
    chipConcentration20: signal.chipConcentration20,
    chipMomentum: signal.chipMomentum,
    chipBadge: signal.chipBadge,
    status: signal.status as "entry" | "exit" | "buyDip" | "limitMove",
    reversalPointDate: signal.reversalPointDate ? new Date(signal.reversalPointDate) : null,
    priceAtSignal: signal.priceAtSignal,
  };
}
