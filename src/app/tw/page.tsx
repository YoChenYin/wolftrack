import { prisma } from "@/lib/prisma";
import { fetchSectorTrendsGrouped } from "@/lib/trend/sectorTrendsQuery";
import { SectorTrendsBoard } from "@/components/SectorTrendsBoard";

// 這個頁面直接查資料庫顯示每日更新的訊號，不能被當成靜態頁面在 build time 凍結一份快照
export const dynamic = "force-dynamic";

export default async function HomeTw() {
  const [sectors, initialData] = await Promise.all([
    prisma.sectorMapping.findMany({
      // 2026-07-09 股票池收斂成科技+金融股後，傳統產業板塊底下的股票都被軟移除（isActive=false），
      // 板塊本身沒刪（歷史資料/未來要恢復都還在），但篩選下拉選單只顯示「還有股票在追蹤」的板塊，
      // 不然會列出一堆選了也是空清單的板塊（水泥/食品/紡織…）
      where: { market: "TW", stocks: { some: { isActive: true } } },
      orderBy: { displayOrder: "asc" },
      select: { sectorCode: true, sectorName: true, sectorNameZh: true },
    }),
    fetchSectorTrendsGrouped({ market: "TW", sectorCode: "all", themeCode: "all" }),
  ]);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
        <header>
          <h1 className="text-2xl font-bold text-zinc-900">WolfTrack TW 狼蹤台股版</h1>
          <p className="mt-1 text-sm text-zinc-500">
            每日掃描台股，依板塊分類三種戰術狀態：反轉雷達 / 蓄勢待發 / 趨勢穩健（Core Score = 50% 技術面 + 50% 籌碼面）
          </p>
        </header>

        <SectorTrendsBoard market="TW" sectors={sectors} themes={[]} initialData={initialData} />
      </main>
    </div>
  );
}
