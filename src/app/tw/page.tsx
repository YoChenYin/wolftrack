import { prisma } from "@/lib/prisma";
import { fetchSectorTrendsGrouped } from "@/lib/trend/sectorTrendsQuery";
import { getBacktestBadgeStats } from "@/lib/trend/tw/backtestSummary";
import { SectorTrendsBoard } from "@/components/SectorTrendsBoard";
import { TwSectionNav } from "@/components/tw/TwSectionNav";
import {
  listAllThemeNames,
  getAllThemedTickers,
  findIndustryThemeByName,
  UNCATEGORIZED_THEME_CODE,
} from "@/lib/valuation/groupConfig";

// 這個頁面直接查資料庫顯示每日更新的訊號，不能被當成靜態頁面在 build time 凍結一份快照
export const dynamic = "force-dynamic";

export default async function HomeTw({ searchParams }: { searchParams: Promise<{ sector?: string }> }) {
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

  // 2026-08-18：從/tw/chains的板塊熱圖點主題會導到 /tw?sector=X，這裡讀query param當初始篩選
  const { sector: sectorParam } = await searchParams;

  const initialData = await fetchSectorTrendsGrouped({ market: "TW", sectorCode: sectorParam ?? "all", themeCode: "all" });

  // 2026-08-21新增：戰術訊號回測結果（見backtestSummary.ts），拿真實勝率/超額報酬取代原本
  // 靜態的「效果未驗證」badge——跟sector/theme篩選無關，只查一次當靜態prop往下傳，不用像
  // initialData那樣每次切換篩選都重新查
  const backtestStats = Object.fromEntries(await getBacktestBadgeStats());

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
            每日掃描台股，依投信/外資籌碼流分類多空戰術狀態：
            <span className="font-medium text-zinc-700 dark:text-zinc-300">投信轉買 / 投信外資合買 / 逢低布局</span>
            （多方）與
            <span className="font-medium text-zinc-700 dark:text-zinc-300">投信轉賣 / 投信外資合賣</span>
            （空方）
          </p>
          <div className="mt-4">
            <TwSectionNav />
          </div>
        </header>

        <div className="tw-reveal" style={{ animationDelay: "80ms" }}>
          <SectorTrendsBoard market="TW" sectors={themeOptions} themes={[]} initialData={initialData} backtestStats={backtestStats} />
        </div>

        {/* 2026-08-16：「網紅視角」/「網紅視角總覽」先從首頁隱藏（使用者要求）。元件跟
            youtube-mention 的資料抓取/解析pipeline都還在，之後要恢復只要把這兩個區塊跟
            上面 import/fetchRecentVideoMentions()/fetchStockMentionOverview() 加回來即可。 */}
      </main>
    </div>
  );
}
