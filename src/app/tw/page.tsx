import { prisma } from "@/lib/prisma";
import { fetchSectorTrendsGrouped } from "@/lib/trend/sectorTrendsQuery";
import { SectorTrendsBoard } from "@/components/SectorTrendsBoard";

export default async function HomeTw() {
  const [sectors, initialData] = await Promise.all([
    prisma.sectorMapping.findMany({
      where: { market: "TW" },
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
