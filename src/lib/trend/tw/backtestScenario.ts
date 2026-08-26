import type { OhlcvBar } from "@/lib/trend/types";
import { sma } from "@/lib/trend/indicators";
import { calculateChipConcentration } from "./chipConcentration";
import type { InstitutionalDay } from "./chipScore";
import { BACKTEST_HORIZONS, MAX_HORIZON, WARMUP_DAYS, computeReturns, type BacktestHorizon } from "./backtestWalkForward";

/**
 * 「歷史相似情境統計」回測（2026-08-22新增，見docs/progress-status.md「走勢預測模型」章節）：
 * 使用者想要「用MA+股價+籌碼量能的關係做走勢預測」，但直接輸出「預測」會踩投顧牌照法規紅線
 * （跟每日異動報告當初的設計顧慮一樣）。這裡改做「歷史相似情境統計」——把MA5/10/20排列狀態
 * 跟近20日籌碼集中度分箱交叉，回溯統計「這個組合過去出現時，未來N個交易日的報酬分布」，
 * 呈現的是歷史事實不是預測，跟buyDip現有的70%勝率標示同一種呈現邏輯。
 *
 * 方法論完全比照backtestWalkForward.ts：anchor day去重（只記錄組合剛切換的那一天，避免同一段
 * 連續期間被算成好幾筆重疊樣本）、5組horizon、TAIEX同期報酬對照。獨立成新檔案而不是塞進
 * walkForwardBacktest()，是因為分類維度完全不同（這裡是MA+籌碼「狀態」，那邊是「戰術訊號事件」），
 * 硬併在一起會讓兩邊的迴圈條件互相牽扯、難以各自驗證。
 */

export type MaArrangement = "bullish" | "bearish" | "mixed";
export type ChipConcentrationBucket = "low" | "mid" | "high";

/** 沿用classifyChipFlow.ts逢低布局已backtest驗證過的15%門檻精神，切成低於10%/10-20%/20%以上三段 */
const CHIP_BUCKET_LOW_MAX = 10;
const CHIP_BUCKET_MID_MAX = 20;

export interface ScenarioBacktestEvent {
  maArrangement: MaArrangement;
  chipBucket: ChipConcentrationBucket;
  signalDate: string;
  priceAtSignal: number;
  returns: Record<BacktestHorizon, number | null>;
  taiexReturns: Record<BacktestHorizon, number | null>;
}

function nullReturns(): Record<BacktestHorizon, number | null> {
  return Object.fromEntries(BACKTEST_HORIZONS.map((h) => [h, null])) as Record<BacktestHorizon, number | null>;
}

/** MA5>MA10>MA20＝多頭排列，MA5<MA10<MA20＝空頭排列，其餘（含糾結、資料不足）都算mixed */
export function classifyMaArrangement(ma5: number | null, ma10: number | null, ma20: number | null): MaArrangement | null {
  if (ma5 === null || ma10 === null || ma20 === null) return null;
  if (ma5 > ma10 && ma10 > ma20) return "bullish";
  if (ma5 < ma10 && ma10 < ma20) return "bearish";
  return "mixed";
}

export function classifyChipBucket(concentration20: number): ChipConcentrationBucket {
  if (concentration20 < CHIP_BUCKET_LOW_MAX) return "low";
  if (concentration20 < CHIP_BUCKET_MID_MAX) return "mid";
  return "high";
}

/**
 * bars/institutionalDays/taiexBars：跟walkForwardBacktest()同樣的輸入格式（日期升序原始
 * 收盤價序列、三大法人歷史、加權指數同期歷史）。
 */
export function walkForwardScenarioBacktest(
  bars: OhlcvBar[],
  institutionalDays: InstitutionalDay[],
  taiexBars: OhlcvBar[]
): ScenarioBacktestEvent[] {
  if (bars.length < WARMUP_DAYS + MAX_HORIZON) return [];

  const closes = bars.map((b) => b.close);
  const ma5 = sma(closes, 5);
  const ma10 = sma(closes, 10);
  const ma20 = sma(closes, 20);
  const taiexIndexByDate = new Map(taiexBars.map((b, i) => [b.date, i]));

  const events: ScenarioBacktestEvent[] = [];
  let prevCombo: string | null = null;

  const lastIndex = bars.length - 1 - MAX_HORIZON;
  for (let i = WARMUP_DAYS; i <= lastIndex; i++) {
    const arrangement = classifyMaArrangement(ma5[i], ma10[i], ma20[i]);
    if (arrangement === null) {
      prevCombo = null;
      continue;
    }

    const daysUpToDate = institutionalDays.filter((d) => d.date <= bars[i].date);
    const bucket = classifyChipBucket(calculateChipConcentration(daysUpToDate).concentration20);
    const combo = `${arrangement}:${bucket}`;

    if (combo !== prevCombo) {
      const date = bars[i].date;
      const taiexIdx = taiexIndexByDate.get(date);
      const taiexReturns = taiexIdx !== undefined ? computeReturns(taiexBars, taiexIdx) : nullReturns();
      events.push({
        maArrangement: arrangement,
        chipBucket: bucket,
        signalDate: date,
        priceAtSignal: bars[i].close,
        returns: computeReturns(bars, i),
        taiexReturns,
      });
    }
    prevCombo = combo;
  }

  return events;
}
