import type { OhlcvBar } from "@/lib/trend/types";
import { sma, rsi, macdHistogram } from "@/lib/trend/indicators";
import { detectBottomPattern } from "./detectBottomPattern";
import { BACKTEST_HORIZONS, MAX_HORIZON, WARMUP_DAYS, computeReturns, type BacktestHorizon } from "./backtestWalkForward";

/**
 * 純技術分析規則回測（2026-08-28新增，見docs/progress-status.md）：美股先用MU/NVDA+20檔
 * 半導體同業測過同一組規則，發現RSI超賣反彈有明顯超額報酬，但美股受限Polygon免費方案只有
 * 2年歷史（單一多頭regime，樣本只有79筆）——這裡用台股9-10年、涵蓋多種市場狀態的完整歷史
 * 重跑，驗證訊號是不是真的跨市場狀態成立。
 *
 * 跟classifyChipFlow/backtestScenario不同，這裡完全不用籌碼資料（純粹是美股那邊測過的
 * 技術規則移植過來比較），7個規則：MA多頭/空頭排列、RSI超賣/超買、MACD轉正/轉負、
 * 頭肩底/N字底確認。方法論比照backtestWalkForward.ts：anchor day去重（今天符合、昨天不
 * 符合才算一次事件）、5組horizon、TAIEX同期報酬對照。
 */

export type TechnicalRuleType =
  | "goldenCrossMaBullish"
  | "deathCrossMaBearish"
  | "rsiOversoldCross"
  | "rsiOverboughtCross"
  | "macdBullishCross"
  | "macdBearishCross"
  | "bottomPatternConfirmed";

const RSI_OVERSOLD_THRESHOLD = 30;
const RSI_OVERBOUGHT_THRESHOLD = 70;
/** 跟backtestWalkForward.ts的BOTTOM_PATTERN_WINDOW同一個考量：只需要略大於
 * detectBottomPattern內部LOOKBACK_TRADING_DAYS(120)的緩衝，不用每次都從頭slice */
const BOTTOM_PATTERN_WINDOW = 130;

export interface TechnicalRuleEvent {
  ruleType: TechnicalRuleType;
  signalDate: string;
  priceAtSignal: number;
  returns: Record<BacktestHorizon, number | null>;
  taiexReturns: Record<BacktestHorizon, number | null>;
}

function nullReturns(): Record<BacktestHorizon, number | null> {
  return Object.fromEntries(BACKTEST_HORIZONS.map((h) => [h, null])) as Record<BacktestHorizon, number | null>;
}

/**
 * bars/taiexBars：跟walkForwardBacktest()/walkForwardScenarioBacktest()同樣的輸入格式
 * （日期升序原始收盤價序列、加權指數同期歷史）。
 */
export function walkForwardTechnicalRuleBacktest(bars: OhlcvBar[], taiexBars: OhlcvBar[]): TechnicalRuleEvent[] {
  if (bars.length < WARMUP_DAYS + MAX_HORIZON) return [];

  const closes = bars.map((b) => b.close);
  const sma5 = sma(closes, 5);
  const sma10 = sma(closes, 10);
  const sma20 = sma(closes, 20);
  const rsi14 = rsi(closes, 14);
  const macdHist = macdHistogram(closes);
  const taiexIndexByDate = new Map(taiexBars.map((b, i) => [b.date, i]));

  const events: TechnicalRuleEvent[] = [];
  let prevBullish = false;
  let prevBearish = false;
  let prevOversold = false;
  let prevOverbought = false;
  let prevMacdPos = false;
  let prevMacdNeg = false;
  let prevBottomConfirmed = false;

  const lastIndex = bars.length - 1 - MAX_HORIZON;
  for (let i = WARMUP_DAYS; i <= lastIndex; i++) {
    const date = bars[i].date;
    const taiexIdx = taiexIndexByDate.get(date);
    const taiexReturns = taiexIdx !== undefined ? computeReturns(taiexBars, taiexIdx) : nullReturns();

    const s5 = sma5[i];
    const s10 = sma10[i];
    const s20 = sma20[i];
    const bullish = s5 !== null && s10 !== null && s20 !== null && s5 > s10 && s10 > s20;
    const bearish = s5 !== null && s10 !== null && s20 !== null && s5 < s10 && s10 < s20;

    const r = rsi14[i];
    const oversold = r !== null && r < RSI_OVERSOLD_THRESHOLD;
    const overbought = r !== null && r > RSI_OVERBOUGHT_THRESHOLD;

    const m = macdHist[i];
    const macdPos = m !== null && m > 0;
    const macdNeg = m !== null && m < 0;

    const windowStart = Math.max(0, i + 1 - BOTTOM_PATTERN_WINDOW);
    const bottomResult = detectBottomPattern(closes.slice(windowStart, i + 1));
    const bottomConfirmed = bottomResult?.stage === "confirmed";

    const push = (ruleType: TechnicalRuleType) =>
      events.push({
        ruleType,
        signalDate: date,
        priceAtSignal: bars[i].close,
        returns: computeReturns(bars, i),
        taiexReturns,
      });

    if (bullish && !prevBullish) push("goldenCrossMaBullish");
    if (bearish && !prevBearish) push("deathCrossMaBearish");
    if (oversold && !prevOversold) push("rsiOversoldCross");
    if (overbought && !prevOverbought) push("rsiOverboughtCross");
    if (macdPos && !prevMacdPos) push("macdBullishCross");
    if (macdNeg && !prevMacdNeg) push("macdBearishCross");
    if (bottomConfirmed && !prevBottomConfirmed) push("bottomPatternConfirmed");

    prevBullish = bullish;
    prevBearish = bearish;
    prevOversold = oversold;
    prevOverbought = overbought;
    prevMacdPos = macdPos;
    prevMacdNeg = macdNeg;
    prevBottomConfirmed = bottomConfirmed;
  }

  return events;
}
