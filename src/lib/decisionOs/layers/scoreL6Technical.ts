import type { OhlcvBar } from "@/lib/trend/types";
import { sma, rsi, macdHistogram, adxWithDI, atr, bollingerBands } from "@/lib/trend/indicators";
import type { IndicatorScore, IndicatorScoreValue, LayerScore } from "../types";

function clampScore(n: number): IndicatorScoreValue {
  return Math.max(-2, Math.min(2, n)) as IndicatorScoreValue;
}
function toStars(score: IndicatorScoreValue): 1 | 2 | 3 | 4 | 5 {
  return (score + 3) as 1 | 2 | 3 | 4 | 5;
}
function build(key: string, label: string, score: IndicatorScoreValue, value: number | null, detail: string): IndicatorScore {
  return { key, label, score, stars: toStars(score), value, detail };
}

function scoreMA(label: string, close: number, ma: number | null, maPrev: number | null): IndicatorScore | null {
  if (ma === null || maPrev === null) return null;
  const above = close >= ma;
  const rising = ma >= maPrev;
  const score: IndicatorScoreValue = above && rising ? 2 : above ? 1 : !above && !rising ? -2 : -1;
  const detail = `收盤${close.toFixed(0)} ${above ? "站上" : "跌破"}${label}(${ma.toFixed(0)})，${label}${rising ? "上揚" : "下彎"}`;
  return build(label.toLowerCase(), label, score, ma, detail);
}

function scoreVolume(volume: number, avgVolume20: number | null, priceUp: boolean): IndicatorScore | null {
  if (avgVolume20 === null || avgVolume20 === 0) return null;
  const ratio = (volume / avgVolume20) * 100;
  let score: IndicatorScoreValue;
  if (ratio > 130 && priceUp) score = 2;
  else if (ratio >= 110) score = 1;
  else if (ratio >= 90) score = 0;
  else if (ratio >= 70) score = -1;
  else score = -2;
  return build("volume", "成交量", score, ratio, `量能為20日均量的${ratio.toFixed(0)}%`);
}

function scoreMacd(hist: number | null, histPrev: number | null): IndicatorScore | null {
  if (hist === null || histPrev === null) return null;
  const golden = hist > 0;
  const expanding = Math.abs(hist) >= Math.abs(histPrev);
  const score: IndicatorScoreValue = golden && expanding ? 2 : golden ? 1 : !golden && expanding ? -2 : -1;
  return build("macd", "MACD", score, hist, `柱狀圖${hist.toFixed(1)}，${golden ? "金叉" : "死叉"}${expanding ? "擴大" : "收斂"}`);
}

function scoreRsi(value: number | null, adxValue: number | null, plusDI: number | null, minusDI: number | null): IndicatorScore | null {
  if (value === null) return null;
  const trending = adxValue !== null && adxValue > 25;
  const uptrend = plusDI !== null && minusDI !== null && plusDI > minusDI;
  let score: IndicatorScoreValue;
  let detail: string;
  if (value < 30) {
    score = -2;
    detail = `RSI ${value.toFixed(0)}，超賣`;
  } else if (value < 40) {
    score = -1;
    detail = `RSI ${value.toFixed(0)}，偏弱`;
  } else if (value <= 60) {
    score = 0;
    detail = `RSI ${value.toFixed(0)}，中性`;
  } else if (value <= 70) {
    score = 1;
    detail = `RSI ${value.toFixed(0)}，溫和偏多`;
  } else {
    score = trending && uptrend ? 1 : -1;
    detail = `RSI ${value.toFixed(0)} 超買，${trending && uptrend ? "但ADX顯示趨勢仍強，非反轉訊號" : "且趨勢強度不足，拉回風險上升"}`;
  }
  return build("rsi", "RSI(14)", score, value, detail);
}

function scoreAdx(adxValue: number | null, plusDI: number | null, minusDI: number | null): IndicatorScore | null {
  if (adxValue === null || plusDI === null || minusDI === null) return null;
  const bullish = plusDI > minusDI;
  let score: IndicatorScoreValue;
  if (adxValue < 20) score = 0;
  else if (adxValue < 25) score = bullish ? 1 : -1;
  else score = bullish ? 2 : -2;
  const regime = adxValue < 20 ? "盤整（趨勢強度不足）" : `${bullish ? "多頭" : "空頭"}趨勢`;
  return build("adx", "ADX(14)", score, adxValue, `ADX ${adxValue.toFixed(0)}，${regime}`);
}

function scoreBollinger(percentB: number | null, bandwidth: number | null, bandwidthAvg: number | null): IndicatorScore | null {
  if (percentB === null) return null;
  const expanding = bandwidth !== null && bandwidthAvg !== null && bandwidth > bandwidthAvg;
  let score: IndicatorScoreValue;
  if (percentB >= 1) score = expanding ? 2 : 1;
  else if (percentB >= 0.5) score = 1;
  else if (percentB > 0) score = -1;
  else score = expanding ? -2 : -1;
  if (Math.abs(percentB - 0.5) < 0.05) score = 0;
  const squeeze = bandwidth !== null && bandwidthAvg !== null && bandwidth < bandwidthAvg * 0.5;
  const detail = `%b=${percentB.toFixed(2)}${squeeze ? "，帶寬過窄（盤整警示）" : ""}`;
  return build("bollinger", "布林通道", score, percentB, detail);
}

export interface TechnicalRegimeInfo {
  atr14: number | null;
  atrRatio: number | null; // ATR / 20日均ATR
  bandwidthSqueeze: boolean;
}

export interface L6Result {
  layer: LayerScore;
  regime: TechnicalRegimeInfo;
}

/**
 * L6 技術分析評分。輸入台指期或TAIEX現貨日K（依資料是否足夠由呼叫端決定，見 PRD 第15節：
 * tw_futures_daily 歷史還在累積中，MVP 階段先用 TAIEX 現貨算技術指標）。
 * VWAP 需要盤中逐筆資料，本專案沒有這條資料管線，MVP 不計入（不假裝有資料）。
 * ATR／布林帶寬不是方向性分數，只回傳給 Gate／Risk 引擎判斷波動度與盤整格局用。
 */
export function scoreL6Technical(bars: OhlcvBar[]): L6Result {
  const closes = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume);
  const n = bars.length;
  const last = n - 1;

  const ma20 = sma(closes, 20);
  const ma60 = sma(closes, 60);
  const ma200 = sma(closes, 200);
  const avgVolume20 = sma(volumes, 20);
  const rsi14 = rsi(closes, 14);
  const macdHist = macdHistogram(closes);
  const { adx: adx14, plusDI, minusDI } = adxWithDI(bars, 14);
  const atr14Series = atr(bars, 14);
  const atrAvg20 = sma(
    atr14Series.map((v) => v ?? 0),
    20
  );
  const bb = bollingerBands(closes, 20, 2);
  const bandwidthAvg20 = sma(
    bb.bandwidth.map((v) => v ?? 0),
    20
  );

  const priceUp = n >= 2 ? closes[last] >= closes[last - 1] : false;

  const indicators = [
    scoreVolume(volumes[last], avgVolume20[last], priceUp),
    scoreMA("20MA", closes[last], ma20[last], ma20[last - 1] ?? null),
    scoreMA("60MA", closes[last], ma60[last], ma60[last - 1] ?? null),
    scoreMA("200MA", closes[last], ma200[last], ma200[last - 1] ?? null),
    scoreMacd(macdHist[last], macdHist[last - 1] ?? null),
    scoreRsi(rsi14[last], adx14[last], plusDI[last], minusDI[last]),
    scoreAdx(adx14[last], plusDI[last], minusDI[last]),
    scoreBollinger(bb.percentB[last], bb.bandwidth[last], bandwidthAvg20[last]),
  ].filter((s): s is IndicatorScore => s !== null);

  const score = indicators.length > 0 ? indicators.reduce((sum, s) => sum + s.score, 0) / indicators.length : null;

  const atrRatio = atr14Series[last] !== null && atrAvg20[last] ? atr14Series[last]! / atrAvg20[last]! : null;
  const bandwidthSqueeze =
    bb.bandwidth[last] !== null && bandwidthAvg20[last] !== null && bb.bandwidth[last]! < bandwidthAvg20[last]! * 0.5;

  return {
    layer: { layer: "L6", label: "技術分析", score, indicators },
    regime: { atr14: atr14Series[last], atrRatio, bandwidthSqueeze },
  };
}
