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
import { classifyTrend, type ClassificationThresholds } from "@/lib/trend/classify";
import { adjustPrice, type CorporateAction } from "./adjustPrice";
import { isLimitMoveDay } from "./limitMove";
import { calculateChipScore, type InstitutionalDay } from "./chipScore";
import { calculateChipConcentration } from "./chipConcentration";
import { combineCoreScoreTw } from "./coreScoreTw";
import type { ChipBadge, TwDailySignal } from "./types";

/**
 * 蓄勢待發回檔幅度上限，2026-07-11 用 scripts/backtest.ts 回測台股資料後從 classify.ts 原本的
 * 15% 收窄到 10%（20日超額報酬中位數從 -0.43% 變成 +1.76%，樣本200筆）。只套用台股，見
 * classify.ts 的 ClassificationInput.pullbackMaxDrawdownPct 說明——美股沒有對應回測證據，
 * 維持原本 15% 不變。
 */
const PULLBACK_MAX_DRAWDOWN_PCT_TW = 10;

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

/**
 * 「籌碼領先」門檻（2026-07-11 用 scripts/backtest.ts 對 263 檔股票、跨2024-06至今的完整歷史
 * 回測校準過，method：用「同天進場、同持有天數的大盤超額報酬」而不是原始報酬判斷，避免誤把
 * 「搭多頭順風車」當成訊號本身有效）：
 * - 原本 chipScore>=60 門檻：965 筆樣本，20日勝率只有48.8%、中位數超額報酬 -0.50%（等於雜訊，比丟銅板還差）
 * - chipScore>=70：192 筆樣本，20日勝率58.9%、中位數超額報酬+2.77%，是目前資料能撐得住的甜蜜點
 * - chipScore>=75 開始衰退（51.9%/+0.06%），>=80 樣本數只剩45筆已經不可信（44.4%/-7.36%，過度篩選）
 * - concentration5 門檻在各級距完全不影響結果（chipScore本身已隱含集中度資訊），維持1%當基本合理性檢查即可，不用跟著拉高
 * TODO: 樣本期間幾乎全是多頭（2024-06起至今台股/半導體大多頭），沒經過空頭/大回檔驗證，之後有更長歷史要重新回測。
 */
const CHIP_LEADING_SCORE_THRESHOLD = 70;
const CHIP_LEADING_CONCENTRATION5_THRESHOLD = 1;

function isChipLeadingCandidate(
  chipScore: number,
  concentration5: number,
  momentum: ReturnType<typeof calculateChipConcentration>["momentum"]
): boolean {
  return (
    momentum === "strengthening" &&
    chipScore >= CHIP_LEADING_SCORE_THRESHOLD &&
    concentration5 >= CHIP_LEADING_CONCENTRATION5_THRESHOLD
  );
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
  benchmarkTargetIndex?: number,
  /** scripts/backtest.ts 用這個跑不同參數組合比較，正式批次不傳，吃預設的 PULLBACK_MAX_DRAWDOWN_PCT_TW */
  thresholdOverrides?: Partial<ClassificationThresholds>
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

  const classification = classifyTrend({
    bars,
    series,
    targetIndex,
    isLimitMove,
    thresholds: { pullbackMaxDrawdownPct: PULLBACK_MAX_DRAWDOWN_PCT_TW, ...thresholdOverrides },
  });
  const { chipScore, subScores: chipSubScores } = calculateChipScore(institutionalDays);
  const { concentration5, concentration10, concentration20, momentum } = calculateChipConcentration(institutionalDays);
  const chipBadge = resolveChipBadge(classification.status, momentum);
  const coreScore = isLimitMove ? technicalScore : combineCoreScoreTw(technicalScore, chipScore);

  const status =
    classification.status === "none" && isChipLeadingCandidate(chipScore, concentration5, momentum)
      ? "chipLeading"
      : classification.status;

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
