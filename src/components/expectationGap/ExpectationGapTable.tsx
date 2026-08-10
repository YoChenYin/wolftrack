import { FileSearch, CheckCircle2, Trash2 } from "lucide-react";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import type { ExpectationGapNoteView } from "@/lib/expectationGap/queryExpectationGap";
import { VARIANCE_DRIVER_LABELS, STATUS_LABELS } from "@/lib/expectationGap/types";
import { resolveExpectationGapNote, deleteExpectationGapNote } from "@/lib/expectationGap/actions";
import type { Market } from "@/generated/prisma/enums";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-400",
  confirmed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400",
  invalidated: "bg-rose-50 text-rose-500 line-through dark:bg-rose-400/10 dark:text-rose-400/70",
};

function pctColorClass(value: number | null, market: Market): string {
  if (value === null) return "text-zinc-400 dark:text-zinc-500";
  const up = market === "TW" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400";
  const down = market === "TW" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  return value > 0 ? up : value < 0 ? down : "text-zinc-500 dark:text-zinc-400";
}

function formatPct(value: number | null): string {
  if (value === null) return "N/A";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-800 focus:border-zinc-400 focus:outline-none dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100";

export function ExpectationGapTable({ notes }: { notes: ExpectationGapNoteView[] }) {
  return (
    <Card>
      <SectionHeader icon={FileSearch} iconColor="violet" title={`預期差筆記（${notes.length}）`} />
      {notes.length === 0 ? (
        <p className="mt-3 text-center text-sm text-zinc-400 dark:text-zinc-500">還沒有任何筆記，用上面的表單記錄第一筆判斷。</p>
      ) : (
        <div className="mt-3 flex flex-col divide-y divide-zinc-100 dark:divide-white/10">
          {notes.map((n) => (
            <div key={n.id} className="py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {n.market}/{n.ticker}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[n.status]}`}>
                  {STATUS_LABELS[n.status]}
                </span>
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                  {VARIANCE_DRIVER_LABELS[n.varianceDriver] ?? n.varianceDriver}
                </span>
                <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">{n.noteDate}</span>
              </div>

              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{n.thesis}</p>

              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                <span>
                  目前股價 <span className="font-medium text-zinc-700 dark:text-zinc-200">{n.currentPrice}</span>
                </span>
                {n.ownEps !== null && n.ownTargetPe !== null && (
                  <span>
                    自估目標價{" "}
                    <span className="font-medium text-zinc-700 dark:text-zinc-200">
                      {n.ownTargetPrice?.toFixed(1)}
                    </span>
                    （EPS {n.ownEps} × PE {n.ownTargetPe}）
                  </span>
                )}
                {n.upsideFromCurrentPct !== null && (
                  <span>
                    潛在空間 <span className={`font-semibold ${pctColorClass(n.upsideFromCurrentPct, n.market)}`}>{formatPct(n.upsideFromCurrentPct)}</span>
                  </span>
                )}
                {n.consensusTargetPrice !== null && (
                  <span>
                    市場共識目標價 <span className="font-medium text-zinc-700 dark:text-zinc-200">{n.consensusTargetPrice}</span>
                  </span>
                )}
                {n.targetPriceVariancePct !== null && (
                  <span>
                    目標價預期差{" "}
                    <span className={`font-semibold ${pctColorClass(n.targetPriceVariancePct, n.market)}`}>{formatPct(n.targetPriceVariancePct)}</span>
                  </span>
                )}
                {n.epsVariancePct !== null && (
                  <span>
                    EPS預期差 <span className={`font-semibold ${pctColorClass(n.epsVariancePct, n.market)}`}>{formatPct(n.epsVariancePct)}</span>
                  </span>
                )}
              </div>

              {n.outcomeNote && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">後續：{n.outcomeNote}</p>}

              {n.status === "active" ? (
                <div className="mt-2">
                  <details className="group">
                    <summary className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15">
                      標記結果
                    </summary>
                    <form action={resolveExpectationGapNote} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={n.id} />
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] text-zinc-400">結果</span>
                        <select name="status" required className={inputClass}>
                          <option value="confirmed">預期差兌現</option>
                          <option value="invalidated">預期差失效</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] text-zinc-400">後續說明（選填）</span>
                        <input name="outcomeNote" className={inputClass} />
                      </label>
                      <button
                        type="submit"
                        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                      >
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                          確認
                        </span>
                      </button>
                    </form>
                  </details>
                </div>
              ) : (
                <form action={deleteExpectationGapNote} className="mt-2">
                  <input type="hidden" name="id" value={n.id} />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:bg-white/10 dark:text-zinc-500 dark:hover:bg-rose-400/10 dark:hover:text-rose-400"
                  >
                    <Trash2 className="h-3 w-3" strokeWidth={2.25} />
                    刪除
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
