import type { OhlcvBar } from "@/lib/trend/types";
import { computeChipFlowIndicators, classifyChipFlow } from "./classifyChipFlow";
import { detectBottomPattern } from "./detectBottomPattern";
import { isLimitMoveDay } from "./limitMove";
import type { InstitutionalDay } from "./chipScore";

/**
 * 戰術訊號回測v1：把classifyChipFlow()（籌碼流4分類）+detectBottomPattern()（底部型態2分類）
 * 的判斷邏輯回溯套用到歷史上每一個交易日（只用當天以前的資料，不能看到未來），記錄「如果
 * 這個規則過去每天都在跑，哪一天會觸發訊號」，再往後量5/10/20/40/60個交易日的報酬率。
 * buyDip已經在2026-07-23版backtest驗證過，不在這次回測範圍內。
 *
 * 效能設計：兩個函式本來就是「給定某一天，用當天以前的資料判斷」的介面（設計來給每日批次
 * 用），這裡直接重複呼叫，不用另外寫一套回測專用的分類邏輯，確保回測用的規則精確等於正式
 * 環境在用的規則。classifyChipFlow每次呼叫會O(n)過濾institutionalDays，對~2300個交易日
 * 跑下來大約O(n²)～500萬次比較，實測可接受（不是瓶頸）；detectBottomPattern則是靠傳入
 * 已經裁切好的近130天窗口（不是整個歷史）避免額外的O(n)開銷。
 */

export const BACKTEST_HORIZONS = [5, 10, 20, 40, 60] as const;
export type BacktestHorizon = (typeof BACKTEST_HORIZONS)[number];
const MAX_HORIZON = 60;

/** 跟runTwDailyBatch.ts的MIN_BARS_REQUIRED一致——籌碼流分類（MA60）+底部型態（120天pivot
 * lookback）都需要足夠的暖身期，統一從第210根bar開始走訪 */
const WARMUP_DAYS = 210;
/** 傳給detectBottomPattern的窗口只需要略大於它內部LOOKBACK_TRADING_DAYS(120)的緩衝，
 * 不用每次都把從頭到今天的整段歷史slice+map一次（那會是O(i)，隨著i增大越算越慢） */
const BOTTOM_PATTERN_WINDOW = 130;

export type BacktestCategory = "trustTurnBuy" | "combinedBuy" | "trustTurnSell" | "combinedSell" | "headShoulders" | "nShape";

export interface BacktestEvent {
  category: BacktestCategory;
  signalDate: string;
  priceAtSignal: number;
  returns: Record<BacktestHorizon, number | null>;
  taiexReturns: Record<BacktestHorizon, number | null>;
}

function forwardReturn(bars: OhlcvBar[], eventIndex: number, horizon: number): number | null {
  const idx = eventIndex + horizon;
  if (idx >= bars.length) return null;
  const base = bars[eventIndex].close;
  if (base === 0) return null;
  return Math.round(((bars[idx].close - base) / base) * 10000) / 100;
}

function computeReturns(bars: OhlcvBar[], eventIndex: number): Record<BacktestHorizon, number | null> {
  return Object.fromEntries(BACKTEST_HORIZONS.map((h) => [h, forwardReturn(bars, eventIndex, h)])) as Record<
    BacktestHorizon,
    number | null
  >;
}

/**
 * bars：日期升序排列的原始收盤價序列（跟runTwDailyBatch.ts一樣，這裡沒有公司行動資料可以
 * adjustPrice，直接用原始收盤價——沒有除權息還原的簡化，跟正式環境目前的處理方式一致）。
 * institutionalDays：三大法人歷史，日期需與bars對齊。
 * taiexBars：加權指數同期歷史，用來算「同一天大盤本身的N日後報酬」當比較基準，
 *   用日期對齊（不是index對齊，避免兩個序列長度不一致時位移）。
 */
export function walkForwardBacktest(bars: OhlcvBar[], institutionalDays: InstitutionalDay[], taiexBars: OhlcvBar[]): BacktestEvent[] {
  if (bars.length < WARMUP_DAYS + MAX_HORIZON) return [];

  const indicators = computeChipFlowIndicators(bars);
  const taiexIndexByDate = new Map(taiexBars.map((b, i) => [b.date, i]));

  const events: BacktestEvent[] = [];
  let prevBottomStage: "nearBreakout" | "confirmed" | null = null;

  const lastIndex = bars.length - 1 - MAX_HORIZON;
  for (let i = WARMUP_DAYS; i <= lastIndex; i++) {
    const date = bars[i].date;
    const taiexIdx = taiexIndexByDate.get(date);
    const taiexReturns =
      taiexIdx !== undefined
        ? computeReturns(taiexBars, taiexIdx)
        : (Object.fromEntries(BACKTEST_HORIZONS.map((h) => [h, null])) as Record<BacktestHorizon, number | null>);

    const isLimitMove = isLimitMoveDay(bars, i);
    const classification = classifyChipFlow(bars, indicators, i, institutionalDays, isLimitMove);
    const chipCategories: BacktestCategory[] = ["trustTurnBuy", "combinedBuy", "trustTurnSell", "combinedSell"];
    if (
      chipCategories.includes(classification.status as BacktestCategory) &&
      classification.signalPointDate === date // 只記連續訊號的起點那天，避免同一段訊號被算成好幾筆重疊樣本
    ) {
      events.push({
        category: classification.status as BacktestCategory,
        signalDate: date,
        priceAtSignal: bars[i].close,
        returns: computeReturns(bars, i),
        taiexReturns,
      });
    }

    const windowStart = Math.max(0, i + 1 - BOTTOM_PATTERN_WINDOW);
    const bottomResult = detectBottomPattern(bars.slice(windowStart, i + 1).map((b) => b.close));
    const stage = bottomResult?.stage ?? null;
    if (stage === "confirmed" && prevBottomStage !== "confirmed") {
      events.push({
        category: bottomResult!.patternType,
        signalDate: date,
        priceAtSignal: bars[i].close,
        returns: computeReturns(bars, i),
        taiexReturns,
      });
    }
    prevBottomStage = stage;
  }

  return events;
}
