import type { InstitutionalDay } from "@/lib/trend/tw/chipScore";

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

export interface MockInstitutionalOptions {
  /** 種子字串（如 ticker），同樣輸入永遠得到同樣的假資料 */
  seed: string;
  /** 要對齊的交易日日期（通常直接傳個股 OHLCV bars 的 date 陣列） */
  dates: string[];
  /** 買超力道偏向：-1(持續賣超) ~ 0(中性) ~ +1(持續買超)，預設 0 */
  bias?: number;
  /** 當日總成交量基準（張） */
  baseVolumeShares?: number;
}

/**
 * 產生確定性的假三大法人買賣超資料，只用於 MVP 假資料 seed。
 * 之後接上 TWSE/TPEx OpenAPI 真實資料時，這個檔案整個刪掉即可。
 */
export function generateMockInstitutionalTrading(options: MockInstitutionalOptions): InstitutionalDay[] {
  const { seed, dates, bias = 0, baseVolumeShares = 3000 } = options;
  const random = mulberry32(hashSeed(seed));

  return dates.map((date) => {
    const totalVolumeShares = Math.round(baseVolumeShares * (0.6 + random() * 0.8));

    const foreignRatio = bias * 0.03 + (random() - 0.5) * 0.04;
    const investTrustRatio = bias * 0.02 + (random() - 0.5) * 0.03;
    const dealerRatio = (random() - 0.5) * 0.02;

    return {
      date,
      foreignNetBuyShares: Math.round(totalVolumeShares * foreignRatio),
      investTrustNetBuyShares: Math.round(totalVolumeShares * investTrustRatio),
      dealerNetBuyShares: Math.round(totalVolumeShares * dealerRatio),
      totalVolumeShares,
    };
  });
}
