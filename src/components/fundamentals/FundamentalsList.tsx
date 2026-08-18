"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { NotebookText, Search, FileText, X } from "lucide-react";
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
 * 涵蓋範圍是有分類到板塊的股票（見 getAllThemedTickers），不是全市場。
 * 2026-08-19：加上搜尋欄位（依代號或公司名稱過濾，資料本來就已經一次全部fetch下來，
 * 用client端filter就夠，不用另外開一支搜尋API）；同時支援「待解析」項目——只有PDF
 * 簡報連結、還沒有LLM摘要（見queryFundamentalsOverview.ts的發現/解析拆分）。 */
export function FundamentalsList({ items }: { items: FundamentalsOverviewItem[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.ticker.toLowerCase().includes(q) || item.companyName.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={NotebookText} iconColor="zinc" title={`法說會紀錄（${filtered.length}${query ? ` / ${items.length}` : ""}）`} />
        <div className="relative w-full max-w-[220px] sm:w-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" strokeWidth={2.25} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋股票代號或公司名稱"
            className="w-full rounded-lg bg-zinc-100 py-1.5 pl-8 pr-7 text-xs text-zinc-700 outline-none ring-1 ring-transparent placeholder:text-zinc-400 focus:ring-zinc-300 dark:bg-white/[0.06] dark:text-zinc-200 dark:placeholder:text-zinc-500 dark:focus:ring-white/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.25} />
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-3 text-center text-sm text-zinc-400 dark:text-zinc-500">{query ? `查無「${query}」的法說會紀錄。` : "還沒有資料。"}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {filtered.map((item) => {
            const style = item.signal ? SIGNAL_STYLE[item.signal] ?? SIGNAL_STYLE.neutral : null;
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
                  {style ? (
                    <span className={`rounded px-1.5 py-0.5 font-medium ring-1 ${style.className}`}>{style.label}</span>
                  ) : (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-400 dark:ring-amber-400/20">
                      待解析
                    </span>
                  )}
                </div>
                {item.profitGrowthSummary !== null ? (
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
                ) : (
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="text-zinc-400 dark:text-zinc-500">LLM還沒解析這份簡報，可以先看原始PDF：</span>
                    <a
                      href={item.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-violet-600 hover:underline dark:text-violet-400"
                    >
                      <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />
                      開啟簡報PDF
                    </a>
                  </div>
                )}
              </SubCard>
            );
          })}
        </div>
      )}
    </Card>
  );
}
