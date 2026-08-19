import { Shuffle, Gauge, Landmark, Newspaper } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TwSectionNav } from "@/components/tw/TwSectionNav";
import { twReturnColor } from "@/lib/tw/color";
import { stripCompanySuffix } from "@/lib/formatCompanyName";
import {
  describeCategoryTransition,
  describeBreakout,
  describeCostBasisCrossover,
  REPORT_DISCLAIMER,
} from "@/lib/trend/tw/describeDailyDiff";
import type { CategoryTransition, BreakoutEvent, CostBasisCrossoverEvent } from "@/lib/trend/tw/dailyMarketDiff";

// 每天資料都會變，不能被當成靜態頁面在 build time 凍結一份快照（跟 /tw 首頁同樣理由）
export const dynamic = "force-dynamic";

/** 大盤劇烈震盪的日子單一區塊可能有近百筆事件（實測2026-07-08法人成本翻轉99筆），
 * 每個區塊只顯示前N筆，避免頁面長到不堪使用——DB裡still存完整清單，之後想做「展開全部」
 * 或分頁再從這裡加，不影響資料層 */
const MAX_ITEMS_PER_SECTION = 30;

function isBullishCategory(category: string): boolean {
  return category === "trustTurnBuy" || category === "combinedBuy" || category === "buyDip";
}

function DiffRow({ text, positive }: { text: string; positive: boolean | null }) {
  return (
    <li
      className={`rounded-xl bg-zinc-50/70 px-3 py-2 text-sm leading-relaxed text-zinc-700 ring-1 ring-zinc-900/[0.04] dark:bg-white/[0.04] dark:text-zinc-300 dark:ring-white/[0.06] ${
        positive === true ? "border-l-2 border-red-400" : positive === false ? "border-l-2 border-emerald-400" : ""
      }`}
    >
      {text}
    </li>
  );
}

function MoreNote({ total, shown }: { total: number; shown: number }) {
  if (total <= shown) return null;
  return <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">還有 {total - shown} 筆，僅顯示前 {shown} 筆</p>;
}

export default async function TwDailyReportPage() {
  const report = await prisma.twDailyMarketReport.findFirst({
    orderBy: { reportDate: "desc" },
  });

  const categoryTransitions = (report?.categoryTransitions as unknown as CategoryTransition[] | undefined) ?? [];
  const breakouts = (report?.breakouts as unknown as BreakoutEvent[] | undefined) ?? [];
  const costBasisCrossovers = (report?.costBasisCrossovers as unknown as CostBasisCrossoverEvent[] | undefined) ?? [];

  const taiexClose = report?.taiexClose !== null && report?.taiexClose !== undefined ? Number(report.taiexClose) : null;
  const taiexChangePct =
    report?.taiexChangePct !== null && report?.taiexChangePct !== undefined ? Number(report.taiexChangePct) : null;

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
              狼蹤台股版
            </h1>
            <span className="font-[family:var(--font-tw-mono)] text-xs font-medium tracking-wide text-amber-800/60 dark:text-amber-400/70">
              WOLFTRACK · TW
            </span>
          </div>
          <div className="mt-2 h-px w-24 bg-gradient-to-r from-amber-700/50 to-transparent dark:from-amber-400/40" />
          <p className="mt-3 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
            每天比對「今天 vs 上一個交易日」，列出網站觀察到的客觀狀態變化——哪些股票戰術分類轉換、站上/跌破支撐壓力、股價穿越法人成本價。
          </p>
          <div className="mt-4">
            <TwSectionNav />
          </div>
        </header>

        {!report ? (
          <div className="tw-reveal" style={{ animationDelay: "80ms" }}>
            <Card>
              <SectionHeader icon={Newspaper} iconColor="zinc" title="每日異動報告" />
              <p className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">
                目前還沒有異動報告——需要至少兩個交易日的戰術分類歷史才能比對，資料排程還在累積中。
              </p>
            </Card>
          </div>
        ) : (
          <>
            <div className="tw-reveal flex flex-wrap items-center justify-between gap-3" style={{ animationDelay: "80ms" }}>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                資料日期：{report.reportDate.toISOString().slice(0, 10)}（比對基準：
                {report.prevTradeDate.toISOString().slice(0, 10)}）
              </p>
              {taiexClose !== null && (
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  加權指數 <span className="font-semibold tabular-nums">{taiexClose.toFixed(0)}</span>{" "}
                  <span className={`font-medium tabular-nums ${twReturnColor(taiexChangePct)}`}>
                    {taiexChangePct !== null ? `${taiexChangePct > 0 ? "+" : ""}${taiexChangePct.toFixed(2)}%` : "—"}
                  </span>
                </p>
              )}
            </div>

            <div className="tw-reveal" style={{ animationDelay: "120ms" }}>
              <Card>
                <SectionHeader icon={Shuffle} iconColor="blue" title="戰術分類異動" />
                {categoryTransitions.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">今天沒有股票新增/移出戰術分類。</p>
                ) : (
                  <>
                    <ul className="mt-3 flex flex-col gap-1.5">
                      {categoryTransitions.slice(0, MAX_ITEMS_PER_SECTION).map((t) => (
                        <DiffRow
                          key={`${t.ticker}-transition`}
                          text={describeCategoryTransition({ ...t, name: stripCompanySuffix(t.name) })}
                          positive={
                            t.toCategory !== null ? isBullishCategory(t.toCategory) : t.fromCategory !== null ? !isBullishCategory(t.fromCategory) : null
                          }
                        />
                      ))}
                    </ul>
                    <MoreNote total={categoryTransitions.length} shown={MAX_ITEMS_PER_SECTION} />
                  </>
                )}
              </Card>
            </div>

            <div className="tw-reveal" style={{ animationDelay: "160ms" }}>
              <Card>
                <SectionHeader icon={Gauge} iconColor="rose" title="支撐/壓力突破" />
                {breakouts.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">今天沒有股票站上近60日壓力價或跌破支撐價。</p>
                ) : (
                  <>
                    <ul className="mt-3 flex flex-col gap-1.5">
                      {breakouts.slice(0, MAX_ITEMS_PER_SECTION).map((b) => (
                        <DiffRow
                          key={`${b.ticker}-breakout`}
                          text={describeBreakout({ ...b, name: stripCompanySuffix(b.name) })}
                          positive={b.direction === "aboveResistance"}
                        />
                      ))}
                    </ul>
                    <MoreNote total={breakouts.length} shown={MAX_ITEMS_PER_SECTION} />
                  </>
                )}
              </Card>
            </div>

            <div className="tw-reveal" style={{ animationDelay: "200ms" }}>
              <Card>
                <SectionHeader icon={Landmark} iconColor="amber" title="法人成本翻轉" />
                {costBasisCrossovers.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">今天沒有股票穿越外資或投信的近60日加權平均成本價。</p>
                ) : (
                  <>
                    <ul className="mt-3 flex flex-col gap-1.5">
                      {costBasisCrossovers.slice(0, MAX_ITEMS_PER_SECTION).map((c, i) => (
                        <DiffRow
                          key={`${c.ticker}-${c.who}-costbasis-${i}`}
                          text={describeCostBasisCrossover({ ...c, name: stripCompanySuffix(c.name) })}
                          positive={c.direction === "priceAboveCost"}
                        />
                      ))}
                    </ul>
                    <MoreNote total={costBasisCrossovers.length} shown={MAX_ITEMS_PER_SECTION} />
                  </>
                )}
              </Card>
            </div>

            <p className="tw-reveal text-xs leading-relaxed text-zinc-400 dark:text-zinc-500" style={{ animationDelay: "240ms" }}>
              {REPORT_DISCLAIMER}
            </p>
          </>
        )}
      </main>
    </div>
  );
}
