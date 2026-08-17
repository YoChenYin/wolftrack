import { ChainSignalLights } from "@/components/tw/ChainSignalLights";
import { ChainRotationChart } from "@/components/tw/ChainRotationChart";
import { ThemeFlowChart } from "@/components/tw/ThemeFlowChart";
import { ThemeHeatmapWithNavigation } from "@/components/tw/ThemeHeatmapWithNavigation";
import { TwSectionNav } from "@/components/tw/TwSectionNav";

// 這個頁面直接查資料庫顯示每日更新的訊號，不能被當成靜態頁面在 build time 凍結一份快照
export const dynamic = "force-dynamic";

/** 2026-08-18：從 /tw 拆出來的「產業鏈」分頁——燈號/資金輪動/資金流動/熱圖都是不受個股篩選
 * 影響的全市場總覽，跟 /tw 的「依板塊篩選選股結果」是不同層次的資訊，拆開後兩邊都不用一直捲動。 */
export default function TwChainsPage() {
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
              產業鏈
            </h1>
            <span className="font-[family:var(--font-tw-mono)] text-xs font-medium tracking-wide text-amber-800/60 dark:text-amber-400/70">
              WOLFTRACK · CHAINS
            </span>
          </div>
          <div className="mt-2 h-px w-24 bg-gradient-to-r from-amber-700/50 to-transparent dark:from-amber-400/40" />
          <p className="mt-3 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
            全市場總覽：產業鏈訊號燈號、資金輪動、板塊資金流動、板塊熱圖——不受選股頁的篩選影響。點熱圖裡的主題會跳到選股頁並套用該篩選。
          </p>
          <div className="mt-4">
            <TwSectionNav />
          </div>
        </header>

        <div className="tw-reveal flex flex-col gap-4" style={{ animationDelay: "80ms" }}>
          <ChainSignalLights />
          <ChainRotationChart />
          <ThemeFlowChart />
          <ThemeHeatmapWithNavigation />
        </div>
      </main>
    </div>
  );
}
