/**
 * Next.js server啟動時執行一次（見node_modules/next/dist/docs/01-app/02-guides/instrumentation.md）。
 * 目前只用來掛台股每日更新的app內排程（見src/lib/scheduler/twDailyScheduler.ts）。
 *
 * 只在production的Node.js runtime啟動——next dev不跑，避免本機開發時去打TWSE、寫本機DB；
 * 需要關掉時（例如同時跑多個instance）設DISABLE_IN_APP_SCHEDULER=1。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production" || process.env.DISABLE_IN_APP_SCHEDULER === "1") return;

  const { startTwDailyScheduler } = await import("@/lib/scheduler/twDailyScheduler");
  startTwDailyScheduler();
}
