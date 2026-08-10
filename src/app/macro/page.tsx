import { computeMonthlySeasonality } from "@/lib/macro/computeMonthlySeasonality";
import { MonthlySeasonalityPanel } from "@/components/macro/MonthlySeasonalityPanel";
import { DecisionLabDashboard } from "@/components/decisionLab/DecisionLabDashboard";
import { CrossSystemCheck } from "@/components/CrossSystemCheck";
import { queryLatestDecisionLabSnapshot } from "@/lib/decisionLab/querySnapshot";
import { queryLatestSnapshot } from "@/lib/decisionOs/queryLatestSnapshot";

// 這個頁面直接查資料庫，不能被當成靜態頁面在 build time 凍結一份快照
export const dynamic = "force-dynamic";

export default async function MacroPage() {
  const [decisionLabSnapshot, osSnapshot] = await Promise.all([queryLatestDecisionLabSnapshot(), queryLatestSnapshot()]);

  // 四條參考序列：TAIEX(上市大盤) / TPEX(櫃買指數，上櫃大盤對照) / 2330台積電(權值股參考，
  // 大盤裡單一權重最高的個股，用來看季節性是不是被它主導) / SPX(S&P 500，美股對照組，資料源是FRED
  // 只能回溯10年，比台股三個序列短，但符合「至少5年」的樣本需求)
  const seasonality = await Promise.all([
    computeMonthlySeasonality("TAIEX", "加權指數(TAIEX)"),
    computeMonthlySeasonality("TPEX", "櫃買指數(TPEX)"),
    computeMonthlySeasonality("2330", "台積電(2330)"),
    computeMonthlySeasonality("SPX", "S&P 500(美股對照)", "US"),
  ]);

  return (
    <div
      className="relative flex flex-1 flex-col overflow-hidden font-[family:var(--font-tw-sans)] dark:bg-zinc-950"
      style={{ background: "var(--tw-canvas)" }}
    >
      <main className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
        <header className="tw-reveal">
          <div className="flex items-baseline gap-3">
            <h1
              className="font-[family:var(--font-tw-display)] text-3xl font-semibold tracking-tight text-zinc-900"
              style={{
                backgroundImage: "var(--tw-heading-gradient)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              總經
            </h1>
            <span className="font-[family:var(--font-tw-mono)] text-xs font-medium tracking-wide text-amber-800/60 dark:text-amber-400/70">
              WOLFTRACK · MACRO
            </span>
          </div>
          <div className="mt-2 h-px w-24 bg-gradient-to-r from-amber-700/50 to-transparent dark:from-amber-400/40" />
          <p className="mt-3 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
            Decision Lab：每天10分鐘走完一次基金經理人的盤前分析流程。下方接台股歷年在每個月份的表現。
          </p>
        </header>

        <div className="tw-reveal" style={{ animationDelay: "60ms" }}>
          <DecisionLabDashboard snapshot={decisionLabSnapshot} />
        </div>

        <div className="tw-reveal" style={{ animationDelay: "100ms" }}>
          <CrossSystemCheck osSnapshot={osSnapshot} labSnapshot={decisionLabSnapshot} />
        </div>

        <div className="tw-reveal" style={{ animationDelay: "160ms" }}>
          <MonthlySeasonalityPanel series={seasonality} />
        </div>
      </main>
    </div>
  );
}
