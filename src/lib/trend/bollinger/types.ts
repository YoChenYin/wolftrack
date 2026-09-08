import type { OhlcvBar } from "../types";

export type { OhlcvBar };

/** 三態方向：用在 MA20/Upper/Lower Band 斜率、Band Width 變化方向 */
export type SlopeDirection = "up" | "down" | "flat";

/**
 * 布林通道的 7 種市場狀態（對應需求文件「一、目標」的 7 類）：
 * - "buyOversold" / "buyMa20Breakout" = 超跌/潛在買點、反彈確認（Signal A/B）
 * - "sellOverbought" / "sellMa20Breakdown" = 過熱/潛在賣點、趨勢轉弱（Signal C/D）
 * - "strongBullish" / "bearish" / "rangeBound" = 強勢上漲、空頭趨勢、盤整區間（趨勢分類，見 trend.ts）
 * 其餘（squeeze 相關、hold）是這套模組額外需要的中介狀態，不在原始 7 類清單裡，
 * 但沒有這些狀態就無法表達「盤整但還沒選邊」「持有觀望」等常見情境。
 */
export type BollingerSignalType =
  | "buyOversold"
  | "buyMa20Breakout"
  | "sellOverbought"
  | "sellMa20Breakdown"
  | "squeezeBullishBreakout"
  | "squeezeBearishBreakout"
  | "squeezeWatch"
  | "hold";

export type BollingerTrend = "strongBullish" | "bullish" | "bearish" | "rangeBound" | "neutral";

export interface BollingerBandSnapshot {
  upper: number;
  middle: number;
  lower: number;
  /** (upper - lower) / middle */
  bandwidth: number;
  /** 0 = 貼下軌，0.5 = 貼中軌，1 = 貼上軌，可以 <0 或 >1（價格已經在通道外） */
  percentB: number;
}

export interface BollingerDayResult {
  date: string;
  close: number;
  /** 暖身期（資料不足 period 天）尚未有帶狀資料時為 null */
  bands: BollingerBandSnapshot | null;
  ma20Slope: SlopeDirection | null;
  bandwidthDirection: SlopeDirection | null;
  isSqueeze: boolean;
  trend: BollingerTrend;
  trendLabel: string;
  signal: BollingerSignalType;
  signalLabel: string;
  /** -2（強烈賣出）～ +2（強烈買進） */
  score: -2 | -1 | 0 | 1 | 2;
  reasons: string[];
}

/**
 * 所有門檻集中在這裡，全部可覆寫（跟 classify.ts 的 ClassificationThresholds 同一套設計理念）。
 * ⚠️假設：這裡列出的百分比/天數都是這次實作依照需求文件描述合理推導出的起點，不是 backtest
 * 校準過的值，正式上線前建議用歷史資料驗證、調整。
 */
export interface BollingerAnalysisConfig {
  /** Bollinger Bands 期數，預設 20 */
  period: number;
  /** 標準差倍數，預設 2 */
  stdDevMultiplier: number;
  /** 計算 MA20 / Upper / Lower / Band Width 斜率方向時往回比較幾天 */
  slopeLookbackDays: number;
  /** 斜率變化 < 這個百分比（相對於 lookback 起點的值）視為走平，不算漲也不算跌 */
  slopeFlatThresholdPct: number;
  /** 價格與軌道距離在這個百分比以內，視為「接近」軌道（不用真的碰到或跌破） */
  nearBandPct: number;
  /** Signal A（下軌超跌反彈）往回找「觸及下軌 + 止跌K線」序列的視窗天數 */
  oversoldWindowDays: number;
  /** Signal C（上軌過熱反轉）往回找「觸及上軌 + 反轉K線」序列的視窗天數 */
  overboughtWindowDays: number;
  /**
   * Signal B/D（MA20 突破/跌破）往回找「持續站上/站下 MA20 的連續區間」最多容許幾天——
   * 因為 MA20 斜率天生落後於價格穿越的當下，需要給斜率一點時間跟上（見 signals.ts 的說明）。
   */
  ma20CrossWindowDays: number;
  /** 判斷「持續創高」用的收盤新高視窗天數（Strong Bullish 用） */
  newHighWindowDays: number;
  /** Strong Bullish 至少要有幾次收盤新高（視窗內） */
  strongBullishMinNewHighCount: number;
  /** %b 大於這個值視為「貼近上軌」，是 Strong Bullish 的必要條件之一 */
  strongBullishPercentBThreshold: number;
  /** 成交量均線期數，用來判斷 Signal B/D 是否有量能同步確認 */
  volumeAvgPeriod: number;
  /** 當日量 > 均量 * 這個倍數，視為「量能同步放大」 */
  volumeSpikeMultiplier: number;
  /** Band Width percentile 的計算視窗（近多少個交易日） */
  bandwidthPercentileWindow: number;
  /** Band Width percentile <= 這個值（0~100）視為 Squeeze */
  squeezePercentileThreshold: number;
  /** Squeeze 發生後，多少天內的突破仍算「從 Squeeze 出來的突破」 */
  breakoutLookbackDays: number;
  /** Range-bound 判斷用：Band Width percentile <= 這個值視為「較窄」 */
  rangeBoundBandwidthPercentile: number;
}

export const DEFAULT_BOLLINGER_CONFIG: BollingerAnalysisConfig = {
  period: 20,
  stdDevMultiplier: 2,
  slopeLookbackDays: 5,
  slopeFlatThresholdPct: 0.5,
  nearBandPct: 1,
  oversoldWindowDays: 5,
  overboughtWindowDays: 5,
  ma20CrossWindowDays: 10,
  newHighWindowDays: 10,
  strongBullishMinNewHighCount: 2,
  strongBullishPercentBThreshold: 0.8,
  volumeAvgPeriod: 20,
  volumeSpikeMultiplier: 1.2,
  bandwidthPercentileWindow: 120,
  squeezePercentileThreshold: 20,
  breakoutLookbackDays: 10,
  rangeBoundBandwidthPercentile: 35,
};
