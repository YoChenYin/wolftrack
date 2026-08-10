import { Target } from "lucide-react";
import { Card, SubCard } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import type { ExpectationGapNoteView } from "@/lib/expectationGap/queryExpectationGap";

/** 判斷準不準的真實紀錄：預期差最終「兌現」還是「失效」，不是backtest也不是市場報酬，
 * 是研究判斷本身的命中率——這是法人研究員自我校準的核心指標。 */
export function ExpectationGapSummary({ notes }: { notes: ExpectationGapNoteView[] }) {
  const active = notes.filter((n) => n.status === "active").length;
  const confirmed = notes.filter((n) => n.status === "confirmed").length;
  const invalidated = notes.filter((n) => n.status === "invalidated").length;
  const resolved = confirmed + invalidated;
  const hitRate = resolved > 0 ? (confirmed / resolved) * 100 : null;

  return (
    <Card>
      <SectionHeader icon={Target} iconColor="amber" title="預期差判斷命中率" />
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SubCard>
          <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">追蹤中</p>
          <p className="mt-0.5 text-lg font-semibold text-zinc-800 dark:text-zinc-100">{active}</p>
        </SubCard>
        <SubCard>
          <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">兌現</p>
          <p className="mt-0.5 text-lg font-semibold text-emerald-600 dark:text-emerald-400">{confirmed}</p>
        </SubCard>
        <SubCard>
          <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">失效</p>
          <p className="mt-0.5 text-lg font-semibold text-rose-600 dark:text-rose-400">{invalidated}</p>
        </SubCard>
        <SubCard>
          <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">命中率</p>
          <p className="mt-0.5 text-lg font-semibold text-zinc-800 dark:text-zinc-100">
            {hitRate !== null ? `${hitRate.toFixed(0)}%` : "—"}
          </p>
        </SubCard>
      </div>
      {resolved === 0 && (
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">還沒有已結案的筆記，累積幾筆並標記結果之後這裡會出現命中率。</p>
      )}
    </Card>
  );
}
