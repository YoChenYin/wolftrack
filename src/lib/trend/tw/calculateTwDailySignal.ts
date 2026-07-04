import type { OhlcvBar } from "@/lib/trend/types";
import { computeIndicatorSeries, type IndicatorSeries } from "@/lib/trend/indicators";
import {
  combineCoreScore,
  scoreAdx,
  scoreMaAlignment,
  scoreMomentum,
  scoreRelStrength,
  scoreVolume,
} from "@/lib/trend/coreScore";
import { classifyTrend } from "@/lib/trend/classify";
import { adjustPrice, type CorporateAction } from "./adjustPrice";
import { isLimitMoveDay } from "./limitMove";
import { calculateChipScore, type InstitutionalDay } from "./chipScore";
import { calculateChipConcentration } from "./chipConcentration";
import { combineCoreScoreTw } from "./coreScoreTw";
import type { ChipBadge, TwDailySignal } from "./types";

/**
 * 籌碼確認/背離徽章（docs/wolftrack-tw-spec.md 3.6）：只在技術面判斷「趨勢穩健」時才有意義。
 * ⚠️假設：spec 原文寫「分類降級為蓄勢待發或標記籌碼背離」，用了「或」，語意不夠肯定。
 * 這裡採用較保守的做法：只標記徽章、不改動 status（避免弄亂 reversal_point_date/price_at_signal 的語意）。
 * TODO: 待業務端確認是否要真的把 status 降級。
 */
function resolveChipBadge(status: TwDailySignal["status"], momentum: ReturnType<typeof calculateChipConcentration>["momentum"]): ChipBadge | null {
  if (status !== "bullish") return null;
  if (momentum === "strengthening") return "confirmed";
  if (momentum === "weakening") return "divergence";
  return null;
}

function diffOrNull(a: number | null, b: number | null): number | null {
  return a !== null && b !== null ? a - b : null;
}

/**
 * 計算台股某一天的 Core Score（技術面+籌碼面）與三段分類（含漲跌停特殊狀態）。
 *
 * rawBars：**未還原**的原始日線（漲跌停判斷要用原始價格，見 limitMove.ts 說明）
 * institutionalDays：三大法人買賣超歷史，需涵蓋到 rawBars[targetIndex] 當天（含）往前至少20個交易日，
 *   且日期需與 rawBars 對齊（呼叫端負責保證，這裡不做日期比對）
 * benchmarkSeries/benchmarkTargetIndex：大盤指數（如加權指數）序列，用於相對強度因子，比照美股版用法
 */
export function calculateTwTrendSignalAtIndex(
  rawBars: OhlcvBar[],
  corporateActions: CorporateAction[],
  targetIndex: number,
  institutionalDays: InstitutionalDay[],
  benchmarkSeries?: IndicatorSeries,
  benchmarkTargetIndex?: number
): TwDailySignal {
  const isLimitMove = isLimitMoveDay(rawBars, targetIndex);

  const bars = adjustPrice(rawBars, corporateActions);
  const series = computeIndicatorSeries(bars);
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

  const technicalScore = combineCoreScore({
    ma: maScore,
    momentum: momentumScore,
    adx: adxScore,
    relStrength: relStrengthScore,
    volume: volumeScore,
  });

  const classification = classifyTrend({ bars, series, targetIndex, isLimitMove });
  const { chipScore, subScores: chipSubScores } = calculateChipScore(institutionalDays);
  const { concentration5, concentration10, concentration20, momentum } = calculateChipConcentration(institutionalDays);
  const chipBadge = resolveChipBadge(classification.status, momentum);
  const coreScore = isLimitMove ? technicalScore : combineCoreScoreTw(technicalScore, chipScore);

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
    technicalSubScores: {
      ma: maScore,
      momentum: momentumScore,
      adx: adxScore,
      relStrength: relStrengthScore,
      volume: volumeScore,
    },
    technicalScore,
    chipScore,
    chipSubScores,
    coreScore,
    status: classification.status,
    reversalPointDate: classification.reversalPointDate,
    priceAtSignal: classification.priceAtSignal,
    isLimitMove,
    chipConcentration5: concentration5,
    chipConcentration10: concentration10,
    chipConcentration20: concentration20,
    chipMomentum: momentum,
    chipBadge,
  };
}
