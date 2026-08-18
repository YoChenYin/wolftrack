import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { findIndustryThemesForTicker } from "@/lib/valuation/groupConfig";
import { computeGroupValuation } from "@/lib/valuation/computeGroupValuation";
import { CoreScoreBreakdown } from "@/components/tw/CoreScoreBreakdown";
import { ValuationSidePanel } from "@/components/tw/ValuationSidePanel";
import { MonthlyRevenuePanel } from "@/components/tw/MonthlyRevenuePanel";
import { PriceTrendChart } from "@/components/tw/PriceTrendChart";
import { InstitutionalFlowChart } from "@/components/tw/InstitutionalFlowChart";
import { ChipConcentrationChart } from "@/components/tw/ChipConcentrationChart";
import { calculateChipConcentration } from "@/lib/trend/tw/chipConcentration";
import type { InstitutionalDay } from "@/lib/trend/tw/chipScore";
import { StockMentionsPanel } from "@/components/youtube/StockMentionsPanel";
import { fetchStockMentions } from "@/lib/youtube/queries";
import { EarningsCallPanel } from "@/components/tw/EarningsCallPanel";
import { buildMopsPdfUrl } from "@/lib/marketData/mopsClient";
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

  // 1Y股價走勢：直接用 tw_daily_price 原始收盤價——這張表是每日排程持續補的完整歷史，
  // 不像 daily_trend_signals 只在有跑分類批次的日子才有一筆（本地開發環境常常是斷斷續續的）
  const priceHistoryDesc = await prisma.twDailyPrice.findMany({
    where: { stockId: stock.id },
    orderBy: { tradeDate: "desc" },
    take: 260,
    select: { tradeDate: true, close: true },
  });
  const priceBars = [...priceHistoryDesc].reverse().map((row) => ({
    date: row.tradeDate.toISOString().slice(0, 10),
    close: Number(row.close),
  }));

  // 三大法人買賣超歷史 + 5/10/20日籌碼集中度都從 tw_institutional_trading 這張完整歷史表算，
  // 不用 daily_trend_signals 存的 chipConcentration 欄位（同樣是批次才算一次，資料點稀疏）。
  // 多抓20天當滾動窗口的緩衝，讓顯示範圍第一天也能算出完整的20日集中度。
  const INSTITUTIONAL_DISPLAY_DAYS = 90;
  const institutionalHistoryDesc = await prisma.twInstitutionalTrading.findMany({
    where: { stockId: stock.id },
    orderBy: { tradeDate: "desc" },
    take: INSTITUTIONAL_DISPLAY_DAYS + 20,
    select: {
      tradeDate: true,
      foreignNetBuyShares: true,
      investTrustNetBuyShares: true,
      dealerNetBuyShares: true,
      totalVolumeShares: true,
    },
  });
  const institutionalHistory: InstitutionalDay[] = [...institutionalHistoryDesc].reverse().map((row) => ({
    date: row.tradeDate.toISOString().slice(0, 10),
    foreignNetBuyShares: Number(row.foreignNetBuyShares),
    investTrustNetBuyShares: Number(row.investTrustNetBuyShares),
    dealerNetBuyShares: Number(row.dealerNetBuyShares),
    totalVolumeShares: Number(row.totalVolumeShares),
  }));
  const institutionalDays = institutionalHistory.slice(-60);
  const chipConcentrationDays = institutionalHistory.slice(-INSTITUTIONAL_DISPLAY_DAYS).map((day, i, arr) => {
    const upToToday = institutionalHistory.slice(0, institutionalHistory.length - arr.length + i + 1);
    const result = calculateChipConcentration(upToToday);
    return {
      date: day.date,
      concentration5: result.concentration5,
      concentration10: result.concentration10,
      concentration20: result.concentration20,
      momentum: result.momentum,
    };
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
      className="relative flex flex-1 flex-col overflow-hidden font-[family:var(--font-tw-sans)] dark:bg-zinc-950"
      style={{ background: "var(--tw-canvas)" }}
    >
      <main className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
        <header className="tw-reveal">
          <Link
            href="/tw"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-200"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" strokeWidth={2.25} />
            返回台股總覽
          </Link>
          <div className="mt-3 flex items-baseline gap-3">
            <h1
              className="font-[family:var(--font-tw-display)] text-3xl font-semibold tracking-tight text-zinc-900"
              style={{
                backgroundImage: "var(--tw-heading-gradient)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {stock.ticker} {stripCompanySuffix(stock.companyName)}
            </h1>
            <span className="font-[family:var(--font-tw-mono)] text-xs font-medium tracking-wide text-amber-800/60 dark:text-amber-400/70">
              {stock.sector.sectorNameZh ?? stock.sector.sectorName}
            </span>
          </div>
          <div className="mt-2 h-px w-24 bg-gradient-to-r from-amber-700/50 to-transparent dark:from-amber-400/40" />
        </header>

        {latestSignal ? (
          <>
            <p className="-mb-3 text-xs text-zinc-400 dark:text-zinc-500">
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
          <p className="text-sm text-zinc-400 dark:text-zinc-500">這檔股票目前沒有任何戰術分類歷史資料。</p>
        )}

        <div className="tw-reveal" style={{ animationDelay: "100ms" }}>
          <PriceTrendChart bars={priceBars} />
        </div>

        <div className="tw-reveal" style={{ animationDelay: "140ms" }}>
          <InstitutionalFlowChart days={institutionalDays} />
        </div>

        <div className="tw-reveal" style={{ animationDelay: "180ms" }}>
          <ChipConcentrationChart days={chipConcentrationDays} />
        </div>

        <div className="tw-reveal" style={{ animationDelay: "220ms" }}>
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

        <div className="tw-reveal" style={{ animationDelay: "260ms" }}>
          <EarningsCallPanel
            analyses={earningsCallAnalyses.map((a) => ({
              conferenceDate: a.conferenceDate.toISOString().slice(0, 10),
              pdfUrl: buildMopsPdfUrl(a.pdfFileName),
              profitGrowthSummary: a.profitGrowthSummary,
              outlookSummary: a.outlookSummary,
              riskSummary: a.riskSummary,
              signal: a.signal,
            }))}
          />
        </div>

        <div className="tw-reveal" style={{ animationDelay: "300ms" }}>
          <StockMentionsPanel mentions={stockMentions} />
        </div>

        <div className="tw-reveal" style={{ animationDelay: "340ms" }}>
          <ValuationSidePanel themesWithoutData={themesWithoutData} valuations={valuations} />
        </div>
      </main>
    </div>
  );
}
