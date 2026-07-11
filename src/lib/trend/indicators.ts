import type { OhlcvBar } from "./types";

/** 簡單移動平均，回傳與輸入等長的陣列，暖身期未滿回傳 null */
export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** 指數移動平均，seed 為前 period 筆的 SMA */
export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;

  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;

  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI */
export function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1];
    avgGain += Math.max(delta, 0);
    avgLoss += Math.max(-delta, 0);
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = rsiFromAvg(avgGain, avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = rsiFromAvg(avgGain, avgLoss);
  }
  return out;
}

function rsiFromAvg(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** MACD 柱狀圖 (histogram) = MACD line - signal line */
export function macdHistogram(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): (number | null)[] {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine: (number | null)[] = closes.map((_, i) => {
    const f = emaFast[i];
    const s = emaSlow[i];
    return f !== null && s !== null ? f - s : null;
  });

  const denseIdx: number[] = [];
  const denseVals: number[] = [];
  macdLine.forEach((v, i) => {
    if (v !== null) {
      denseIdx.push(i);
      denseVals.push(v);
    }
  });
  const signalDense = ema(denseVals, signalPeriod);
  const signalLine: (number | null)[] = new Array(closes.length).fill(null);
  denseIdx.forEach((origIdx, k) => {
    signalLine[origIdx] = signalDense[k];
  });

  return macdLine.map((v, i) => {
    const s = signalLine[i];
    return v !== null && s !== null ? v - s : null;
  });
}

/** Wilder's ADX（趨勢強度，與方向無關） */
export function adx(bars: OhlcvBar[], period = 14): (number | null)[] {
  const n = bars.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n <= period * 2) return out;

  const tr: number[] = new Array(n).fill(0);
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);

  for (let i = 1; i < n; i++) {
    const { high, low } = bars[i];
    const prevHigh = bars[i - 1].high;
    const prevLow = bars[i - 1].low;
    const prevClose = bars[i - 1].close;

    tr[i] = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));

    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
  }

  let smoothTr = 0;
  let smoothPlusDM = 0;
  let smoothMinusDM = 0;
  for (let i = 1; i <= period; i++) {
    smoothTr += tr[i];
    smoothPlusDM += plusDM[i];
    smoothMinusDM += minusDM[i];
  }

  const dx: (number | null)[] = new Array(n).fill(null);
  const plusDI: number[] = new Array(n).fill(0);
  const minusDI: number[] = new Array(n).fill(0);

  plusDI[period] = smoothTr === 0 ? 0 : (100 * smoothPlusDM) / smoothTr;
  minusDI[period] = smoothTr === 0 ? 0 : (100 * smoothMinusDM) / smoothTr;
  dx[period] =
    plusDI[period] + minusDI[period] === 0
      ? 0
      : (100 * Math.abs(plusDI[period] - minusDI[period])) / (plusDI[period] + minusDI[period]);

  for (let i = period + 1; i < n; i++) {
    smoothTr = smoothTr - smoothTr / period + tr[i];
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];

    plusDI[i] = smoothTr === 0 ? 0 : (100 * smoothPlusDM) / smoothTr;
    minusDI[i] = smoothTr === 0 ? 0 : (100 * smoothMinusDM) / smoothTr;
    const diSum = plusDI[i] + minusDI[i];
    dx[i] = diSum === 0 ? 0 : (100 * Math.abs(plusDI[i] - minusDI[i])) / diSum;
  }

  // ADX 第一筆 = 前 period 筆 DX 的簡單平均，之後用 Wilder 平滑
  let adxSum = 0;
  let count = 0;
  let firstAdxIndex = -1;
  for (let i = period; i < n; i++) {
    if (dx[i] === null) continue;
    adxSum += dx[i] as number;
    count++;
    if (count === period) {
      firstAdxIndex = i;
      out[i] = adxSum / period;
      break;
    }
  }
  if (firstAdxIndex === -1) return out;

  let prevAdx = out[firstAdxIndex] as number;
  for (let i = firstAdxIndex + 1; i < n; i++) {
    const d = dx[i];
    if (d === null) continue;
    prevAdx = (prevAdx * (period - 1) + d) / period;
    out[i] = prevAdx;
  }
  return out;
}

/** 變動率 ROC(period) = (close[i]-close[i-period]) / close[i-period] * 100 */
export function roc(closes: number[], period: number): (number | null)[] {
  return closes.map((c, i) =>
    i >= period && closes[i - period] !== 0 ? ((c - closes[i - period]) / closes[i - period]) * 100 : null
  );
}

export interface IndicatorSeries {
  ma5: (number | null)[];
  ma10: (number | null)[];
  ma20: (number | null)[];
  ma50: (number | null)[];
  ma200: (number | null)[];
  rsi14: (number | null)[];
  adx14: (number | null)[];
  macdHist: (number | null)[];
  avgVolume5: (number | null)[];
  avgVolume20: (number | null)[];
  roc20: (number | null)[];
  roc60: (number | null)[];
}

export function computeIndicatorSeries(bars: OhlcvBar[]): IndicatorSeries {
  const closes = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume);
  return {
    ma5: sma(closes, 5),
    ma10: sma(closes, 10),
    ma20: sma(closes, 20),
    ma50: sma(closes, 50),
    ma200: sma(closes, 200),
    rsi14: rsi(closes, 14),
    adx14: adx(bars, 14),
    macdHist: macdHistogram(closes),
    avgVolume5: sma(volumes, 5),
    avgVolume20: sma(volumes, 20),
    roc20: roc(closes, 20),
    roc60: roc(closes, 60),
  };
}
