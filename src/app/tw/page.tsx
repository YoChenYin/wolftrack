import { prisma } from "@/lib/prisma";
import { fetchSectorTrendsGrouped } from "@/lib/trend/sectorTrendsQuery";
import { SectorTrendsBoard } from "@/components/SectorTrendsBoard";
import { VideoMentionsSection } from "@/components/youtube/VideoMentionsSection";
import { StockMentionOverviewSection } from "@/components/youtube/StockMentionOverviewSection";
import { fetchRecentVideoMentions, fetchStockMentionOverview } from "@/lib/youtube/queries";
import {
  listAllThemeNames,
  getAllThemedTickers,
  findIndustryThemeByName,
  UNCATEGORIZED_THEME_CODE,
} from "@/lib/valuation/groupConfig";

// 這個頁面直接查資料庫顯示每日更新的訊號，不能被當成靜態頁面在 build time 凍結一份快照
export const dynamic = "force-dynamic";

export default async function HomeTw() {
  const activeTickers = await prisma.stock.findMany({
    where: { market: "TW", isActive: true, ticker: { not: "TAIEX" } },
    select: { ticker: true },
  });
  const activeTickerSet = new Set(activeTickers.map((s) => s.ticker));

  // 2026-07-09：板塊篩選改用 group_config.json 的 theme_name（比 TWSE 官方產業別更貼近使用者
  // 實際想篩的供應鏈/概念族群），theme_name 本身當篩選代號用。只列出「至少有1檔追蹤中股票」的
  // theme，並額外加「未分類」選項給沒被任何 theme 收錄的股票（見 sectorTrendsQuery.ts 的
  // buildStockFilter，UNCATEGORIZED_THEME_CODE 是特殊值）。
  const themedTickers = getAllThemedTickers();
  const uncategorizedCount = [...activeTickerSet].filter((t) => !themedTickers.has(t)).length;

  const themeOptions = listAllThemeNames()
    .filter((name) => {
      const theme = findIndustryThemeByName(name);
      return theme?.members.some((m) => activeTickerSet.has(m)) ?? false;
    })
    .map((name) => ({ sectorCode: name, sectorName: name, sectorNameZh: name }));

  if (uncategorizedCount > 0) {
    themeOptions.push({
      sectorCode: UNCATEGORIZED_THEME_CODE,
      sectorName: "Uncategorized",
      sectorNameZh: `未分類（${uncategorizedCount}）`,
    });
  }

  const initialData = await fetchSectorTrendsGrouped({ market: "TW", sectorCode: "all", themeCode: "all" });
  const recentVideos = await fetchRecentVideoMentions();
  const stockMentionOverview = await fetchStockMentionOverview();

  return (
    <div
      className="relative flex flex-1 flex-col overflow-hidden font-[family:var(--font-tw-sans)]"
      style={{
        background:
          "radial-gradient(1200px 480px at 15% -10%, rgba(180,83,9,0.08), transparent 60%), radial-gradient(900px 500px at 100% 0%, rgba(180,83,9,0.05), transparent 55%), #fafaf9",
      }}
    >
      <main className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
        <header className="tw-reveal">
          <div className="flex items-baseline gap-3">
            <h1
              className="font-[family:var(--font-tw-display)] text-3xl font-semibold tracking-tight text-zinc-900"
              style={{
                backgroundImage: "linear-gradient(100deg, #78350f, #b45309 55%, #78350f)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              狼蹤台股版
            </h1>
            <span className="font-[family:var(--font-tw-mono)] text-xs font-medium tracking-wide text-amber-800/60">
              WOLFTRACK · TW
            </span>
          </div>
          <div className="mt-2 h-px w-24 bg-gradient-to-r from-amber-700/50 to-transparent" />
          <p className="mt-3 max-w-2xl text-sm text-zinc-500">
            每日掃描台股，依投信/外資籌碼流分類三種戰術狀態：
            <span className="font-medium text-zinc-700">進場 / 出場 / 逢低布局</span>
            （Core Score = 50% 技術面 + 50% 籌碼面）
          </p>
        </header>

        <div className="tw-reveal" style={{ animationDelay: "80ms" }}>
          <SectorTrendsBoard market="TW" sectors={themeOptions} themes={[]} initialData={initialData} />
        </div>

        <div className="tw-reveal" style={{ animationDelay: "140ms" }}>
          <StockMentionOverviewSection items={stockMentionOverview} />
        </div>
        <div className="tw-reveal" style={{ animationDelay: "200ms" }}>
          <VideoMentionsSection videos={recentVideos} />
        </div>
      </main>
    </div>
  );
}
