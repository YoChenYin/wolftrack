import type { GroupTheme } from "@/lib/valuation/groupConfig";
import type { GroupValuationResult } from "@/lib/valuation/computeGroupValuation";
import { GroupValuationTable } from "./GroupValuationTable";

/**
 * 供應鏈估值比較 side panel（docs/wolftrack-tw-spec.md 第四章）。
 * 動線：熱門龍頭股 → 點進個股頁 → 自動帶出同族群還沒漲的落後股。
 * PE/PB 來自 TWSE BWIBBU_ALL 快照，20日報酬率算自 tw_daily_price 真實股價
 * （只有 TWSE 上市、且已回填的股票才有資料，上櫃股/未回填股票會顯示 N/A，不計入落後股篩選）。
 */
export function ValuationSidePanel({
  themesWithoutData,
  valuations,
}: {
  /** 沒有 members 清單的 theme（骨架還沒補股票代號） */
  themesWithoutData: GroupTheme[];
  valuations: GroupValuationResult[];
}) {
  if (themesWithoutData.length === 0 && valuations.length === 0) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">供應鏈估值比較</h2>
        <p className="mt-2 text-xs text-zinc-400">這檔股票目前沒有被歸類進任何供應鏈概念股族群。</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-zinc-900">供應鏈估值比較</h2>
      <div className="mt-3 flex flex-col gap-4">
        {valuations.map((group) => (
          <GroupValuationTable key={group.themeName} group={group} />
        ))}

        {themesWithoutData.map((theme) => (
          <div key={theme.theme_name} className="rounded border border-zinc-100 p-3">
            <p className="text-sm font-medium text-zinc-800">{theme.theme_name}</p>
            <p className="mt-1 text-xs text-zinc-400">此族群成員清單還沒建置，暫時無法比較估值。</p>
          </div>
        ))}
      </div>
    </section>
  );
}
