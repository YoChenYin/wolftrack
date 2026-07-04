import type { OhlcvBar } from "@/lib/trend/types";

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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 一段走勢劇本：連續 `days` 個交易日，用固定的日漲跌幅平均值/波動度描述這段期間的走勢型態 */
export interface ReturnPhase {
  days: number;
  /** 每日平均報酬率（%），例如 0.3 代表平均每天 +0.3% */
  dailyDriftPct: number;
  /** 每日報酬率標準差（%） */
  dailyVolPct: number;
}

export interface PhasedOhlcvOptions {
  seed: string;
  startPrice: number;
  phases: ReturnPhase[];
  endDate?: Date;
  baseVolume?: number;
  /** 在最後 N 天內的某一天強制注入一次量能爆發（給「反轉雷達」劇本用，避免完全依賴隨機） */
  forceVolumeSpike?: { withinLastNDays: number; multiplier: number };
}

/**
 * 依「走勢劇本」（一序列 drift/vol 不同的階段）產生確定性假日線 OHLCV。
 * 用於 Task 3 seed 假資料時，需要精準控制某檔股票最近走勢（例如剛黃金交叉、剛回檔 8%），
 * 純隨機漫步很難穩定落在三段分類嚴格的條件窗口內，因此改用可控的分段劇本。
 * 只用於 MVP 假資料，之後接真實 API 時整段替換掉。
 */
export function buildPhasedOhlcv(options: PhasedOhlcvOptions): OhlcvBar[] {
  const { seed, startPrice, phases, endDate = new Date(), baseVolume = 5_000_000, forceVolumeSpike } = options;

  const random = mulberry32(hashSeed(seed));
  const totalDays = phases.reduce((sum, p) => sum + p.days, 0);

  const dates: Date[] = [];
  const cursor = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
  while (dates.length < totalDays) {
    if (!isWeekend(cursor)) dates.unshift(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  const bars: OhlcvBar[] = [];
  let close = startPrice;
  let dayIndex = 0;

  for (const phase of phases) {
    const dailyDrift = phase.dailyDriftPct / 100;
    const dailyVol = phase.dailyVolPct / 100;

    for (let i = 0; i < phase.days; i++) {
      const prevClose = close;
      const shock = dailyDrift - (dailyVol * dailyVol) / 2 + dailyVol * gaussian(random);
      close = Math.max(0.5, prevClose * Math.exp(shock));

      const open = prevClose * (1 + (random() - 0.5) * dailyVol * 0.4);
      const intradayRange = close * dailyVol * (0.6 + random() * 0.8);
      const high = Math.max(open, close) + intradayRange * random();
      const low = Math.min(open, close) - intradayRange * random();
      let volume = Math.round(baseVolume * (0.6 + random() * 0.8));

      bars.push({
        date: toDateString(dates[dayIndex]),
        open: round2(open),
        high: round2(high),
        low: round2(Math.max(0.1, low)),
        close: round2(close),
        volume,
      });
      dayIndex++;
    }
  }

  if (forceVolumeSpike) {
    const spikeIndex = bars.length - 1 - Math.floor(random() * forceVolumeSpike.withinLastNDays);
    if (spikeIndex >= 0) {
      bars[spikeIndex] = { ...bars[spikeIndex], volume: Math.round(bars[spikeIndex].volume * forceVolumeSpike.multiplier) };
    }
  }

  return bars;
}
