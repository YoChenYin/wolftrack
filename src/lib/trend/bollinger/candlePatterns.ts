import type { OhlcvBar } from "../types";

/**
 * 簡化版止跌/反轉K線辨識，供 Signal A（下軌超跌反彈）與 Signal C（上軌過熱反轉）判斷用。
 * ⚠️假設：這是主觀的K線型態判斷，不是精確科學——門檻是這次實作依照常見型態（槌子線/流星線/
 * 吞噬）合理推導出的起點，跟 tw/detectBottomPattern.ts 的態度一致：不是backtest校準過的最佳值，
 * 未來如果實測誤判率太高可以再調整，或換成更嚴謹的型態辨識邏輯。
 */

function candleBody(bar: OhlcvBar): number {
  return Math.abs(bar.close - bar.open);
}

function upperShadow(bar: OhlcvBar): number {
  return bar.high - Math.max(bar.open, bar.close);
}

function lowerShadow(bar: OhlcvBar): number {
  return Math.min(bar.open, bar.close) - bar.low;
}

/**
 * 浮點數容忍版的 <=：open/high/low/close 都是各自獨立算出來的浮點數相減結果，
 * 理論上相等的兩個影線/實體長度（例如上影線剛好等於實體）在浮點數運算下常常會有
 * 1e-13 等級的誤差，導致嚴格的 <= 比較意外判定為 false。誤差容忍值用 a/b 的量級
 * 做相對縮放，避免股價量級差很多（幾元 vs 幾千元）時誤差容忍值太鬆或太緊。
 */
function lte(a: number, b: number): boolean {
  return a <= b + Math.max(Math.abs(a), Math.abs(b), 1) * 1e-9;
}

/**
 * 止跌K線（給 Signal A 用）：符合以下任一種即算「出現止跌訊號」——
 * 1. 槌子線：下影線 >= 實體 2 倍、上影線不長於實體（賣壓在盤中被完全吃掉）
 * 2. 多頭吞噬：今天收紅且完全吞掉昨天的黑K實體
 * 3. 最保守版本：今天低點沒有再破昨天低點，且收盤價比昨天高（單純止跌，不再破底）
 */
export function isBullishReversalCandle(bar: OhlcvBar, prevBar: OhlcvBar): boolean {
  const body = candleBody(bar);
  const isHammer = body > 0 && lte(body * 2, lowerShadow(bar)) && lte(upperShadow(bar), body);
  const isBullishEngulfing =
    bar.close > bar.open &&
    prevBar.close < prevBar.open &&
    bar.close >= prevBar.open &&
    bar.open <= prevBar.close;
  const isHigherLowClose = bar.low >= prevBar.low && bar.close > prevBar.close;
  return isHammer || isBullishEngulfing || isHigherLowClose;
}

/**
 * 反轉K線（給 Signal C 用）：止跌K線的鏡像版本——
 * 1. 流星線：上影線 >= 實體 2 倍、下影線不長於實體（追價在盤中被完全吃掉）
 * 2. 空頭吞噬：今天收黑且完全吞掉昨天的紅K實體
 * 3. 最保守版本：今天高點沒有再創昨天新高，且收盤價比昨天低（單純轉弱，不再創高）
 */
export function isBearishReversalCandle(bar: OhlcvBar, prevBar: OhlcvBar): boolean {
  const body = candleBody(bar);
  const isShootingStar = body > 0 && lte(body * 2, upperShadow(bar)) && lte(lowerShadow(bar), body);
  const isBearishEngulfing =
    bar.close < bar.open &&
    prevBar.close > prevBar.open &&
    bar.close <= prevBar.open &&
    bar.open >= prevBar.close;
  const isLowerHighClose = bar.high <= prevBar.high && bar.close < prevBar.close;
  return isShootingStar || isBearishEngulfing || isLowerHighClose;
}
