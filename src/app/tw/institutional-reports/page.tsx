import { queryInstitutionalReportsOverview } from "@/lib/marketData/queryInstitutionalReportsOverview";
import { InstitutionalReportList } from "@/components/fundamentals/InstitutionalReportList";
import { TwSectionNav } from "@/components/tw/TwSectionNav";

// 這個頁面直接查資料庫，不能被當成靜態頁面在 build time 凍結一份快照
export const dynamic = "force-dynamic";

/** 2026-08-19新增：法人/投顧產業報告，目前只接玉山證券「台股熱點」「總經盤勢」分類文章
 * （見esunsecClient.ts），排在TwSectionNav的「基本面」分頁之後。 */
export default async function TwInstitutionalReportsPage() {
  const overview = await queryInstitutionalReportsOverview();

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
              法人報告
            </h1>
            <span className="font-[family:var(--font-tw-mono)] text-xs font-medium tracking-wide text-amber-800/60 dark:text-amber-400/70">
              WOLFTRACK · INSTITUTIONAL REPORTS
            </span>
          </div>
          <div className="mt-2 h-px w-24 bg-gradient-to-r from-amber-700/50 to-transparent dark:from-amber-400/40" />
          <p className="mt-3 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
            券商/投顧產業趨勢文章，LLM整理出產業主題、重點摘要與偏多/偏空判斷，並標出提及的個股。目前只接玉山證券「台股熱點」「總經盤勢」兩個分類。
          </p>
          <div className="mt-4">
            <TwSectionNav />
          </div>
        </header>

        <div className="tw-reveal" style={{ animationDelay: "60ms" }}>
          <InstitutionalReportList overview={overview} />
        </div>
      </main>
    </div>
  );
}
