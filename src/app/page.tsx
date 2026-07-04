import { prisma } from "@/lib/prisma";
import { fetchSectorTrendsGrouped } from "@/lib/trend/sectorTrendsQuery";
import { SectorTrendsBoard } from "@/components/SectorTrendsBoard";

export default async function Home() {
  const [sectors, themes, initialData] = await Promise.all([
    prisma.sectorMapping.findMany({
      where: { market: "US" },
      orderBy: { displayOrder: "asc" },
      select: { sectorCode: true, sectorName: true, sectorNameZh: true },
    }),
    prisma.theme.findMany({
      orderBy: { displayOrder: "asc" },
      select: { themeCode: true, themeName: true, themeNameZh: true },
    }),
    fetchSectorTrendsGrouped({ market: "US", sectorCode: "all", themeCode: "all" }),
  ]);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
        <header>
          <h1 className="text-2xl font-bold text-zinc-900">WolfTrack 狼蹤</h1>
          <p className="mt-1 text-sm text-zinc-500">
            每日掃描美股，依板塊分類三種戰術狀態：反轉雷達 / 蓄勢待發 / 趨勢穩健
          </p>
        </header>

        <SectorTrendsBoard market="US" sectors={sectors} themes={themes} initialData={initialData} />
      </main>
    </div>
  );
}
