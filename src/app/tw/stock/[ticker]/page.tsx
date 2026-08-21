import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Gauge, TrendingUp, Landmark, Layers, BarChart3, Presentation, PlaySquare, Link2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { findIndustryThemesForTicker } from "@/lib/valuation/groupConfig";
import { computeGroupValuation } from "@/lib/valuation/computeGroupValuation";
import { CoreScoreBreakdown } from "@/components/tw/CoreScoreBreakdown";
import { EntryExitReferenceCard } from "@/components/tw/EntryExitReferenceCard";
import { FundamentalsSnapshotCard } from "@/components/tw/FundamentalsSnapshotCard";
import { InstitutionalAttentionCard, type InstitutionalAttentionData } from "@/components/tw/InstitutionalAttentionCard";
import { InvestmentThesisCard } from "@/components/tw/InvestmentThesisCard";
import { ValuationSidePanel } from "@/components/tw/ValuationSidePanel";
import { MonthlyRevenuePanel } from "@/components/tw/MonthlyRevenuePanel";
import { PriceTrendChart } from "@/components/tw/PriceTrendChart";
import { InstitutionalFlowChart } from "@/components/tw/InstitutionalFlowChart";
import { ChipConcentrationChart } from "@/components/tw/ChipConcentrationChart";
import { StockDetailTabs } from "@/components/tw/StockDetailTabs";
import { calculateChipConcentration } from "@/lib/trend/tw/chipConcentration";
import { calculateSupportResistance } from "@/lib/trend/tw/supportResistance";
import { calculateInstitutionalCostBasis } from "@/lib/trend/tw/institutionalCostBasis";
import type { InstitutionalDay } from "@/lib/trend/tw/chipScore";
import { StockMentionsPanel } from "@/components/youtube/StockMentionsPanel";
import { fetchStockMentions } from "@/lib/youtube/queries";
import { EarningsCallPanel } from "@/components/tw/EarningsCallPanel";
import { buildMopsPdfUrl } from "@/lib/marketData/mopsClient";
import { stripCompanySuffix } from "@/lib/formatCompanyName";
import { WatchlistButton } from "@/components/watchlist/WatchlistButton";

export const dynamic = "force-dynamic";

const TAB_ICON_CLASS = "h-3.5 w-3.5";
/** 媒體提及沒有像價格/籌碼那樣天然有限的資料量（頻道持續發片就會一直累積），給一個
 * 夠大的上限當「全部歷史」，避免真的unbounded query */
const STOCK_MENTIONS_DISPLAY_LIMIT = 100;
const INSTITUTIONAL_ATTENTION_WINDOW_DAYS = 20;

/** 總覽分頁「法人動向」卡用：近20日外資+投信合計淨買賣超，加上從最新一天往回算的
 * 連續同方向天數（見InstitutionalAttentionCard.tsx）。institutionalHistory本身已經是
 * 依日期由舊到新排序的完整歷史（page.tsx已經有的陣列直接重用，不用再查一次DB）。 */
function computeInstitutionalAttention(history: InstitutionalDay[]): InstitutionalAttentionData | null {
  if (history.length === 0) return null;

  const recentWindow = history.slice(-INSTITUTIONAL_ATTENTION_WINDOW_DAYS);
  const netBuyLots20d = Math.round(
    recentWindow.reduce((sum, day) => sum + day.foreignNetBuyShares + day.investTrustNetBuyShares, 0)
  );

  let streakDays = 0;
  let streakDirection: "buy" | "sell" | null = null;
  for (let i = history.length - 1; i >= 0; i--) {
    const net = history[i].foreignNetBuyShares + history[i].investTrustNetBuyShares;
    const direction = net > 0 ? "buy" : net < 0 ? "sell" : null;
    if (direction === null) break;
    if (streakDirection === null) streakDirection = direction;
    if (direction !== streakDirection) break;
    streakDays++;
  }

  return { netBuyLots20d, streakDays, streakDirection, latestDate: history[history.length - 1].date };
}

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

  // 股價走勢：直接用 tw_daily_price 原始收盤價——這張表是每日排程持續補的完整歷史，
  // 不像 daily_trend_signals 只在有跑分類批次的日子才有一筆（本地開發環境常常是斷斷續續的）。
  // 2026-08-19：不再限制筆數，改抓全部歷史，圖表內部自己切6M/1Y/全部等區間（比照券商APP）
  const priceHistoryDesc = await prisma.twDailyPrice.findMany({
    where: { stockId: stock.id },
    orderBy: { tradeDate: "desc" },
    select: { tradeDate: true, close: true },
  });
  const priceBars = [...priceHistoryDesc].reverse().map((row) => ({
    date: row.tradeDate.toISOString().slice(0, 10),
    close: Number(row.close),
  }));

  // 三大法人買賣超歷史 + 5/10/20日籌碼集中度都從 tw_institutional_trading 這張完整歷史表算，
  // 不用 daily_trend_signals 存的 chipConcentration 欄位（同樣是批次才算一次，資料點稀疏）。
  // 2026-08-19：不再限制筆數，兩個圖表現在都各自有內部區間切換，籌碼集中度也對全部歷史
  // 逐日計算滾動窗口（原本只算最近90天，改成每一天都算，用截至當天的完整歷史當context）
  const institutionalHistoryDesc = await prisma.twInstitutionalTrading.findMany({
    where: { stockId: stock.id },
    orderBy: { tradeDate: "desc" },
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
  const chipConcentrationDays = institutionalHistory.map((day, i) => {
    const upToToday = institutionalHistory.slice(0, i + 1);
    const result = calculateChipConcentration(upToToday);
    return {
      date: day.date,
      concentration5: result.concentration5,
      concentration10: result.concentration10,
      concentration20: result.concentration20,
      momentum: result.momentum,
    };
  });

  // 2026-08-19新增：進出場參考（支撐/壓力+外資/投信成本，見EntryExitReferenceCard.tsx）
  // 都是純計算，用priceBars/institutionalHistory已經有的資料，不用再查一次DB
  const supportResistance = calculateSupportResistance(priceBars.map((b) => b.close));
  const closeByDate = new Map(priceBars.map((b) => [b.date, b.close]));
  const costBasisDays = institutionalHistory
    .map((day) => {
      const close = closeByDate.get(day.date);
      return close === undefined
        ? null
        : { closePrice: close, foreignNetBuyShares: day.foreignNetBuyShares, investTrustNetBuyShares: day.investTrustNetBuyShares };
    })
    .filter((d): d is { closePrice: number; foreignNetBuyShares: number; investTrustNetBuyShares: number } => d !== null);
  const foreignCostBasis = calculateInstitutionalCostBasis(
    costBasisDays.map((d) => ({ closePrice: d.closePrice, netBuyShares: d.foreignNetBuyShares }))
  ).costBasis;
  const trustCostBasis = calculateInstitutionalCostBasis(
    costBasisDays.map((d) => ({ closePrice: d.closePrice, netBuyShares: d.investTrustNetBuyShares }))
  ).costBasis;

  const themes = findIndustryThemesForTicker(ticker);
  const themesWithData = themes.filter((t) => t.members.length > 0);
  const themesWithoutData = themes.filter((t) => t.members.length === 0);
  const valuations = await Promise.all(themesWithData.map((theme) => computeGroupValuation(theme)));

  // 2026-08-19：月營收/法說會/媒體提及也都不再限制少少幾筆，改抓全部（或夠大的上限）歷史
  const revenueRows = await prisma.twMonthlyRevenue.findMany({
    where: { stockId: stock.id },
    orderBy: { revenueMonth: "desc" },
  });

  const stockMentions = await fetchStockMentions(stock.id, STOCK_MENTIONS_DISPLAY_LIMIT);

  const earningsCallAnalyses = await prisma.earningsCallAnalysis.findMany({
    where: { stockId: stock.id },
    orderBy: { conferenceDate: "desc" },
  });

  // 2026-08-19新增：總覽分頁「基本面快照」用，取最新一期季報獲利能力資料
  const latestQuarterlyEps = await prisma.twQuarterlyEps.findFirst({
    where: { stockId: stock.id },
    orderBy: [{ fiscalYear: "desc" }, { fiscalQuarter: "desc" }],
  });

  // 總覽分頁「投資論點」用：最新一份已解析、且至少談到護城河/市占率/客戶/催化劑其中一項
  // 的法說會（不是每份簡報都會談到，見parseEarningsCall.ts），沒有就整張卡不顯示
  const latestThesisSource = earningsCallAnalyses.find(
    (a) => a.signal !== null && (a.moatSummary || a.marketShareSummary || a.customerSummary || a.catalystSummary)
  );

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
          <div className="mt-3 flex flex-wrap items-baseline gap-3">
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
            <WatchlistButton stockId={stock.id} currentPath={`/tw/stock/${stock.ticker}`} />
          </div>
          <div className="mt-2 h-px w-24 bg-gradient-to-r from-amber-700/50 to-transparent dark:from-amber-400/40" />
        </header>

        {latestSignal && (
          <p className="-mb-3 text-xs text-zinc-400 dark:text-zinc-500">
            資料日期（as of）：{latestSignal.tradeDate.toISOString().slice(0, 10)}
          </p>
        )}

        <div className="tw-reveal" style={{ animationDelay: "60ms" }}>
          <StockDetailTabs
            tabs={[
              {
                key: "overview",
                label: "總覽",
                icon: <Gauge key="overview-icon" className={TAB_ICON_CLASS} strokeWidth={2.25} />,
                content: (
                  <div key="overview-content" className="flex flex-col gap-4">
                    {latestSignal ? (
                      <CoreScoreBreakdown
                        coreScore={Number(latestSignal.coreScore)}
                        technicalScore={latestSignal.technicalScore !== null ? Number(latestSignal.technicalScore) : null}
                        chipScore={latestSignal.chipScore !== null ? Number(latestSignal.chipScore) : null}
                        chipBadge={latestSignal.chipBadge}
                      />
                    ) : (
                      <p className="text-sm text-zinc-400 dark:text-zinc-500">這檔股票目前沒有任何戰術分類歷史資料。</p>
                    )}
                    <EntryExitReferenceCard
                      data={
                        supportResistance
                          ? { ...supportResistance, foreignCostBasis, trustCostBasis }
                          : null
                      }
                    />
                    <FundamentalsSnapshotCard
                      data={
                        latestQuarterlyEps
                          ? {
                              fiscalYear: latestQuarterlyEps.fiscalYear,
                              fiscalQuarter: latestQuarterlyEps.fiscalQuarter,
                              epsCumulative: Number(latestQuarterlyEps.epsCumulative),
                              grossMarginPct: latestQuarterlyEps.grossMarginPct !== null ? Number(latestQuarterlyEps.grossMarginPct) : null,
                              operatingMarginPct:
                                latestQuarterlyEps.operatingMarginPct !== null ? Number(latestQuarterlyEps.operatingMarginPct) : null,
                              netMarginPct: latestQuarterlyEps.netMarginPct !== null ? Number(latestQuarterlyEps.netMarginPct) : null,
                            }
                          : null
                      }
                    />
                    <InstitutionalAttentionCard data={computeInstitutionalAttention(institutionalHistory)} />
                    <InvestmentThesisCard
                      data={
                        latestThesisSource
                          ? {
                              conferenceDate: latestThesisSource.conferenceDate.toISOString().slice(0, 10),
                              moatSummary: latestThesisSource.moatSummary,
                              marketShareSummary: latestThesisSource.marketShareSummary,
                              customerSummary: latestThesisSource.customerSummary,
                              catalystSummary: latestThesisSource.catalystSummary,
                            }
                          : null
                      }
                    />
                  </div>
                ),
              },
              {
                key: "price",
                label: "股價走勢",
                icon: <TrendingUp key="price-icon" className={TAB_ICON_CLASS} strokeWidth={2.25} />,
                content: <PriceTrendChart key="price-content" bars={priceBars} institutionalDays={institutionalHistory} />,
              },
              {
                key: "institutional",
                label: "三大法人",
                icon: <Landmark key="institutional-icon" className={TAB_ICON_CLASS} strokeWidth={2.25} />,
                content: <InstitutionalFlowChart key="institutional-content" days={institutionalHistory} />,
              },
              {
                key: "chip",
                label: "籌碼集中度",
                icon: <Layers key="chip-icon" className={TAB_ICON_CLASS} strokeWidth={2.25} />,
                content: <ChipConcentrationChart key="chip-content" days={chipConcentrationDays} />,
              },
              {
                key: "revenue",
                label: "營收",
                icon: <BarChart3 key="revenue-icon" className={TAB_ICON_CLASS} strokeWidth={2.25} />,
                content: (
                  <MonthlyRevenuePanel
                    key="revenue-content"
                    rows={revenueRows.map((r) => ({
                      revenueMonth: r.revenueMonth.toISOString().slice(0, 7),
                      revenue: r.revenue.toString(),
                      yoyGrowthPct: r.yoyGrowthPct !== null ? Number(r.yoyGrowthPct) : null,
                      momGrowthPct: r.momGrowthPct !== null ? Number(r.momGrowthPct) : null,
                      cumulativeYoyGrowthPct: r.cumulativeYoyGrowthPct !== null ? Number(r.cumulativeYoyGrowthPct) : null,
                    }))}
                  />
                ),
              },
              {
                key: "earningsCall",
                label: "法說會",
                icon: <Presentation key="earningsCall-icon" className={TAB_ICON_CLASS} strokeWidth={2.25} />,
                content: (
                  <EarningsCallPanel
                    key="earningsCall-content"
                    analyses={earningsCallAnalyses.map((a) => ({
                      conferenceDate: a.conferenceDate.toISOString().slice(0, 10),
                      pdfUrl: buildMopsPdfUrl(a.pdfFileName),
                      profitGrowthSummary: a.profitGrowthSummary,
                      outlookSummary: a.outlookSummary,
                      riskSummary: a.riskSummary,
                      signal: a.signal,
                      moatSummary: a.moatSummary,
                      marketShareSummary: a.marketShareSummary,
                      customerSummary: a.customerSummary,
                      catalystSummary: a.catalystSummary,
                    }))}
                  />
                ),
              },
              {
                key: "mentions",
                label: "媒體提及",
                icon: <PlaySquare key="mentions-icon" className={TAB_ICON_CLASS} strokeWidth={2.25} />,
                content: <StockMentionsPanel key="mentions-content" mentions={stockMentions} />,
              },
              {
                key: "valuation",
                label: "同業比較",
                icon: <Link2 key="valuation-icon" className={TAB_ICON_CLASS} strokeWidth={2.25} />,
                content: (
                  <ValuationSidePanel key="valuation-content" themesWithoutData={themesWithoutData} valuations={valuations} />
                ),
              },
            ]}
          />
        </div>
      </main>
    </div>
  );
}
