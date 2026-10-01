import { getTwDailyPipelineState, isTwDailyPipelineRunning, runTwDailyPipeline } from "@/lib/marketData/twDailyPipeline";

/**
 * 2026-09-30：app內的台股每日更新排程，取代依賴GitHub Actions準時觸發（實測延遲5~8小時，
 * 見twDailyPipeline.ts說明）。由src/instrumentation.ts在server啟動時掛上。
 *
 * 不是「17:00整點跑一次」，而是每CHECK_INTERVAL_MS檢查一次「今天的收盤資料出來了沒、
 * 更新過了沒」——container重啟、當下TWSE還沒公布、某次失敗，下一輪都會自己補上，
 * 不需要額外的補跑機制。假日TWSE最新一筆不會是今天，會直接跳過，不會白打800檔請求。
 */

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
/** server剛啟動時先等一下再做第一次檢查，不要跟啟動流程搶資源 */
const FIRST_CHECK_DELAY_MS = 60 * 1000;
/** 台北時間幾點以後才開始檢查——T86三大法人約16:30前後公布，17:00留緩衝 */
const START_HOUR_TAIPEI = 17;
/** 同一個交易日最多嘗試幾次，避免資料源異常時整晚反覆重抓 */
const MAX_ATTEMPTS_PER_DAY = 3;

const globalForScheduler = globalThis as unknown as {
  twDailySchedulerStarted?: boolean;
  twDailyAttempts?: Map<string, number>;
};

function taipeiNow(): { date: string; hour: number; weekday: number } {
  const t = new Date(Date.now() + 8 * 60 * 60 * 1000); // 台北UTC+8，沒有日光節約
  return { date: t.toISOString().slice(0, 10), hour: t.getUTCHours(), weekday: t.getUTCDay() };
}

async function tick(): Promise<void> {
  const now = taipeiNow();
  if (now.weekday === 0 || now.weekday === 6 || now.hour < START_HOUR_TAIPEI) return;
  if (isTwDailyPipelineRunning()) return;

  const attempts = globalForScheduler.twDailyAttempts!;
  if ((attempts.get(now.date) ?? 0) >= MAX_ATTEMPTS_PER_DAY) return;

  const state = await getTwDailyPipelineState();
  // 最新交易日不是今天：國定假日，或TWSE還沒公布今天的資料，下一輪再看
  if (state.latestTradeDate !== now.date || state.alreadyDone) return;

  attempts.set(now.date, (attempts.get(now.date) ?? 0) + 1);
  await runTwDailyPipeline("in-app-scheduler");
}

export function startTwDailyScheduler(): void {
  if (globalForScheduler.twDailySchedulerStarted) return;
  globalForScheduler.twDailySchedulerStarted = true;
  globalForScheduler.twDailyAttempts = new Map();

  const safeTick = () =>
    tick().catch((err) => {
      console.error("[tw-daily-scheduler] tick failed:", err);
    });

  setTimeout(safeTick, FIRST_CHECK_DELAY_MS);
  setInterval(safeTick, CHECK_INTERVAL_MS);
  console.log("[tw-daily-scheduler] started");
}
