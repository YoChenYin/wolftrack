import type { GroupValuationResult } from "@/lib/valuation/computeGroupValuation";
import { stripCompanySuffix } from "@/lib/formatCompanyName";
import { InfoTooltip } from "../InfoTooltip";

function formatPct(value: number | null): string {
  if (value === null) return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatNum(value: number | null, digits = 1): string {
  return value === null ? "N/A" : value.toFixed(digits);
}

/** 鏈位階配色，跟 ThemeHeatmap.tsx 用同一套（上游藍/中游紫/下游橘/支援層灰） */
const STAGE_COLORS: Record<string, string> = {
  upstream: "bg-blue-50 text-blue-700",
  midstream: "bg-violet-50 text-violet-700",
  downstream: "bg-amber-50 text-amber-700",
  support: "bg-zinc-100 text-zinc-600",
};

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
        <p className="text-sm font-medium text-zinc-800">
          {group.themeName}
          {group.chainStages.map((s) => (
            <span
              key={`${s.chainName}-${s.stageKey}`}
              className={`ml-1.5 rounded px-1 py-0.5 text-[10px] font-normal ${STAGE_COLORS[s.stageKey] ?? "bg-zinc-100 text-zinc-500"}`}
            >
              {s.chainName}·{s.label.split("：")[0]}
            </span>
          ))}
        </p>
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
              <th className="pr-2 font-normal">
                PE
                <InfoTooltip>
                  本益比（股價 ÷ 每股盈餘）。數字越高代表市場願意為每一塊錢獲利付出越多錢，通常反映「越貴」或市場對成長性的預期越高。資料來源：TWSE BWIBBU_ALL（上市股）或
                  FinMind（上櫃股）最新快照。
                </InfoTooltip>
              </th>
              <th className="pr-2 font-normal">
                PE百分位
                <InfoTooltip>
                  把這檔股票的PE拿去跟同一個板塊裡其他成員排名，換算成0~100百分位：0=族群裡最便宜，100=族群裡最貴。是跟「同族群」比，不是跟大盤比。只有0~1檔有效資料時無法排名，顯示50（中性值）。
                </InfoTooltip>
              </th>
              <th className="pr-2 font-normal">
                PB
                <InfoTooltip>
                  股價淨值比（股價 ÷ 每股淨值/帳面價值）。PE看獲利、PB看資產面，兩者搭配比較不會被短期獲利波動誤導。
                </InfoTooltip>
              </th>
              <th className="pr-2 font-normal">
                近20日
                <InfoTooltip align="right">
                  近20個交易日的真實股價報酬率 =（今天收盤−20日前收盤）÷20日前收盤×100%。上方「族群近20日」是這個族群所有有資料成員的平均，拿去跟大盤（加權指數）近20日比較，判斷這個題材是否比大盤熱。
                </InfoTooltip>
              </th>
              <th className="font-normal">
                標記
                <InfoTooltip align="right">
                  「供應鏈落後股」同時符合：①
                  PE百分位≤30%（族群裡算便宜）②族群平均近20日報酬&gt;大盤近20日報酬（題材整體在噴）③這檔近20日報酬&lt;族群平均（但自己還沒跟上）。意思是「族群在噴、這檔還便宜、但漲勢落後同伴」，不是買賣建議。
                </InfoTooltip>
              </th>
            </tr>
          </thead>
          <tbody>
            {group.members.map((m) => (
              <tr key={m.ticker} className="border-t border-zinc-50">
                <td className="py-1 pr-2 font-medium text-zinc-800">
                  {m.ticker}
                  {m.companyName && <span className="ml-1 font-normal text-zinc-500">{stripCompanySuffix(m.companyName)}</span>}
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
