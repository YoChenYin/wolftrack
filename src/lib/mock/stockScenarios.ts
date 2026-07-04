import type { ReturnPhase } from "./scenarioOhlcv";

/**
 * 每檔股票的假資料「走勢劇本」，目的是讓 seed 出來的假資料在今天這一天
 * 分別落在反轉雷達／蓄勢待發／趨勢穩健三種分類，這樣三欄戰術面板才有東西可以展示。
 * 純隨機漫步很難穩定落在三段分類嚴格的條件窗口內（門檻值見 classify.ts），
 * 這裡的參數是針對各別 ticker 用網格搜尋 + classifyTrend() 實際驗證過的結果，
 * 只用於 MVP 假資料展示，之後接真實 API 時整個檔案可以刪掉。
 */
export interface StockScenario {
  ticker: string;
  targetStatus: "reversal" | "pullback" | "bullish";
  seed: string;
  startPrice: number;
  phases: ReturnPhase[];
  forceVolumeSpike?: { withinLastNDays: number; multiplier: number };
}

// 趨勢穩健：長期溫和上漲 + 尾端加速，對任何 seed 都穩定有效
const BULLISH_PHASES: ReturnPhase[] = [
  { days: 260, dailyDriftPct: 0.05, dailyVolPct: 1.3 },
  { days: 32, dailyDriftPct: 0.3, dailyVolPct: 0.8 },
  { days: 8, dailyDriftPct: 0.55, dailyVolPct: 0.6 },
];

export const STOCK_SCENARIOS: StockScenario[] = [
  // --- 趨勢穩健（bullish）---
  { ticker: "AAPL", targetStatus: "bullish", seed: "AAPL-bullish", startPrice: 180, phases: BULLISH_PHASES },
  { ticker: "AMD", targetStatus: "bullish", seed: "AMD-bullish", startPrice: 110, phases: BULLISH_PHASES },
  { ticker: "UNH", targetStatus: "bullish", seed: "UNH-bullish", startPrice: 480, phases: BULLISH_PHASES },
  { ticker: "GS", targetStatus: "bullish", seed: "GS-bullish", startPrice: 400, phases: BULLISH_PHASES },
  { ticker: "AMZN", targetStatus: "bullish", seed: "AMZN-bullish", startPrice: 150, phases: BULLISH_PHASES },
  { ticker: "XOM", targetStatus: "bullish", seed: "XOM-bullish", startPrice: 105, phases: BULLISH_PHASES },

  // --- 蓄勢待發（pullback）：長期上升趨勢中，近期健康回檔 ---
  {
    ticker: "MSFT",
    targetStatus: "pullback",
    seed: "MSFT-pullback-x2",
    startPrice: 400,
    phases: [
      { days: 260, dailyDriftPct: 0.08, dailyVolPct: 1.3 },
      { days: 20, dailyDriftPct: 0.2, dailyVolPct: 0.7 },
      { days: 7, dailyDriftPct: -0.65, dailyVolPct: 0.8 },
    ],
  },
  {
    ticker: "LLY",
    targetStatus: "pullback",
    seed: "LLY-pullback-x3",
    startPrice: 750,
    phases: [
      { days: 260, dailyDriftPct: 0.08, dailyVolPct: 1.3 },
      { days: 20, dailyDriftPct: 0.15, dailyVolPct: 0.7 },
      { days: 6, dailyDriftPct: -0.55, dailyVolPct: 0.8 },
    ],
  },
  {
    ticker: "BAC",
    targetStatus: "pullback",
    seed: "BAC-pullback-x2",
    startPrice: 40,
    phases: [
      { days: 260, dailyDriftPct: 0.08, dailyVolPct: 1.3 },
      { days: 20, dailyDriftPct: 0.2, dailyVolPct: 0.7 },
      { days: 6, dailyDriftPct: -0.4, dailyVolPct: 0.8 },
    ],
  },
  {
    ticker: "HD",
    targetStatus: "pullback",
    seed: "HD-pullback",
    startPrice: 380,
    phases: [
      { days: 260, dailyDriftPct: 0.08, dailyVolPct: 1.3 },
      { days: 30, dailyDriftPct: 0.3, dailyVolPct: 0.7 },
      { days: 11, dailyDriftPct: -0.6, dailyVolPct: 0.8 },
    ],
  },
  {
    ticker: "CVX",
    targetStatus: "pullback",
    seed: "CVX-pullback",
    startPrice: 155,
    phases: [
      { days: 260, dailyDriftPct: 0.08, dailyVolPct: 1.3 },
      { days: 20, dailyDriftPct: 0.15, dailyVolPct: 0.7 },
      { days: 7, dailyDriftPct: -0.65, dailyVolPct: 0.8 },
    ],
  },

  // --- 反轉雷達（reversal）：長期偏弱後，近 5 日內剛出現黃金交叉 + MACD 翻正 + 量能異常 ---
  {
    ticker: "NVDA",
    targetStatus: "reversal",
    seed: "NVDA-reversal",
    startPrice: 120,
    phases: [
      { days: 240, dailyDriftPct: -0.05, dailyVolPct: 1.2 },
      { days: 10, dailyDriftPct: 0.02, dailyVolPct: 0.7 },
      { days: 6, dailyDriftPct: 1.2, dailyVolPct: 0.5 },
    ],
    forceVolumeSpike: { withinLastNDays: 3, multiplier: 2.2 },
  },
  {
    ticker: "JNJ",
    targetStatus: "reversal",
    seed: "JNJ-reversal-x6",
    startPrice: 155,
    phases: [
      { days: 240, dailyDriftPct: -0.05, dailyVolPct: 1.2 },
      { days: 10, dailyDriftPct: 0.02, dailyVolPct: 0.7 },
      { days: 3, dailyDriftPct: 0.8, dailyVolPct: 0.5 },
    ],
    forceVolumeSpike: { withinLastNDays: 3, multiplier: 2.2 },
  },
  {
    ticker: "JPM",
    targetStatus: "reversal",
    seed: "JPM-reversal-x2",
    startPrice: 210,
    phases: [
      { days: 240, dailyDriftPct: -0.05, dailyVolPct: 1.2 },
      { days: 20, dailyDriftPct: 0.08, dailyVolPct: 0.7 },
      { days: 6, dailyDriftPct: 1.5, dailyVolPct: 0.5 },
    ],
    forceVolumeSpike: { withinLastNDays: 3, multiplier: 2.2 },
  },
  {
    ticker: "TSLA",
    targetStatus: "reversal",
    seed: "TSLA-reversal-x7",
    startPrice: 250,
    phases: [
      { days: 240, dailyDriftPct: -0.05, dailyVolPct: 1.2 },
      { days: 10, dailyDriftPct: 0.02, dailyVolPct: 0.7 },
      { days: 4, dailyDriftPct: 0.8, dailyVolPct: 0.5 },
    ],
    forceVolumeSpike: { withinLastNDays: 3, multiplier: 2.2 },
  },
];

/** 大盤基準（模擬 SPY），供 Core Score 的相對強度因子使用；長度需 >= 任何個股劇本的總天數 */
export const BENCHMARK_PHASES: ReturnPhase[] = [{ days: 320, dailyDriftPct: 0.035, dailyVolPct: 0.9 }];
export const BENCHMARK_SEED = "SPY-benchmark";
export const BENCHMARK_START_PRICE = 450;
