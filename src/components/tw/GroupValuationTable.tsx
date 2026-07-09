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
 * 單一族群的 PE/PB 估值比較表格（代號/PE/PE百分位/PB/近20日/落後股標記）。
 * 抽成獨立元件因為個股詳情頁的供應鏈估值比較（ValuationSidePanel）和首頁選板塊後顯示的
 * 族群估值表（SectorTrendsBoard）都要用同一份表格，不想維護兩份重複的 JSX。
 */
export function GroupValuationTable({ group }: { group: GroupValuationResult }) {
  const groupHot =
    group.groupAvgReturn20d !== null &&
    group.marketAvgReturn20d !== null &&
    group.groupAvgReturn20d > group.marketAvgReturn20d;

  return (
    <div className="rounded border border-zinc-100 p-3">
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
}
