import { NotebookText, LogOut, Ban, Trash2 } from "lucide-react";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import type { TradeLogEntryView } from "@/lib/tradeLog/queryTradeLog";
import { SIGNAL_SOURCE_LABELS, SIDE_LABELS, STATUS_LABELS } from "@/lib/tradeLog/types";
import { closeTradeEntry, cancelTradeEntry, deleteTradeEntry } from "@/lib/tradeLog/actions";
import type { Market } from "@/generated/prisma/enums";

const STATUS_BADGE: Record<string, string> = {
  open: "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-400",
  closed: "bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400",
  cancelled: "bg-zinc-100 text-zinc-400 line-through dark:bg-white/5 dark:text-zinc-600",
};

function pnlColorClass(pnl: number | null, market: Market): string {
  if (pnl === null) return "text-zinc-400 dark:text-zinc-500";
  const up = market === "TW" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400";
  const down = market === "TW" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  return pnl > 0 ? up : pnl < 0 ? down : "text-zinc-500 dark:text-zinc-400";
}

const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-800 focus:border-zinc-400 focus:outline-none dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100";

/** 交易明細清單，含平倉/取消/刪除。平倉用<details>展開一個小表單，不用client component
 * 就能做到「預設收起、點了才展開」，跟本站其他地方（DashboardSummary的理由展開）用
 * useState不同，這裡form全部靠server action就能動，沒必要多引入client狀態。 */
export function TradeLogTable({ entries }: { entries: TradeLogEntryView[] }) {
  return (
    <Card>
      <SectionHeader icon={NotebookText} iconColor="zinc" title={`交易紀錄（${entries.length}）`} />
      {entries.length === 0 ? (
        <p className="mt-3 text-center text-sm text-zinc-400 dark:text-zinc-500">還沒有任何紀錄，用上面的表單新增第一筆。</p>
      ) : (
        <div className="mt-3 flex flex-col divide-y divide-zinc-100 dark:divide-white/10">
          {entries.map((e) => (
            <div key={e.id} className="py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {e.market}/{e.ticker}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">{SIDE_LABELS[e.side]}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[e.status]}`}>
                  {STATUS_LABELS[e.status]}
                </span>
                {e.signalSource && (
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                    {SIGNAL_SOURCE_LABELS[e.signalSource] ?? e.signalSource}
                  </span>
                )}
                <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
                  {e.entryDate} 進場 @ {e.entryPrice} × {e.quantity}
                  {e.exitDate && (
                    <>
                      {" "}
                      → {e.exitDate} 出場 @ {e.exitPrice}
                    </>
                  )}
                </span>
                {e.pnl !== null && e.pnlPct !== null && (
                  <span className={`text-sm font-semibold ${pnlColorClass(e.pnl, e.market)}`}>
                    {e.pnl >= 0 ? "+" : ""}
                    {e.pnl.toFixed(0)}（{e.pnlPct >= 0 ? "+" : ""}
                    {e.pnlPct.toFixed(1)}%）
                  </span>
                )}
              </div>

              {e.notes && <p className="mt-1 whitespace-pre-line text-xs text-zinc-500 dark:text-zinc-400">{e.notes}</p>}

              {e.status === "open" && (
                <div className="mt-2 flex items-center gap-2">
                  <details className="group">
                    <summary className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15">
                      <LogOut className="h-3 w-3" strokeWidth={2.25} />
                      平倉
                    </summary>
                    <form action={closeTradeEntry} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={e.id} />
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] text-zinc-400">出場日期</span>
                        <input type="date" name="exitDate" required className={inputClass} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] text-zinc-400">出場價</span>
                        <input type="number" step="0.01" name="exitPrice" required className={inputClass} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] text-zinc-400">出場理由（選填）</span>
                        <input name="exitNotes" className={inputClass} />
                      </label>
                      <button
                        type="submit"
                        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                      >
                        確認平倉
                      </button>
                    </form>
                  </details>

                  <form action={cancelTradeEntry}>
                    <input type="hidden" name="id" value={e.id} />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-400 dark:hover:bg-white/15"
                    >
                      <Ban className="h-3 w-3" strokeWidth={2.25} />
                      取消
                    </button>
                  </form>
                </div>
              )}

              {e.status !== "open" && (
                <form action={deleteTradeEntry} className="mt-2">
                  <input type="hidden" name="id" value={e.id} />
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
