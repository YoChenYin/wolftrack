"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  ENTRY_SIGNAL_LABEL,
  TRACK_RECORD_EXIT_RULE,
  exitSignalLabel,
  type EntrySignal,
  type TrackRecordTrade,
  type TradeStatus,
} from "@/lib/trend/tw/trackRecordMeta";
import { twReturnColor } from "@/lib/tw/color";
import { stripCompanySuffix } from "@/lib/formatCompanyName";

type StatusFilter = "all" | TradeStatus;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "closed", label: "已出場" },
  { value: "open", label: "持有中" },
  { value: "pendingEntry", label: "待進場" },
];

function formatPct(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatPrice(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

/** 日期只顯示月/日，年份都是同一年，省欄寬 */
function formatDate(date: string | null): string {
  return date ? date.slice(5).replace("-", "/") : "—";
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-zinc-400 dark:hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function StatusPill({ trade }: { trade: TrackRecordTrade }) {
  if (trade.status === "closed") {
    return <span className="text-[11px] text-zinc-400 dark:text-zinc-500">已出場</span>;
  }
  if (trade.status === "pendingEntry") {
    return (
      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400">
        明日開盤進場
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-400/10 dark:text-amber-400">
      {trade.exitSignal ? "明日開盤出場" : "持有中"}
    </span>
  );
}

function SignalCell({ label, date, reason }: { label: string | null; date: string | null; reason: string | null }) {
  if (!label) return <span className="text-zinc-300 dark:text-zinc-600">—</span>;
  return (
    <div title={reason ?? undefined} className={reason ? "cursor-help" : undefined}>
      <p className="font-medium text-zinc-700 dark:text-zinc-300">{label}</p>
      <p className="font-[family:var(--font-tw-mono)] text-[11px] text-zinc-400 dark:text-zinc-500">訊號 {formatDate(date)}</p>
    </div>
  );
}

/** 逐筆交易表：狀態/進場訊號兩組篩選，預設依進場訊號日期新到舊（伺服器端已排好） */
export function TrackRecordTable({ trades }: { trades: TrackRecordTrade[] }) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [signal, setSignal] = useState<EntrySignal | "all">("all");

  const filtered = useMemo(
    () => trades.filter((t) => (status === "all" || t.status === status) && (signal === "all" || t.entrySignal === signal)),
    [trades, status, signal]
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <FilterChip key={f.value} active={status === f.value} onClick={() => setStatus(f.value)}>
              {f.label}
            </FilterChip>
          ))}
        </div>
        <span className="hidden h-4 w-px bg-zinc-200 sm:block dark:bg-white/10" />
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={signal === "all"} onClick={() => setSignal("all")}>
            所有訊號
          </FilterChip>
          {(Object.keys(ENTRY_SIGNAL_LABEL) as EntrySignal[]).map((s) => (
            <FilterChip key={s} active={signal === s} onClick={() => setSignal(s)}>
              {ENTRY_SIGNAL_LABEL[s]}
            </FilterChip>
          ))}
        </div>
        <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">{filtered.length} 筆</span>
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-400 dark:text-zinc-500">目前沒有符合條件的交易</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-[11px] font-medium text-zinc-400 dark:border-white/10 dark:text-zinc-500">
                <th className="sticky left-0 z-10 bg-white py-2 pr-3 font-medium dark:bg-zinc-900">股票</th>
                <th className="px-3 py-2 font-medium">進場訊號</th>
                <th className="px-3 py-2 text-right font-medium">進場日／買入價</th>
                <th className="px-1 py-2" aria-hidden />
                <th className="px-3 py-2 font-medium">出場訊號</th>
                <th className="px-3 py-2 text-right font-medium">出場日／賣出價</th>
                <th className="px-3 py-2 text-right font-medium">持有</th>
                <th className="px-3 py-2 text-right font-medium">報酬率</th>
                <th className="px-3 py-2 text-right font-medium">vs 大盤</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/10">
              {filtered.map((t) => (
                <tr key={`${t.ticker}-${t.entrySignalDate}`} className="group align-top">
                  <td className="sticky left-0 z-10 min-w-[120px] bg-white py-2.5 pr-3 group-hover:bg-zinc-50 dark:bg-zinc-900 dark:group-hover:bg-zinc-800">
                    <Link href={`/tw/stock/${t.ticker}`} className="block hover:underline">
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">{stripCompanySuffix(t.companyName)}</p>
                      <p className="font-[family:var(--font-tw-mono)] text-[11px] text-zinc-400 dark:text-zinc-500">{t.ticker}</p>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <SignalCell label={ENTRY_SIGNAL_LABEL[t.entrySignal]} date={t.entrySignalDate} reason={t.entrySignalReason} />
                  </td>
                  <td className="px-3 py-2.5 text-right font-[family:var(--font-tw-mono)] tabular-nums">
                    <p className="text-zinc-800 dark:text-zinc-200">{formatPrice(t.entryPrice)}</p>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{formatDate(t.entryDate)} 開盤</p>
                  </td>
                  <td className="px-1 py-3 text-zinc-300 dark:text-zinc-600">
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                  </td>
                  <td className="px-3 py-2.5">
                    {t.exitSignal ? (
                      <SignalCell
                        label={exitSignalLabel(t.exitSignal, TRACK_RECORD_EXIT_RULE)}
                        date={t.exitPriceType === "open" || t.status !== "closed" ? t.exitSignalDate : null}
                        reason={t.exitSignalReason}
                      />
                    ) : (
                      <StatusPill trade={t} />
                    )}
                    {t.exitSignal && t.status !== "closed" && (
                      <div className="mt-1">
                        <StatusPill trade={t} />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-[family:var(--font-tw-mono)] tabular-nums">
                    {t.status === "closed" ? (
                      <>
                        <p className="text-zinc-800 dark:text-zinc-200">{formatPrice(t.exitPrice)}</p>
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                          {formatDate(t.exitDate)} {t.exitPriceType === "open" ? "開盤" : t.exitPriceType === "close" ? "收盤" : "盤中"}
                        </p>
                      </>
                    ) : t.markPrice !== null ? (
                      <>
                        <p className="text-zinc-500 dark:text-zinc-400">{formatPrice(t.markPrice)}</p>
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{formatDate(t.markDate)} 最新收盤</p>
                      </>
                    ) : (
                      <span className="text-zinc-300 dark:text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-[family:var(--font-tw-mono)] text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {t.holdingDays !== null ? `${t.holdingDays}日` : "—"}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-[family:var(--font-tw-mono)] font-semibold tabular-nums ${twReturnColor(t.returnPct)} ${
                      t.status === "open" ? "opacity-70" : ""
                    }`}
                    title={t.status === "open" ? "未實現報酬（以最新收盤價計）" : undefined}
                  >
                    {formatPct(t.returnPct)}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-[family:var(--font-tw-mono)] text-xs tabular-nums ${twReturnColor(t.excessReturnPct)}`}>
                    {formatPct(t.excessReturnPct)}
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
