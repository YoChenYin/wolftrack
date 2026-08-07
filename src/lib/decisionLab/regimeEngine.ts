import type { OhlcvBar } from "@/lib/trend/types";
import { sma, macdHistogram, adxWithDI, atr } from "@/lib/trend/indicators";
import type { MarketRegime, RegimeResult } from "./types";

/**
 * M7 Regime Engine（docs/decision-lab-prd.html 第7節）：用 SPX 自身價格結構 + VIX 水位分類，
 * 純運算、不需要新資料源。分類優先順序（由上到下，第一個符合就採用，避免同時滿足多種定義時模糊）：
 * Capitulation > Volatile > Distribution/Accumulation > 一般趨勢分類(Strong/Weak Bull/Bear/Range)。
 */
export function classifyRegime(spxBars: OhlcvBar[], vixCloses: number[]): RegimeResult {
  const closes = spxBars.map((b) => b.close);
  const n = closes.length;
  const last = n - 1;

  const ma20 = sma(closes, 20);
  const ma60 = sma(closes, 60);
  const ma200 = sma(closes, 200);
  const macdHist = macdHistogram(closes);
  const { adx, plusDI, minusDI } = adxWithDI(spxBars, 14);
  const atr14 = atr(spxBars, 14);
  const atrAvg20 = sma(
    atr14.map((v) => v ?? 0),
    20
  );

  const close = closes[last];
  const spxChangePct = n >= 2 ? ((close - closes[last - 1]) / closes[last - 1]) * 100 : 0;
  const vixLast = vixCloses[vixCloses.length - 1];
  const vixPrev = vixCloses[vixCloses.length - 2];
  const vixChangePct = vixPrev ? ((vixLast - vixPrev) / vixPrev) * 100 : 0;

  // Capitulation：VIX單日跳升>20% 且 SPX單日跌幅>3%
  if (vixChangePct > 20 && spxChangePct < -3) {
    return { regime: "capitulation", reasoning: `VIX單日跳升${vixChangePct.toFixed(0)}%，SPX單日跌${Math.abs(spxChangePct).toFixed(1)}%，恐慌性賣壓特徵` };
  }

  // Volatile：ATR相對20日均值過度擴張
  const atrRatio = atr14[last] !== null && atrAvg20[last] ? atr14[last]! / atrAvg20[last]! : null;
  if (atrRatio !== null && atrRatio > 1.5) {
    return { regime: "volatile", reasoning: `ATR為20日均值的${(atrRatio * 100).toFixed(0)}%，波動度劇烈擴張，方向不明` };
  }

  const adxVal = adx[last];
  const rollback60 = spxBars.slice(Math.max(0, last - 60), last);
  const high60 = rollback60.length > 0 ? Math.max(...rollback60.map((b) => b.high)) : close;
  const low60 = rollback60.length > 0 ? Math.min(...rollback60.map((b) => b.low)) : close;
  const nearHigh = (high60 - close) / close < 0.03;
  const nearLow = (close - low60) / close < 0.03;
  const macdDeclining = macdHist[last] !== null && macdHist[last - 5] !== null && macdHist[last]! < macdHist[last - 5]!;
  const macdImproving = macdHist[last] !== null && macdHist[last - 5] !== null && macdHist[last]! > macdHist[last - 5]!;

  // Distribution：高檔但動能轉弱（頂部派發特徵）
  if (nearHigh && macdDeclining && adxVal !== null && adxVal < 25) {
    return { regime: "distribution", reasoning: `價格貼近60日高點但MACD動能轉弱，疑似高檔派發` };
  }
  // Accumulation：低檔但動能轉強（底部吸籌特徵）
  if (nearLow && macdImproving && adxVal !== null && adxVal < 25) {
    return { regime: "accumulation", reasoning: `價格貼近60日低點但MACD動能轉強，疑似低檔吸籌` };
  }

  if (adxVal === null || ma20[last] === null || ma60[last] === null) {
    return { regime: "range", reasoning: "技術指標暖身期未滿，暫以區間盤整處理" };
  }

  const uptrend = plusDI[last] !== null && minusDI[last] !== null && plusDI[last]! > minusDI[last]!;

  if (adxVal < 20) {
    return { regime: "range", reasoning: `ADX ${adxVal.toFixed(0)}，趨勢強度不足，區間盤整` };
  }

  const ma200Val = ma200[last];
  const alignedBull = ma200Val !== null ? close > ma20[last]! && ma20[last]! > ma60[last]! && ma60[last]! > ma200Val : close > ma20[last]! && ma20[last]! > ma60[last]!;
  const alignedBear = ma200Val !== null ? close < ma20[last]! && ma20[last]! < ma60[last]! && ma60[last]! < ma200Val : close < ma20[last]! && ma20[last]! < ma60[last]!;

  if (uptrend) {
    if (alignedBull && adxVal > 25) {
      return { regime: "strongBull", reasoning: `均線多頭排列，ADX ${adxVal.toFixed(0)} 且+DI>-DI` };
    }
    return { regime: "weakBull", reasoning: `價格偏多但均線未完全排列，ADX ${adxVal.toFixed(0)}` };
  }
  if (alignedBear && adxVal > 25) {
    return { regime: "strongBear", reasoning: `均線空頭排列，ADX ${adxVal.toFixed(0)} 且-DI>+DI` };
  }
  return { regime: "weakBear", reasoning: `價格偏空但均線未完全排列，ADX ${adxVal.toFixed(0)}` };
}

export type { MarketRegime };
