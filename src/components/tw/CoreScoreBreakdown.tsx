import { Gauge, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";

export function CoreScoreBreakdown({
  coreScore,
  technicalScore,
  chipScore,
  chipBadge,
}: {
  coreScore: number;
  technicalScore: number | null;
  chipScore: number | null;
  chipBadge: "confirmed" | "divergence" | null;
}) {
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <SectionHeader icon={Gauge} iconColor="amber" title="Core Score" />
        <span className="font-[family:var(--font-tw-display)] text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
          {coreScore.toFixed(1)}
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <ScoreBar label="技術面 (50%)" value={technicalScore} color="bg-blue-500" />
        <ScoreBar label="籌碼面 (50%)" value={chipScore} color="bg-amber-500" />
      </div>
      {chipBadge === "confirmed" && (
        <p className="mt-3 flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.25} />
          籌碼確認 技術面與法人籌碼同步走強
        </p>
      )}
      {chipBadge === "divergence" && (
        <p className="mt-3 flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.25} />
          籌碼背離 價格續強但法人籌碼轉弱
        </p>
      )}
    </Card>
  );
}

function ScoreBar({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div>
      <div className="flex justify-between">
        <span>{label}</span>
        <span>{value !== null ? value.toFixed(1) : "N/A"}</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-zinc-100 dark:bg-white/10">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${value ?? 0}%` }} />
      </div>
    </div>
  );
}
