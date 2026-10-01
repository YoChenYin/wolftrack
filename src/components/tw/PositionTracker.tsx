"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, LogIn, Search, X } from "lucide-react";
import { recordTrackedEntry, closeTradeEntry } from "@/lib/tradeLog/actions";
import {
  ENTRY_SIGNAL_LABEL,
  TRACK_RECORD_EXIT_RULE as RULE,
  exitSignalLabel,
  type EntrySignal,
  type ExitSignal,
} from "@/lib/trend/tw/trackRecordMeta";
import type { TodaySignal } from "@/lib/trend/tw/trackRecord";
import type { SearchableStock, TrackedPosition } from "@/lib/trend/tw/positionTracking";
import { twReturnColor } from "@/lib/tw/color";
import { stripCompanySuffix } from "@/lib/formatCompanyName";

const SEARCH_RESULT_LIMIT = 20;

/** 記錄進場時填的訊號來源，跟positionTracking.ts的ENTRY_SIGNAL_TO_SOURCE一致（那支是server-only不能import） */
const SIGNAL_SOURCE: Record<EntrySignal, string> = {
  trustTurnBuy: "twTrustTurnBuy",
  combinedBuy: "twCombinedBuy",
  buyDip: "twTrendBuyDip",
  bottomPattern: "twBottomPattern",
};

const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 font-[family:var(--font-tw-mono)] text-sm tabular-nums text-zinc-800 focus:border-zinc-400 focus:outline-none dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100";
const primaryButton =
  "rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white";

function formatPct(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatDate(date: string | null): string {
  return date ? date.slice(5).replace("-", "/") : "—";
}

/** 使用者自己設的停損/停利價跟規則的百分比停損不同，標籤要分開講 */
function positionExitLabel(signal: ExitSignal, p: TrackedPosition): string {
  if (signal === "stopLoss" && RULE.stopLossPct === null) return "觸及停損價";
  if (signal === "takeProfit" && p.entrySignal !== "bottomPattern") return "觸及停利價";
  return exitSignalLabel(signal, RULE);
}

interface Candidate {
  ticker: string;
  companyName: string;
  latestClose: number | null;
  signal: TodaySignal | null;
}

function EntryForm({ candidate, onCancel }: { candidate: Candidate; onCancel: () => void }) {
  const target = candidate.signal?.targetPrice ?? null;
  return (
    <form
      action={recordTrackedEntry}
      onSubmit={() => setTimeout(onCancel, 0)}
      className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-900/[0.05] sm:grid-cols-[1fr_1fr_1fr_auto] dark:bg-white/[0.04] dark:ring-white/[0.06]"
    >
      <input type="hidden" name="ticker" value={candidate.ticker} />
      {candidate.signal && <input type="hidden" name="signalSource" value={SIGNAL_SOURCE[candidate.signal.entrySignal]} />}
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">買入價</span>
        <input name="entryPrice" type="number" step="0.01" min="0" required defaultValue={candidate.latestClose ?? undefined} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">股數</span>
        <input name="quantity" type="number" step="1" min="1" required defaultValue={1000} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">停利價（選填）</span>
        <input name="takeProfitPrice" type="number" step="0.01" min="0" defaultValue={target !== null ? target.toFixed(2) : undefined} className={inputClass} />
      </label>
      <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
        <button type="submit" className={primaryButton}>
          記錄今天進場
        </button>
        <button type="button" onClick={onCancel} aria-label="取消" className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
      </div>
      {target !== null && (
        <p className="col-span-full text-[11px] text-zinc-400 dark:text-zinc-500">停利價已帶入底部型態量測目標價，盤中觸及就算出場訊號</p>
      )}
    </form>
  );
}

function CandidateRow({ c, loggedIn, open, onOpen, onClose }: { c: Candidate; loggedIn: boolean; open: boolean; onOpen: () => void; onClose: () => void }) {
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href={`/tw/stock/${c.ticker}`} className="min-w-[7rem] hover:underline">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{stripCompanySuffix(c.companyName)}</span>{" "}
          <span className="font-[family:var(--font-tw-mono)] text-[11px] text-zinc-400 dark:text-zinc-500">{c.ticker}</span>
        </Link>
        {c.signal && (
          <span
            title={c.signal.reason ?? undefined}
            className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-400/10 dark:text-red-300"
          >
            今日 {ENTRY_SIGNAL_LABEL[c.signal.entrySignal]}
          </span>
        )}
        <span className="font-[family:var(--font-tw-mono)] text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          收盤 {c.latestClose !== null ? c.latestClose.toFixed(2) : "—"}
        </span>
        <div className="ml-auto">
          {!loggedIn ? (
            <Link href="/login?next=/tw/track-record" className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
              <LogIn className="h-3.5 w-3.5" />
              登入後記錄進場
            </Link>
          ) : (
            !open && (
              <button type="button" onClick={onOpen} className={primaryButton}>
                我今天進場
              </button>
            )
          )}
        </div>
      </div>
      {c.signal?.reason && <p className="mt-1 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">{c.signal.reason}</p>}
      {open && <EntryForm candidate={c} onCancel={onClose} />}
    </li>
  );
}

function ExitForm({ p, defaultPrice, defaultDate, onCancel }: { p: TrackedPosition; defaultPrice: number | null; defaultDate: string; onCancel: () => void }) {
  return (
    <form action={closeTradeEntry} onSubmit={() => setTimeout(onCancel, 0)} className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={p.id} />
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">賣出價</span>
        <input name="exitPrice" type="number" step="0.01" min="0" required defaultValue={defaultPrice ?? undefined} className={`${inputClass} w-28`} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">賣出日</span>
        <input name="exitDate" type="date" required defaultValue={defaultDate} className={`${inputClass} w-40`} />
      </label>
      <button type="submit" className={primaryButton}>
        確認出場
      </button>
      <button type="button" onClick={onCancel} aria-label="取消" className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-white/10">
        <X className="h-4 w-4" />
      </button>
    </form>
  );
}

/** 一筆持倉的出場判斷說明：續抱時講清楚「什麼情況會出場」，有訊號時講清楚「什麼時候、用什麼價格賣」 */
function PositionStatus({ p }: { p: TrackedPosition }) {
  const e = p.evaluation;
  if (e.heldDays === 0) {
    return <p className="text-xs text-zinc-500 dark:text-zinc-400">等待進場日 {formatDate(p.entryDate)} 的收盤資料（每天 17:00 後更新）</p>;
  }
  if (e.exit) {
    const label = positionExitLabel(e.exit.signal, p);
    const text =
      e.exit.timing === "filled"
        ? `${formatDate(e.exit.signalDate)} ${label}，${e.exit.signal === "maxHolding" ? "當天收盤" : "盤中"} ${e.exit.price?.toFixed(2)} 元出場`
        : e.exit.fillDate
          ? `${formatDate(e.exit.signalDate)} ${label}，${formatDate(e.exit.fillDate)} 開盤 ${e.exit.price?.toFixed(2)} 元出場`
          : `${formatDate(e.exit.signalDate)} ${label}，明天開盤賣出`;
    return (
      <p className="flex items-start gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
        出場訊號：{text}
      </p>
    );
  }

  const daysLeft = RULE.maxHoldingDays - e.heldDays;
  const maxGain = e.maxClose !== null ? ((e.maxClose - p.entryPrice) / p.entryPrice) * 100 : null;
  const lines: string[] = [];
  if (RULE.trailingMa !== null) {
    lines.push(
      e.trailingActive
        ? `移動停利已啟動：收盤跌破 ${RULE.trailingMa} 日線${e.trailingMaValue !== null ? ` ${e.trailingMaValue.toFixed(2)} 元` : ""}就出場`
        : `移動停利未啟動：收盤獲利達 ${RULE.trailingActivatePct}% 後才開始看 ${RULE.trailingMa} 日線（持有期間最高 ${formatPct(maxGain)}）`
    );
  }
  if (p.takeProfitPrice !== null && e.latestClose !== null) {
    lines.push(`停利價 ${p.takeProfitPrice.toFixed(2)} 元（距離 ${formatPct(((p.takeProfitPrice - e.latestClose) / e.latestClose) * 100)}）`);
  }
  if (p.stopLossPrice !== null) lines.push(`停損價 ${p.stopLossPrice.toFixed(2)} 元`);
  lines.push(daysLeft > 0 ? `最多再持有 ${daysLeft} 個交易日` : "已達最長持有天數");

  return (
    <div className="text-xs text-zinc-500 dark:text-zinc-400">
      <p className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        續抱
      </p>
      <ul className="mt-1 space-y-0.5">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

function PositionRow({ p }: { p: TrackedPosition }) {
  const [closing, setClosing] = useState(false);
  const e = p.evaluation;
  const suggestedPrice = e.exit?.price ?? e.latestClose;
  // 出場訊號已經成交的部位，報酬率是用出場價算的，旁邊顯示的價格也要是出場價，不是最新收盤
  const exitFilled = e.exit?.price != null;
  const markPrice = exitFilled ? e.exit!.price : e.latestClose;
  const suggestedDate = e.exit?.fillDate ?? e.exit?.signalDate ?? e.latestDate ?? p.entryDate;
  return (
    <li className="grid gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(9rem,1fr)_minmax(10rem,1fr)_2fr]">
      <div>
        <Link href={`/tw/stock/${p.ticker}`} className="hover:underline">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{stripCompanySuffix(p.companyName)}</span>{" "}
          <span className="font-[family:var(--font-tw-mono)] text-[11px] text-zinc-400 dark:text-zinc-500">{p.ticker}</span>
        </Link>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
          {p.entrySignal ? ENTRY_SIGNAL_LABEL[p.entrySignal] : "自行判斷"} · {formatDate(p.entryDate)} 進場
        </p>
      </div>
      <div className="font-[family:var(--font-tw-mono)] tabular-nums">
        {e.heldDays === 0 ? (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">買入 {p.entryPrice.toFixed(2)}</p>
        ) : (
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-zinc-700 dark:text-zinc-300">
            <span className="whitespace-nowrap">
              {p.entryPrice.toFixed(2)} → {markPrice !== null ? markPrice.toFixed(2) : "—"}
              {exitFilled && <span className="ml-1 text-[11px] font-normal text-zinc-400 dark:text-zinc-500">出場價</span>}
            </span>
            <span className={`whitespace-nowrap font-semibold ${twReturnColor(e.returnPct)}`}>{formatPct(e.returnPct)}</span>
          </p>
        )}
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
          持有 {e.heldDays} / {RULE.maxHoldingDays} 日 · {p.quantity.toLocaleString()} 股
        </p>
      </div>
      <div>
        <PositionStatus p={p} />
        {closing ? (
          <ExitForm p={p} defaultPrice={suggestedPrice} defaultDate={suggestedDate} onCancel={() => setClosing(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setClosing(true)}
            className="mt-1.5 text-[11px] font-medium text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            記錄出場
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * 我的進場追蹤：搜尋欄空白時列出今日進場訊號，輸入代號/名稱搜尋全部台股；記錄進場後，
 * 下方持倉清單每天用績效驗證同一套出場規則告訴使用者該續抱還是該出場。
 */
export function PositionTracker({
  loggedIn,
  latestDate,
  todaySignals,
  stocks,
  positions,
}: {
  loggedIn: boolean;
  latestDate: string | null;
  todaySignals: TodaySignal[];
  stocks: SearchableStock[];
  positions: TrackedPosition[];
}) {
  const [query, setQuery] = useState("");
  const [openTicker, setOpenTicker] = useState<string | null>(null);

  const signalByTicker = useMemo(() => new Map(todaySignals.map((s) => [s.ticker, s])), [todaySignals]);
  const q = query.trim().toLowerCase();
  const candidates: Candidate[] = useMemo(() => {
    if (!q) return todaySignals.map((s) => ({ ticker: s.ticker, companyName: s.companyName, latestClose: s.latestClose, signal: s }));
    return stocks
      .filter((s) => s.ticker.toLowerCase().startsWith(q) || s.companyName.toLowerCase().includes(q))
      .slice(0, SEARCH_RESULT_LIMIT)
      .map((s) => ({ ...s, signal: signalByTicker.get(s.ticker) ?? null }));
  }, [q, stocks, todaySignals, signalByTicker]);

  const exitAlerts = positions.filter((p) => p.evaluation.exit !== null).length;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">今天要進場哪一檔</h3>
        <label className="relative mt-2 block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            placeholder="搜尋代號或名稱，例如 2330、台積電"
            className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-8 pr-3 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
        </label>
        <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
          {q
            ? `搜尋結果 ${candidates.length} 檔${candidates.length === SEARCH_RESULT_LIMIT ? `（只顯示前 ${SEARCH_RESULT_LIMIT} 檔）` : ""}`
            : `${latestDate ? formatDate(latestDate) : "今日"} 新出現進場訊號 ${todaySignals.length} 檔，收盤價為預設買入價`}
        </p>
        {candidates.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">{q ? "找不到符合的股票" : "今天沒有新的進場訊號"}</p>
        ) : (
          <ul className="mt-1 max-h-[28rem] divide-y divide-zinc-100 overflow-y-auto pr-1 dark:divide-white/10">
            {candidates.map((c) => (
              <CandidateRow
                key={c.ticker}
                c={c}
                loggedIn={loggedIn}
                open={openTicker === c.ticker}
                onOpen={() => setOpenTicker(c.ticker)}
                onClose={() => setOpenTicker(null)}
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          我的持倉 {positions.length > 0 && `（${positions.length}）`}
          {exitAlerts > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
              {exitAlerts} 筆有出場訊號
            </span>
          )}
        </h3>
        {!loggedIn ? (
          <p className="py-6 text-sm text-zinc-400 dark:text-zinc-500">
            <Link href="/login?next=/tw/track-record" className="font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300">
              登入
            </Link>
            後記錄進場，這裡會每天依出場規則提醒你什麼時候該賣
          </p>
        ) : positions.length === 0 ? (
          <p className="py-6 text-sm text-zinc-400 dark:text-zinc-500">還沒有持倉——從左邊選一檔按「我今天進場」</p>
        ) : (
          <ul className="mt-1 divide-y divide-zinc-100 dark:divide-white/10">
            {positions.map((p) => (
              <PositionRow key={p.id} p={p} />
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
          已記錄的進出場也會出現在
          <Link href="/trade-log" className="mx-0.5 underline-offset-2 hover:underline">
            交易紀錄
          </Link>
          。出場規則跟上方績效驗證相同；進場當天算持有第 1 天。
        </p>
      </section>
    </div>
  );
}
