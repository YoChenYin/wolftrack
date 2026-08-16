import Link from "next/link";
import { NotebookText } from "lucide-react";
import { Card, SubCard } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { stripCompanySuffix } from "@/lib/formatCompanyName";
import type { FundamentalsOverviewItem } from "@/lib/marketData/queryFundamentalsOverview";

const SIGNAL_STYLE: Record<string, { label: string; className: string }> = {
  positive: { label: "正面", className: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-400/10 dark:text-red-400 dark:ring-red-400/20" },
  negative: {
    label: "負面",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-400 dark:ring-emerald-400/20",
  },
  neutral: { label: "中性", className: "bg-zinc-50 text-zinc-600 ring-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:ring-white/10" },
};

/** 跨股票版的法說會基本面訊號清單，個股版見 components/tw/EarningsCallPanel.tsx。
 * 涵蓋範圍是龍頭+二軍（見 getLeaderAndSecondTierTickers），不是全市場。 */
export function FundamentalsList({ items }: { items: FundamentalsOverviewItem[] }) {
  return (
    <Card>
      <SectionHeader icon={NotebookText} iconColor="zinc" title={`法說會紀錄（${items.length}）`} />
      {items.length === 0 ? (
        <p className="mt-3 text-center text-sm text-zinc-400 dark:text-zinc-500">還沒有資料。</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {items.map((item) => {
            const style = SIGNAL_STYLE[item.signal] ?? SIGNAL_STYLE.neutral;
            return (
              <SubCard key={`${item.ticker}-${item.conferenceDate}`} className="text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/tw/stock/${item.ticker}`} className="font-semibold text-zinc-900 hover:underline dark:text-zinc-100">
                    {item.ticker}
                  </Link>
                  <span className="text-zinc-500 dark:text-zinc-400">{stripCompanySuffix(item.companyName)}</span>
                  {item.themes.slice(0, 2).map((theme) => (
                    <span key={theme} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                      {theme}
                    </span>
                  ))}
                  <span className="ml-auto text-zinc-400 dark:text-zinc-500">{item.conferenceDate}</span>
                  <span className={`rounded px-1.5 py-0.5 font-medium ring-1 ${style.className}`}>{style.label}</span>
                </div>
                <div className="mt-2 flex flex-col gap-1.5">
                  <p>
                    <span className="font-medium text-zinc-500 dark:text-zinc-400">獲利成長：</span>
                    <span className="text-zinc-700 dark:text-zinc-300">{item.profitGrowthSummary}</span>
                  </p>
                  <p>
                    <span className="font-medium text-zinc-500 dark:text-zinc-400">展望：</span>
                    <span className="text-zinc-700 dark:text-zinc-300">{item.outlookSummary}</span>
                  </p>
                  <p>
                    <span className="font-medium text-zinc-500 dark:text-zinc-400">風險：</span>
                    <span className="text-zinc-700 dark:text-zinc-300">{item.riskSummary}</span>
                  </p>
                </div>
              </SubCard>
            );
          })}
        </div>
      )}
    </Card>
  );
}
