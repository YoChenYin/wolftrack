import { prisma } from "@/lib/prisma";
import { fetchTaiexHistory } from "./twseClient";
import { createRateLimiter } from "./rateLimiter";
import { runTwDailyUpdate, type TwDailyUpdateResult } from "./runTwDailyUpdate";
import { generateDailyReport, type GenerateDailyReportResult } from "@/lib/trend/tw/generateDailyReport";

/**
 * 2026-09-30：台股每日更新的完整流程（抓股價/法人→重算訊號→每日異動報告），給兩個觸發來源共用：
 * app內排程（src/lib/scheduler/twDailyScheduler.ts）跟GitHub Actions打的/api/cron/tw-daily。
 *
 * 為什麼要有app內排程：GitHub免費排程在整點時段嚴重延遲，實測9/22~9/29排在17:00的tw-daily
 * 實際都在21:56~隔天01:27才開始，使用者晚上10點看到的還是前一天的股價。GitHub排程保留當備援，
 * 兩邊都會呼叫這裡，所以要：
 * - 同一個process內不重複跑（in-memory lock，掛在globalThis避免dev HMR重新載入模組後失效）
 * - 最新交易日已經有訊號就跳過，GitHub延遲幾小時後才打進來時不用再把800檔重抓一遍
 *
 * 異動報告直接串在更新後面跑，不再依賴GitHub另外排17:20那一輪——原本兩者只是靠「隔20分鐘
 * 應該跑完了」的假設排順序，更新一慢報告就會拿舊資料比對。
 */

export interface TwDailyPipelineState {
  /** TWSE加權指數最新一筆的日期＝最新已收盤的交易日（假日/還沒公布時會是前一個交易日） */
  latestTradeDate: string | null;
  /** 最新交易日的訊號已經寫進daily_trend_signals */
  alreadyDone: boolean;
}

export interface TwDailyPipelineResult {
  update: TwDailyUpdateResult;
  report: GenerateDailyReportResult;
}

const globalForPipeline = globalThis as unknown as { twDailyPipelineRunning?: Promise<TwDailyPipelineResult> | null };

export function isTwDailyPipelineRunning(): boolean {
  return Boolean(globalForPipeline.twDailyPipelineRunning);
}

/** 只打1次TWSE請求（當月加權指數），拿來判斷「今天收盤資料出來了沒」跟「是不是已經更新過」 */
export async function getTwDailyPipelineState(): Promise<TwDailyPipelineState> {
  const taiexBars = await fetchTaiexHistory(1, createRateLimiter(0));
  const latestTradeDate = taiexBars[taiexBars.length - 1]?.date ?? null;
  if (!latestTradeDate) return { latestTradeDate: null, alreadyDone: false };

  const existing = await prisma.dailyTrendSignal.findFirst({
    where: { tradeDate: new Date(latestTradeDate), stock: { market: "TW" } },
    select: { id: true },
  });
  return { latestTradeDate, alreadyDone: existing !== null };
}

/** 已經在跑就回傳同一個Promise，不會開第二份 */
export function runTwDailyPipeline(source: string): Promise<TwDailyPipelineResult> {
  if (globalForPipeline.twDailyPipelineRunning) return globalForPipeline.twDailyPipelineRunning;

  const startedAt = Date.now();
  console.log(`[tw-daily-pipeline] start (source=${source})`);
  const run = (async () => {
    const update = await runTwDailyUpdate();
    const report = await generateDailyReport();
    console.log(
      `[tw-daily-pipeline] done in ${Math.round((Date.now() - startedAt) / 1000)}s (source=${source}): prices=${update.pricesUpdated}, institutional=${update.institutionalUpdated}, signals wrote=${update.batch.written}, valuation wrote=${update.valuation.written}, report=${report.status}`
    );
    return { update, report };
  })().finally(() => {
    globalForPipeline.twDailyPipelineRunning = null;
  });

  globalForPipeline.twDailyPipelineRunning = run;
  return run;
}
