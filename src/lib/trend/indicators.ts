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

export interface StochasticKD {
  k: (number | null)[];
  d: (number | null)[];
}

/**
 * KD隨機指標，台股慣用參數與平滑方式：RSV(9) = (close-9日內最低)/(9日內最高-最低)*100，
 * K = 前一日K*2/3 + RSV*1/3，D = 前一日D*2/3 + K*1/3（都是Wilder式平滑，第一筆用RSV自己當種子）。
 * ⚠️假設：平滑係數(2/3, 1/3)是台股最常見的KD慣例，不同看盤軟體可能用略有差異的參數。
 */
export function stochasticKD(bars: OhlcvBar[], rsvPeriod = 9): StochasticKD {
  const n = bars.length;
  const k: (number | null)[] = new Array(n).fill(null);
  const d: (number | null)[] = new Array(n).fill(null);

  let prevK = 50;
  let prevD = 50;
  let seeded = false;

  for (let i = rsvPeriod - 1; i < n; i++) {
    let high = -Infinity;
    let low = Infinity;
    for (let j = i - rsvPeriod + 1; j <= i; j++) {
      high = Math.max(high, bars[j].high);
      low = Math.min(low, bars[j].low);
    }
    const rsv = high === low ? 50 : ((bars[i].close - low) / (high - low)) * 100;

    const curK = seeded ? (prevK * 2 + rsv) / 3 : rsv;
    const curD = seeded ? (prevD * 2 + curK) / 3 : curK;
    k[i] = curK;
    d[i] = curD;
    prevK = curK;
    prevD = curD;
    seeded = true;
  }

  return { k, d };
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

export interface AdxWithDI {
  adx: (number | null)[];
  plusDI: (number | null)[];
  minusDI: (number | null)[];
}

/**
 * 跟 adx() 算法完全相同，差別只是額外把 +DI/-DI 序列一起回傳（新增函式，不動既有 adx()
 * 的回傳型別，避免影響美股/台股既有的 classify.ts / calculateTwDailySignal.ts 呼叫端）。
 * 台指期 Decision OS 的 L6 技術面需要 +DI vs -DI 判斷趨勢方向，光有 ADX 值不夠。
 */
export function adxWithDI(bars: OhlcvBar[], period = 14): AdxWithDI {
  const n = bars.length;
  const adxOut: (number | null)[] = new Array(n).fill(null);
  const plusDIOut: (number | null)[] = new Array(n).fill(null);
  const minusDIOut: (number | null)[] = new Array(n).fill(null);
  if (n <= period * 2) return { adx: adxOut, plusDI: plusDIOut, minusDI: minusDIOut };

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
  plusDIOut[period] = smoothTr === 0 ? 0 : (100 * smoothPlusDM) / smoothTr;
  minusDIOut[period] = smoothTr === 0 ? 0 : (100 * smoothMinusDM) / smoothTr;
  dx[period] =
    (plusDIOut[period] as number) + (minusDIOut[period] as number) === 0
      ? 0
      : (100 * Math.abs((plusDIOut[period] as number) - (minusDIOut[period] as number))) /
        ((plusDIOut[period] as number) + (minusDIOut[period] as number));

  for (let i = period + 1; i < n; i++) {
    smoothTr = smoothTr - smoothTr / period + tr[i];
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];

    plusDIOut[i] = smoothTr === 0 ? 0 : (100 * smoothPlusDM) / smoothTr;
    minusDIOut[i] = smoothTr === 0 ? 0 : (100 * smoothMinusDM) / smoothTr;
    const diSum = (plusDIOut[i] as number) + (minusDIOut[i] as number);
    dx[i] = diSum === 0 ? 0 : (100 * Math.abs((plusDIOut[i] as number) - (minusDIOut[i] as number))) / diSum;
  }

  let adxSum = 0;
  let count = 0;
  let firstAdxIndex = -1;
  for (let i = period; i < n; i++) {
    if (dx[i] === null) continue;
    adxSum += dx[i] as number;
    count++;
    if (count === period) {
      firstAdxIndex = i;
      adxOut[i] = adxSum / period;
      break;
    }
  }
  if (firstAdxIndex === -1) return { adx: adxOut, plusDI: plusDIOut, minusDI: minusDIOut };

  let prevAdx = adxOut[firstAdxIndex] as number;
  for (let i = firstAdxIndex + 1; i < n; i++) {
    const d = dx[i];
    if (d === null) continue;
    prevAdx = (prevAdx * (period - 1) + d) / period;
    adxOut[i] = prevAdx;
  }
  return { adx: adxOut, plusDI: plusDIOut, minusDI: minusDIOut };
}

/** Wilder's ATR（真實區間平均），台指期 Decision OS 用來算停損距離與波動度分級 */
export function atr(bars: OhlcvBar[], period = 14): (number | null)[] {
  const n = bars.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n <= period) return out;

  const tr: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const { high, low } = bars[i];
    const prevClose = bars[i - 1].close;
    tr[i] = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
  }

  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  let prev = sum / period;
  out[period] = prev;

  for (let i = period + 1; i < n; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

export interface BollingerBands {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
  /** %b：價格在通道中的相對位置，0=貼下軌、0.5=貼中軌、1=貼上軌 */
  percentB: (number | null)[];
  /** 帶寬 = (上軌-下軌)/中軌，判斷盤整(窄)或噴出(寬)用 */
  bandwidth: (number | null)[];
}

/** 布林通道：中軌=SMA(period)，上下軌=中軌 ± stdDevMultiplier 個標準差 */
export function bollingerBands(closes: number[], period = 20, stdDevMultiplier = 2): BollingerBands {
  const middle = sma(closes, period);
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);
  const percentB: (number | null)[] = new Array(closes.length).fill(null);
  const bandwidth: (number | null)[] = new Array(closes.length).fill(null);

  for (let i = period - 1; i < closes.length; i++) {
    const mid = middle[i];
    if (mid === null) continue;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (closes[j] - mid) ** 2;
    const stdDev = Math.sqrt(variance / period);
    const up = mid + stdDevMultiplier * stdDev;
    const low = mid - stdDevMultiplier * stdDev;
    upper[i] = up;
    lower[i] = low;
    percentB[i] = up === low ? 0.5 : (closes[i] - low) / (up - low);
    bandwidth[i] = mid === 0 ? null : (up - low) / mid;
  }

  return { upper, middle, lower, percentB, bandwidth };
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
