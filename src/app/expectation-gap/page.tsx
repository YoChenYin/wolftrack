import { queryExpectationGapNotes } from "@/lib/expectationGap/queryExpectationGap";
import { ExpectationGapForm } from "@/components/expectationGap/ExpectationGapForm";
import { ExpectationGapTable } from "@/components/expectationGap/ExpectationGapTable";
import { ExpectationGapSummary } from "@/components/expectationGap/ExpectationGapSummary";

// 這個頁面直接查資料庫，不能被當成靜態頁面在 build time 凍結一份快照
export const dynamic = "force-dynamic";

export default async function ExpectationGapPage() {
  const notes = await queryExpectationGapNotes();

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
              預期差
            </h1>
            <span className="font-[family:var(--font-tw-mono)] text-xs font-medium tracking-wide text-amber-800/60 dark:text-amber-400/70">
              WOLFTRACK · EXPECTATION GAP
            </span>
          </div>
          <div className="mt-2 h-px w-24 bg-gradient-to-r from-amber-700/50 to-transparent dark:from-amber-400/40" />
          <p className="mt-3 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
            Variance = 自己的判斷（Forward EPS × Target PE）− 市場共識。記錄每次跟市場共識不一樣的判斷跟理由，之後才知道自己準不準。
          </p>
        </header>

        <div className="tw-reveal" style={{ animationDelay: "60ms" }}>
          <ExpectationGapForm />
        </div>

        <div className="tw-reveal" style={{ animationDelay: "120ms" }}>
          <ExpectationGapSummary notes={notes} />
        </div>

        <div className="tw-reveal" style={{ animationDelay: "180ms" }}>
          <ExpectationGapTable notes={notes} />
        </div>
      </main>
    </div>
  );
}
