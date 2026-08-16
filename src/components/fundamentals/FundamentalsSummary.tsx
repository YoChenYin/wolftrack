import { Presentation } from "lucide-react";
import { Card, SubCard } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import type { FundamentalsOverview } from "@/lib/marketData/queryFundamentalsOverview";

export function FundamentalsSummary({ overview }: { overview: FundamentalsOverview }) {
  const { positive, neutral, negative } = overview.signalCounts;
  const total = positive + neutral + negative;

  return (
    <Card>
      <SectionHeader icon={Presentation} iconColor="violet" title={`近${overview.asOfMonths}個月法說會訊號分布`} />
      <div className="mt-3 grid grid-cols-3 gap-2">
        <SubCard>
          <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">正面</p>
          <p className="mt-0.5 text-lg font-semibold text-red-600 dark:text-red-400">{positive}</p>
        </SubCard>
        <SubCard>
          <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">中性</p>
          <p className="mt-0.5 text-lg font-semibold text-zinc-500 dark:text-zinc-400">{neutral}</p>
        </SubCard>
        <SubCard>
          <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">負面</p>
          <p className="mt-0.5 text-lg font-semibold text-emerald-600 dark:text-emerald-400">{negative}</p>
        </SubCard>
      </div>
      {total === 0 && (
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">近{overview.asOfMonths}個月還沒有解析出法說會訊號，排程更新後會出現在這裡。</p>
      )}
    </Card>
  );
}
