import type { OhlcvBar, TrendStatus } from "./types";
import type { IndicatorSeries } from "./indicators";

/**
 * ⚠️假設：以下門檻值出自 docs/trend-core-implementation-logic.md 第2章，
 * 是常見趨勢跟蹤策略的合理起點，正式上線前務必用歷史資料回測校準。
 * TODO: 待業務端確認。
 *
 * 2026-07-22 全部門檻改成可覆寫的 ClassificationThresholds（見下方），這裡的常數變成
 * DEFAULT_THRESHOLDS 的來源、也是目前 production 實際在用的值——scripts/backtest.ts
 * 用這組介面跑多套參數比較，classifyTrend 呼叫端沒傳 thresholds 時行為完全不變。
 */
export interface ClassificationThresholds {
  reversalLookbackDays: number;
  volumeSpikeLookbackDays: number;
  volumeSpikeMultiplier: number;
  /** 反轉雷達額外的ADX下限，2026-07-22新增，預設0代表不檢查（維持原本行為） */
  reversalMinAdx: number;
  pullbackMinDrawdownPct: number;
  pullbackMaxDrawdownPct: number;
  supportBandPct: number;
  rsiCoolLookbackDays: number;
  /** RSI從超買區(>rsiOverboughtThreshold)冷卻後，要落在[rsiCoolMin, rsiCoolMax]區間 */
  rsiCoolMin: number;
  rsiCoolMax: number;
  rsiOverboughtThreshold: number;
  bullishMaxDrawdownPct: number;
  bullishNewHighWindowDays: number;
  bullishNewHighLookbackDays: number;
  bullishMinNewHighCount: number;
  slopeLookbackDays: number;
  /** "近期高點" 的回看天數，spec 未明確定義，⚠️假設用 60 個交易日（約一季） */
  recentHighLookbackDays: number;
  adxTrendThreshold: number;
}

export const DEFAULT_THRESHOLDS: ClassificationThresholds = {
  reversalLookbackDays: 5,
  volumeSpikeLookbackDays: 3,
  volumeSpikeMultiplier: 1.5,
  reversalMinAdx: 0,
  pullbackMinDrawdownPct: 5,
  pullbackMaxDrawdownPct: 15,
  supportBandPct: 2,
  rsiCoolLookbackDays: 20,
  rsiCoolMin: 40,
  rsiCoolMax: 55,
  rsiOverboughtThreshold: 70,
  bullishMaxDrawdownPct: 5,
  bullishNewHighWindowDays: 20,
  bullishNewHighLookbackDays: 20,
  bullishMinNewHighCount: 2,
  slopeLookbackDays: 5,
  recentHighLookbackDays: 60,
  adxTrendThreshold: 25,
};

function crossSign(a: number, b: number): 1 | -1 | 0 {
  if (a > b) return 1;
  if (a < b) return -1;
  return 0;
}

/** 往回找最近一次 MA20/MA50 黃金或死亡交叉發生的 index（"反轉點"錨點） */
export function findMostRecentCrossIndex(
  ma20: (number | null)[],
  ma50: (number | null)[],
  uptoIndex: number
): number | null {
  for (let i = uptoIndex; i > 0; i--) {
    const a = ma20[i];
    const b = ma50[i];
    const pa = ma20[i - 1];
    const pb = ma50[i - 1];
    if (a === null || b === null || pa === null || pb === null) continue;
    const curSign = crossSign(a, b);
    const prevSign = crossSign(pa, pb);
    if (curSign !== 0 && prevSign !== 0 && curSign !== prevSign) return i;
  }
  return null;
}

function signOf(v: number): 1 | -1 | 0 {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

function hasSignFlipWithinWindow(series: (number | null)[], targetIndex: number, windowDays: number): boolean {
  const start = Math.max(1, targetIndex - windowDays + 1);
  for (let i = targetIndex; i >= start; i--) {
    const cur = series[i];
    const prev = series[i - 1];
    if (cur === null || prev === null) continue;
    if (signOf(cur) !== 0 && signOf(prev) !== 0 && signOf(cur) !== signOf(prev)) return true;
  }
  return false;
}

function hasVolumeSpikeWithinWindow(
  bars: OhlcvBar[],
  avgVolume20: (number | null)[],
  targetIndex: number,
  windowDays: number,
  multiplier: number
): boolean {
  const start = Math.max(0, targetIndex - windowDays + 1);
  for (let i = targetIndex; i >= start; i--) {
    const avg = avgVolume20[i];
    if (avg === null || avg === 0) continue;
    if (bars[i].volume > avg * multiplier) return true;
  }
  return false;
}

function recentHigh(bars: OhlcvBar[], targetIndex: number, lookback: number): number {
  const start = Math.max(0, targetIndex - lookback + 1);
  let high = -Infinity;
  for (let i = start; i <= targetIndex; i++) high = Math.max(high, bars[i].high);
  return high;
}

function rsiCooledFromOverbought(
  rsiSeries: (number | null)[],
  targetIndex: number,
  lookback: number,
  coolMin: number,
  coolMax: number,
  overboughtThreshold: number
): boolean {
  const cur = rsiSeries[targetIndex];
  if (cur === null || cur < coolMin || cur > coolMax) return false;
  const start = Math.max(0, targetIndex - lookback);
  for (let i = start; i < targetIndex; i++) {
    const v = rsiSeries[i];
    if (v !== null && v > overboughtThreshold) return true;
  }
  return false;
}

function isRisingSlope(series: (number | null)[], targetIndex: number, lookback: number): boolean {
  const cur = series[targetIndex];
  const prev = series[targetIndex - lookback];
  if (cur === null || prev === null) return false;
  return cur > prev;
}

/** "新高" ⚠️假設：當日高點 > 前 lookback 日內所有高點 */
function isNewHigh(bars: OhlcvBar[], index: number, lookback: number): boolean {
  const start = Math.max(0, index - lookback);
  for (let i = start; i < index; i++) {
    if (bars[i].high >= bars[index].high) return false;
  }
  return true;
}

function newHighCount(bars: OhlcvBar[], targetIndex: number, windowDays: number, lookback: number): number {
  const start = Math.max(0, targetIndex - windowDays + 1);
  let count = 0;
  for (let i = start; i <= targetIndex; i++) {
    if (isNewHigh(bars, i, lookback)) count++;
  }
  return count;
}

export interface ClassificationInput {
  bars: OhlcvBar[];
  series: IndicatorSeries;
  targetIndex: number;
  /**
   * 台股版專用：當日是否觸及漲跌停(±10%)。由呼叫端另外判斷後傳入（美股沒有漲跌幅限制，
   * 呼叫端永遠不傳或傳 false），true 時直接短路回傳 "limitMove"，不跑三段式邏輯，
   * 避免漲跌停當天失真的量能/動能指標造成誤判。
   */
  isLimitMove?: boolean;
  /**
   * 全部門檻皆可覆寫，不傳的欄位吃 DEFAULT_THRESHOLDS（= production 目前實際在用的值）。
   * calculateTwDailySignal.ts 用這個機制覆寫 pullbackMaxDrawdownPct（2026-07-11 回測校準
   * 過的台股專用值），scripts/backtest.ts 用這個機制跑多套參數比較。
   */
  thresholds?: Partial<ClassificationThresholds>;
}

export interface ClassificationResult {
  status: TrendStatus;
  reversalPointDate: string | null;
  priceAtSignal: number | null;
}

/**
 * 三段式分類，判斷順序：反轉 → 蓄勢待發 → 趨勢穩健（互斥，符合前者就不再檢查後者）。
 * 邏輯對應 docs/trend-core-implementation-logic.md 第2章。
 */
export function classifyTrend({
  bars,
  series,
  targetIndex,
  isLimitMove,
  thresholds: thresholdOverrides,
}: ClassificationInput): ClassificationResult {
  if (isLimitMove) {
    return { status: "limitMove", reversalPointDate: null, priceAtSignal: null };
  }

  const t: ClassificationThresholds = { ...DEFAULT_THRESHOLDS, ...thresholdOverrides };

  const anchorIndex = findMostRecentCrossIndex(series.ma20, series.ma50, targetIndex);
  const reversalPointDate = anchorIndex !== null ? bars[anchorIndex].date : null;
  const priceAtSignal = anchorIndex !== null ? bars[anchorIndex].close : null;

  const close = bars[targetIndex].close;
  const ma20 = series.ma20[targetIndex];
  const ma50 = series.ma50[targetIndex];
  const ma200 = series.ma200[targetIndex];
  const adx14 = series.adx14[targetIndex];

  const high = recentHigh(bars, targetIndex, t.recentHighLookbackDays);
  const drawdownPct = high > 0 ? ((high - close) / high) * 100 : 0;

  // 2.1 反轉雷達
  const crossedWithinWindow = anchorIndex !== null && anchorIndex >= targetIndex - t.reversalLookbackDays + 1;
  const macdFlippedWithinWindow = hasSignFlipWithinWindow(series.macdHist, targetIndex, t.reversalLookbackDays);
  const volumeSpike = hasVolumeSpikeWithinWindow(
    bars,
    series.avgVolume20,
    targetIndex,
    t.volumeSpikeLookbackDays,
    t.volumeSpikeMultiplier
  );
  const reversalAdxOk = t.reversalMinAdx <= 0 || (adx14 !== null && adx14 >= t.reversalMinAdx);
  if (crossedWithinWindow && macdFlippedWithinWindow && volumeSpike && reversalAdxOk) {
    return { status: "reversal", reversalPointDate, priceAtSignal };
  }

  const bullishStack = ma20 !== null && ma50 !== null && ma200 !== null && ma20 > ma50 && ma50 > ma200;

  // 2.2 蓄勢待發
  const pullbackRange = drawdownPct >= t.pullbackMinDrawdownPct && drawdownPct <= t.pullbackMaxDrawdownPct;
  const nearSupport =
    (ma20 !== null && Math.abs((close - ma20) / ma20) * 100 <= t.supportBandPct) ||
    (ma50 !== null && Math.abs((close - ma50) / ma50) * 100 <= t.supportBandPct);
  const rsiCooled = rsiCooledFromOverbought(
    series.rsi14,
    targetIndex,
    t.rsiCoolLookbackDays,
    t.rsiCoolMin,
    t.rsiCoolMax,
    t.rsiOverboughtThreshold
  );
  if (bullishStack && pullbackRange && nearSupport && rsiCooled) {
    return { status: "pullback", reversalPointDate, priceAtSignal };
  }

  // 2.3 趨勢穩健
  const slopesRising =
    isRisingSlope(series.ma20, targetIndex, t.slopeLookbackDays) &&
    isRisingSlope(series.ma50, targetIndex, t.slopeLookbackDays) &&
    isRisingSlope(series.ma200, targetIndex, t.slopeLookbackDays);
  const adxStrongAndRising =
    adx14 !== null && adx14 > t.adxTrendThreshold && isRisingSlope(series.adx14, targetIndex, t.slopeLookbackDays);
  const newHighs =
    newHighCount(bars, targetIndex, t.bullishNewHighWindowDays, t.bullishNewHighLookbackDays) >=
    t.bullishMinNewHighCount;
  const noSignificantDrawdown = drawdownPct < t.bullishMaxDrawdownPct;
  if (bullishStack && slopesRising && adxStrongAndRising && newHighs && noSignificantDrawdown) {
    return { status: "bullish", reversalPointDate, priceAtSignal };
  }

  // TODO: 待業務端確認 —— spec 沒有定義三種條件都不符合時的預設分類。
  // 目前設計：回傳 "none"，代表當日不歸類進任何戰術面板欄位（呼叫端不應寫入 daily_trend_signals）。
  return { status: "none", reversalPointDate, priceAtSignal };
}
