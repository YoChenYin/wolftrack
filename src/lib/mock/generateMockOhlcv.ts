import type { OhlcvBar } from "@/lib/trend/types";

/** 確定性的 seeded PRNG（mulberry32），同樣的 seed 永遠產生同樣的假資料 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
  }
  return hash;
}

/** 標準常態分佈亂數（Box-Muller），用 seeded uniform 亂數當輸入 */
function gaussian(random: () => number): number {
  const u1 = Math.max(random(), 1e-9);
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface MockOhlcvOptions {
  /** 種子字串（如 ticker），同樣輸入永遠得到同樣的假資料 */
  seed: string;
  /** 要產生的交易日數 */
  days: number;
  /** 起始收盤價 */
  startPrice: number;
  /** 年化漂移率，例如 0.15 代表平均年報酬 15% */
  annualDrift?: number;
  /** 年化波動率，例如 0.30 代表 30% */
  annualVolatility?: number;
  /** 序列結束日期（含），預設為今天 */
  endDate?: Date;
  /** 基準日均量 */
  baseVolume?: number;
}

/**
 * 產生確定性的假日線 OHLCV 資料（幾何布朗運動隨機漫步 + 簡單日內雜訊）。
 * 只用於 MVP 假資料 seed，之後接真實 API（Polygon.io / FMP）時整段替換掉即可。
 */
export function generateMockOhlcv(options: MockOhlcvOptions): OhlcvBar[] {
  const {
    seed,
    days,
    startPrice,
    annualDrift = 0.1,
    annualVolatility = 0.3,
    endDate = new Date(),
    baseVolume = 5_000_000,
  } = options;

  const random = mulberry32(hashSeed(seed));
  const dailyDrift = annualDrift / 252;
  const dailyVol = annualVolatility / Math.sqrt(252);

  // 先算出結束日往回數 `days` 個交易日的日期序列
  const dates: Date[] = [];
  const cursor = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
  while (dates.length < days) {
    if (!isWeekend(cursor)) dates.unshift(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  const bars: OhlcvBar[] = [];
  let close = startPrice;

  for (let i = 0; i < dates.length; i++) {
    const prevClose = close;
    const shock = dailyDrift - (dailyVol * dailyVol) / 2 + dailyVol * gaussian(random);
    close = Math.max(0.5, prevClose * Math.exp(shock));

    const open = prevClose * (1 + (random() - 0.5) * dailyVol * 0.4);
    const intradayRange = close * dailyVol * (0.6 + random() * 0.8);
    const high = Math.max(open, close) + intradayRange * random();
    const low = Math.min(open, close) - intradayRange * random();
    const volume = Math.round(baseVolume * (0.6 + random() * 0.8));

    bars.push({
      date: toDateString(dates[i]),
      open: round2(open),
      high: round2(high),
      low: round2(Math.max(0.1, low)),
      close: round2(close),
      volume,
    });
  }

  return bars;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
