import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { findIndustryThemesForTicker } from "@/lib/valuation/groupConfig";
import { computeGroupValuation } from "@/lib/valuation/computeGroupValuation";
import { CoreScoreBreakdown } from "@/components/tw/CoreScoreBreakdown";
import { ValuationSidePanel } from "@/components/tw/ValuationSidePanel";

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

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
        <header>
          <p className="text-sm text-zinc-500">{stock.sector.sectorNameZh ?? stock.sector.sectorName}</p>
          <h1 className="text-2xl font-bold text-zinc-900">
            {stock.ticker} {stock.companyName}
          </h1>
        </header>

        {latestSignal ? (
          <>
            <p className="text-xs text-zinc-400">資料日期（as of）：{latestSignal.tradeDate.toISOString().slice(0, 10)}</p>
            <CoreScoreBreakdown
              coreScore={Number(latestSignal.coreScore)}
              technicalScore={latestSignal.technicalScore !== null ? Number(latestSignal.technicalScore) : null}
              chipScore={latestSignal.chipScore !== null ? Number(latestSignal.chipScore) : null}
              chipBadge={latestSignal.chipBadge}
            />
          </>
        ) : (
          <p className="text-sm text-zinc-400">這檔股票目前沒有任何戰術分類歷史資料。</p>
        )}

        <ValuationSidePanel themesWithoutData={themesWithoutData} valuations={valuations} />
      </main>
    </div>
  );
}
