import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { findIndustryThemesForTicker } from "@/lib/valuation/groupConfig";
import { computeGroupValuation } from "@/lib/valuation/computeGroupValuation";
import { CoreScoreBreakdown } from "@/components/tw/CoreScoreBreakdown";
import { ValuationSidePanel } from "@/components/tw/ValuationSidePanel";
import { MonthlyRevenuePanel } from "@/components/tw/MonthlyRevenuePanel";
import { StockMentionsPanel } from "@/components/youtube/StockMentionsPanel";
import { fetchStockMentions } from "@/lib/youtube/queries";
import { EarningsCallPanel } from "@/components/tw/EarningsCallPanel";
import { stripCompanySuffix } from "@/lib/formatCompanyName";

export const dynamic = "force-dynamic";

export default async function TwStockDetailPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;

  const stock = await prisma.stock.findUnique({
    where: { market_ticker: { market: "TW", ticker } },
    include: { sector: true },
  });
  if (!stock) notFound();

  const latestSignal = await prisma.dailyTrendSignal.findFirst({
    where: { stockId: stock.id },
    orderBy: { tradeDate: "desc" },
  });

  const themes = findIndustryThemesForTicker(ticker);
  const themesWithData = themes.filter((t) => t.members.length > 0);
  const themesWithoutData = themes.filter((t) => t.members.length === 0);
  const valuations = await Promise.all(themesWithData.map((theme) => computeGroupValuation(theme)));

  const revenueRows = await prisma.twMonthlyRevenue.findMany({
    where: { stockId: stock.id },
    orderBy: { revenueMonth: "desc" },
    take: 6,
  });

  const stockMentions = await fetchStockMentions(stock.id);

  const earningsCallAnalyses = await prisma.earningsCallAnalysis.findMany({
    where: { stockId: stock.id },
    orderBy: { conferenceDate: "desc" },
    take: 4,
  });

  return (
    <div
      className="relative flex flex-1 flex-col overflow-hidden font-[family:var(--font-tw-sans)]"
      style={{
        background:
          "radial-gradient(1200px 480px at 15% -10%, rgba(180,83,9,0.08), transparent 60%), radial-gradient(900px 500px at 100% 0%, rgba(180,83,9,0.05), transparent 55%), #fafaf9",
      }}
    >
      <main className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
        <header className="tw-reveal">
          <Link
            href="/tw"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" strokeWidth={2.25} />
            返回台股總覽
          </Link>
          <div className="mt-3 flex items-baseline gap-3">
            <h1
              className="font-[family:var(--font-tw-display)] text-3xl font-semibold tracking-tight text-zinc-900"
              style={{
                backgroundImage: "linear-gradient(100deg, #78350f, #b45309 55%, #78350f)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {stock.ticker} {stripCompanySuffix(stock.companyName)}
            </h1>
            <span className="font-[family:var(--font-tw-mono)] text-xs font-medium tracking-wide text-amber-800/60">
              {stock.sector.sectorNameZh ?? stock.sector.sectorName}
            </span>
          </div>
          <div className="mt-2 h-px w-24 bg-gradient-to-r from-amber-700/50 to-transparent" />
        </header>

        {latestSignal ? (
          <>
            <p className="-mb-3 text-xs text-zinc-400">
              資料日期（as of）：{latestSignal.tradeDate.toISOString().slice(0, 10)}
            </p>
            <div className="tw-reveal" style={{ animationDelay: "60ms" }}>
              <CoreScoreBreakdown
                coreScore={Number(latestSignal.coreScore)}
                technicalScore={latestSignal.technicalScore !== null ? Number(latestSignal.technicalScore) : null}
                chipScore={latestSignal.chipScore !== null ? Number(latestSignal.chipScore) : null}
                chipBadge={latestSignal.chipBadge}
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-zinc-400">這檔股票目前沒有任何戰術分類歷史資料。</p>
        )}

        <div className="tw-reveal" style={{ animationDelay: "120ms" }}>
          <MonthlyRevenuePanel
            rows={revenueRows.map((r) => ({
              revenueMonth: r.revenueMonth.toISOString().slice(0, 7),
              revenue: r.revenue.toString(),
              yoyGrowthPct: r.yoyGrowthPct !== null ? Number(r.yoyGrowthPct) : null,
              momGrowthPct: r.momGrowthPct !== null ? Number(r.momGrowthPct) : null,
              cumulativeYoyGrowthPct: r.cumulativeYoyGrowthPct !== null ? Number(r.cumulativeYoyGrowthPct) : null,
            }))}
          />
        </div>

        <div className="tw-reveal" style={{ animationDelay: "180ms" }}>
          <EarningsCallPanel
            analyses={earningsCallAnalyses.map((a) => ({
              conferenceDate: a.conferenceDate.toISOString().slice(0, 10),
              profitGrowthSummary: a.profitGrowthSummary,
              outlookSummary: a.outlookSummary,
              riskSummary: a.riskSummary,
              signal: a.signal,
            }))}
          />
        </div>

        <div className="tw-reveal" style={{ animationDelay: "240ms" }}>
          <StockMentionsPanel mentions={stockMentions} />
        </div>

        <div className="tw-reveal" style={{ animationDelay: "300ms" }}>
          <ValuationSidePanel themesWithoutData={themesWithoutData} valuations={valuations} />
        </div>
      </main>
    </div>
  );
}
