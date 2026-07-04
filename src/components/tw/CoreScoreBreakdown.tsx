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
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">Core Score</h2>
        <span className="text-2xl font-bold text-zinc-900">{coreScore.toFixed(1)}</span>
      </div>
      <div className="mt-3 flex flex-col gap-2 text-xs text-zinc-500">
        <ScoreBar label="技術面 (50%)" value={technicalScore} color="bg-blue-500" />
        <ScoreBar label="籌碼面 (50%)" value={chipScore} color="bg-amber-500" />
      </div>
      {chipBadge === "confirmed" && (
        <p className="mt-3 text-xs font-medium text-emerald-600">籌碼確認 ✅ 技術面與法人籌碼同步走強</p>
      )}
      {chipBadge === "divergence" && (
        <p className="mt-3 text-xs font-medium text-amber-600">籌碼背離 ⚠️ 價格續強但法人籌碼轉弱</p>
      )}
    </section>
  );
}

function ScoreBar({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div>
      <div className="flex justify-between">
        <span>{label}</span>
        <span>{value !== null ? value.toFixed(1) : "N/A"}</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-zinc-100">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${value ?? 0}%` }} />
      </div>
    </div>
  );
}
