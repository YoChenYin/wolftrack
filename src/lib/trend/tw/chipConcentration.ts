import type { InstitutionalDay } from "./chipScore";

/** 轉強 / 持平 / 轉弱，對應 Prisma 的 ChipMomentum enum */
export type ChipMomentum = "strengthening" | "neutral" | "weakening";

export interface ChipConcentrationResult {
  concentration5: number;
  concentration10: number;
  concentration20: number;
  momentum: ChipMomentum;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Concentration(N) = (近N日外資買超張數 + 近N日投信買超張數) / 近N日總成交量（張） × 100%
 * ✅已確認公式（docs/wolftrack-tw-spec.md 3.6，取自 AlphaFlow TW 既有邏輯，以張數計算）。
 */
function concentrationForWindow(days: InstitutionalDay[], windowDays: number): number {
  const window = days.slice(-windowDays);
  if (window.length === 0) return 0;
  const netSum = sum(window.map((d) => d.foreignNetBuyShares + d.investTrustNetBuyShares));
  const volSum = sum(window.map((d) => d.totalVolumeShares));
  return volSum > 0 ? (netSum / volSum) * 100 : 0;
}

/**
 * 籌碼集中度動態進出場訊號（docs/wolftrack-tw-spec.md 3.6）：
 * - 轉強：Concentration(5) > Concentration(10) > Concentration(20) 且 Concentration(5) > 0
 * - 轉弱：Concentration(5) < Concentration(10)
 * - 其餘：持平
 */
export function calculateChipConcentration(days: InstitutionalDay[]): ChipConcentrationResult {
  const concentration5 = concentrationForWindow(days, 5);
  const concentration10 = concentrationForWindow(days, 10);
  const concentration20 = concentrationForWindow(days, 20);

  let momentum: ChipMomentum;
  if (concentration5 > concentration10 && concentration10 > concentration20 && concentration5 > 0) {
    momentum = "strengthening";
  } else if (concentration5 < concentration10) {
    momentum = "weakening";
  } else {
    momentum = "neutral";
  }

  return { concentration5, concentration10, concentration20, momentum };
}
