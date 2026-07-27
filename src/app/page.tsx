import { Construction } from "lucide-react";

// 2026-07-26：美股版暫時掛「施工中」，先集中資源在台股版。底下原本的資料抓取/SectorTrendsBoard
// 渲染邏輯保留在SectorTrendsBoard.tsx/sectorTrendsQuery.ts不動（美股批次cron照常跑，資料不會
// 斷），只是首頁暫時不渲染，之後要恢復只要把這個檔案換回原本呼叫fetchSectorTrendsGrouped+
// SectorTrendsBoard的版本即可（見git history）。
export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6">
      <div className="flex max-w-md flex-col items-center text-center">
        <Construction className="h-10 w-10 text-amber-500" strokeWidth={1.75} />
        <h1 className="mt-4 text-xl font-bold text-zinc-900">美股版施工中</h1>
        <p className="mt-2 text-sm text-zinc-500">
          目前開發資源集中在台股版，美股版的戰術訊號/籌碼分析正在重新設計中，之後會回來。
        </p>
        <a
          href="/tw"
          className="mt-6 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          前往台股版 →
        </a>
      </div>
    </div>
  );
}
