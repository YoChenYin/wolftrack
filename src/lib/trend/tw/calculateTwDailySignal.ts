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
import { computeChipFlowIndicators, classifyChipFlow } from "./classifyChipFlow";
import { adjustPrice, type CorporateAction } from "./adjustPrice";
import { isLimitMoveDay } from "./limitMove";
import { calculateChipScore, type InstitutionalDay } from "./chipScore";
import { calculateChipConcentration } from "./chipConcentration";
import { combineCoreScoreTw } from "./coreScoreTw";
import type { TwDailySignal } from "./types";

function diffOrNull(a: number | null, b: number | null): number | null {
  return a !== null && b !== null ? a - b : null;
}

/**
 * 計算台股某一天的 Core Score（技術面+籌碼面）與籌碼流三段分類（含漲跌停特殊狀態）。
 *
 * 2026-07-23改版：分類邏輯從美股共用的 classify.ts 三段式（reversal/pullback/bullish）換成
 * 台股專用的籌碼流策略（entry/exit/buyDip，見 classifyChipFlow.ts），已用真實 production
 * 投信/外資資料回測驗證過。technicalScore/coreScore/chipScore 這些既有的分數欄位不受影響，
 * 只有 status（分類結果）跟 reversalPointDate/priceAtSignal（現在代表「這個狀態連續成立的
 * 起點」，不是MA交叉錨點）的計算方式改變。舊版的 chipBadge（籌碼確認/背離徽章）跟
 * chipLeading（技術面未觸發但籌碼加速的觀察名單）概念在新版裡不再有意義——籌碼流已經是
 * 主要訊號來源，不是疊加在技術面分類之上的次要訊號，兩者都停止產生新資料（欄位保留、
 * 舊資料還能顯示，避免另外跑一次migration）。
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
    series.ma200[targetIndex],
    series.ma5[targetIndex],
    series.ma10[targetIndex]
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

  const chipFlowIndicators = computeChipFlowIndicators(bars);
  const classification = classifyChipFlow(bars, chipFlowIndicators, targetIndex, institutionalDays, isLimitMove);

  const { chipScore, subScores: chipSubScores } = calculateChipScore(institutionalDays);
  const { concentration5, concentration10, concentration20, momentum } = calculateChipConcentration(institutionalDays);
  const coreScore = isLimitMove ? technicalScore : combineCoreScoreTw(technicalScore, chipScore);

  const status = isLimitMove ? "limitMove" : classification.status;

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
    status,
    reversalPointDate: classification.signalPointDate,
    priceAtSignal: classification.priceAtSignal,
    isLimitMove,
    chipConcentration5: concentration5,
    chipConcentration10: concentration10,
    chipConcentration20: concentration20,
    chipMomentum: momentum,
    chipBadge: null,
  };
}
