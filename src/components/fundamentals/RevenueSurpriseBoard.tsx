import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { InfoTooltip } from "../InfoTooltip";
import { twReturnColor } from "@/lib/tw/color";
import { stripCompanySuffix } from "@/lib/formatCompanyName";
import type { RevenueSurpriseBoard as Board, RevenueSurpriseRow } from "@/lib/trend/tw/revenueSurprise";

function formatPct(v: number | null, digits = 1): string {
  if (v === null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

/** 營收單位是千元，顯示成億元 */
function formatYi(thousands: number): string {
  return (thousands / 100_000).toFixed(thousands >= 1_000_000 ? 0 : 1);
}

function SurpriseList({ title, rows }: { title: string; rows: RevenueSurpriseRow[] }) {
  return (
    <div className="min-w-0">
      <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-6 text-sm text-zinc-400 dark:text-zinc-500">目前沒有</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-[11px] text-zinc-400 dark:text-zinc-500">
                <th className="pb-1 pr-2 font-normal">公司</th>
                <th className="px-2 pb-1 text-right font-normal">營收／預期（億）</th>
                <th className="px-2 pb-1 text-right font-normal">驚喜</th>
                <th className="px-2 pb-1 text-right font-normal">年增</th>
                <th className="pb-1 pl-2 text-right font-normal">公布期間股價</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ticker} className="border-t border-zinc-100 dark:border-white/5">
                  <td className="py-1.5 pr-2">
                    <Link href={`/tw/stock/${r.ticker}`} className="hover:underline">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">{stripCompanySuffix(r.companyName)}</span>{" "}
                      <span className="font-[family:var(--font-tw-mono)] text-[11px] text-zinc-400 dark:text-zinc-500">{r.ticker}</span>
                    </Link>
                    {r.allTimeHigh && (
                      <span className="ml-1.5 rounded bg-red-50 px-1 py-px text-[10px] font-medium text-red-700 dark:bg-red-400/10 dark:text-red-300">
                        歷史新高
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right font-[family:var(--font-tw-mono)] tabular-nums text-zinc-600 dark:text-zinc-400">
                    {formatYi(r.revenue)} <span className="text-zinc-300 dark:text-zinc-600">/</span> {formatYi(r.expectedRevenue)}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-[family:var(--font-tw-mono)] font-semibold tabular-nums ${twReturnColor(r.surprisePct)}`}>
                    {formatPct(r.surprisePct)}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-[family:var(--font-tw-mono)] tabular-nums ${twReturnColor(r.yoyPct)}`}>
                    {formatPct(r.yoyPct, 0)}
                  </td>
                  <td className={`py-1.5 pl-2 text-right font-[family:var(--font-tw-mono)] tabular-nums ${twReturnColor(r.reactionExcessPct)}`}>
                    {formatPct(r.reactionExcessPct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * 營收驚喜榜（零LLM成本）：最新一個月營收跟「季節性+近期趨勢」推估的預期比，好/差最多的公司，
 * 以及營收公布期間股價（扣掉大盤）怎麼反應。說明裡如實寫回測結論，不包裝成補漲推薦。
 */
export function RevenueSurpriseBoard({ board }: { board: Board }) {
  return (
    <Card>
      <SectionHeader
        icon={Sparkles}
        iconColor="rose"
        title={board.month ? `營收驚喜榜｜${board.month}` : "營收驚喜榜"}
        tooltip={
          <InfoTooltip>
            預期營收＝去年同月營收 ×「公布前3個月」的年增倍數，同時考慮季節性跟近期趨勢；驚喜＝實際營收比預期多/少幾%。公布期間股價＝營收月份的次月1日到公布期限（11日）股價漲跌，扣掉同期加權指數。歷史回測：大幅驚喜（≥15%）之後40個交易日的超額報酬，只在近一年多頭期間明顯，更早的期間跟一般公司差不多；「股價還沒反應的會補漲」在不同期間結論相反，不成立。這張表只呈現事實，不代表之後的漲跌。只列月營收1億元以上的公司。
          </InfoTooltip>
        }
      />
      {board.month === null ? (
        <p className="mt-3 text-sm text-zinc-400 dark:text-zinc-500">還沒有月營收資料</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">已公布且可比較的公司 {board.reportedCount} 家，營收單位為億元</p>
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <SurpriseList title="比預期好最多" rows={board.beats} />
            <SurpriseList title="比預期差最多" rows={board.misses} />
          </div>
        </>
      )}
    </Card>
  );
}
