import { prisma } from "@/lib/prisma";
import { fetchSectorTrendsGrouped } from "@/lib/trend/sectorTrendsQuery";
import { SectorTrendsBoard } from "@/components/SectorTrendsBoard";
import { VideoMentionsSection } from "@/components/youtube/VideoMentionsSection";
import { fetchRecentVideoMentions } from "@/lib/youtube/queries";
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

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
        <header>
          <h1 className="text-2xl font-bold text-zinc-900">WolfTrack TW 狼蹤台股版</h1>
          <p className="mt-1 text-sm text-zinc-500">
            每日掃描台股，依板塊分類三種戰術狀態：反轉雷達 / 蓄勢待發 / 趨勢穩健（Core Score = 50% 技術面 + 50% 籌碼面）
          </p>
        </header>

        <SectorTrendsBoard market="TW" sectors={themeOptions} themes={[]} initialData={initialData} />

        <VideoMentionsSection videos={recentVideos} />
      </main>
    </div>
  );
}
