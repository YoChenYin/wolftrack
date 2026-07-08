import type { GroupTheme } from "@/lib/valuation/groupConfig";
import type { GroupValuationResult } from "@/lib/valuation/computeGroupValuation";

function formatPct(value: number | null): string {
  if (value === null) return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatNum(value: number | null, digits = 1): string {
  return value === null ? "N/A" : value.toFixed(digits);
}

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
        {valuations.map((group) => {
          const groupHot =
            group.groupAvgReturn20d !== null &&
            group.marketAvgReturn20d !== null &&
            group.groupAvgReturn20d > group.marketAvgReturn20d;

          return (
            <div key={group.themeName} className="rounded border border-zinc-100 p-3">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium text-zinc-800">{group.themeName}</p>
                <p className="text-xs text-zinc-400">
                  族群近20日 <span className={groupHot ? "font-medium text-emerald-600" : ""}>{formatPct(group.groupAvgReturn20d)}</span>
                  {" · "}大盤 {formatPct(group.marketAvgReturn20d)}
                </p>
              </div>

              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-zinc-400">
                      <th className="pr-2 font-normal">代號</th>
                      <th className="pr-2 font-normal">PE</th>
                      <th className="pr-2 font-normal">PE百分位</th>
                      <th className="pr-2 font-normal">PB</th>
                      <th className="pr-2 font-normal">近20日</th>
                      <th className="font-normal">標記</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.members.map((m) => (
                      <tr key={m.ticker} className="border-t border-zinc-50">
                        <td className="py-1 pr-2 font-medium text-zinc-800">
                          {m.ticker}
                          {m.companyName && <span className="ml-1 font-normal text-zinc-500">{m.companyName}</span>}
                          {m.isLeader && <span className="ml-1 rounded bg-zinc-100 px-1 text-[10px] text-zinc-500">龍頭</span>}
                        </td>
                        <td className="pr-2 text-zinc-600">{formatNum(m.pe)}</td>
                        <td className="pr-2 text-zinc-600">{m.pePercentile !== null ? `${m.pePercentile.toFixed(0)}%` : "N/A"}</td>
                        <td className="pr-2 text-zinc-600">{formatNum(m.pb, 2)}</td>
                        <td className="pr-2 text-zinc-600">{formatPct(m.return20d)}</td>
                        <td>
                          {m.isLagging && (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                              供應鏈落後股
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

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
