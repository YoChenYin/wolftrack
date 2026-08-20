"use client";

import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { InfoTooltip } from "../InfoTooltip";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";

export interface MonthlyRevenueRow {
  revenueMonth: string; // YYYY-MM
  revenue: string; // BigInt 轉字串（千元）
  yoyGrowthPct: number | null;
  momGrowthPct: number | null;
  cumulativeYoyGrowthPct: number | null;
}

/** revenue欄位存的是官方原始單位「千元」（見prisma schema TwMonthlyRevenue.revenue註解，
 * 跟monthlyRevenueClient.ts解析的TWSE/TPEx原始欄位一致，2026-08-21用台積電當月真實營收
 * 對照官方數字驗證過換算正確）。1億=100,000千元，所以千元數字除以100,000得到億元。 */
function formatRevenue(thousands: string): string {
  const n = Number(thousands);
  if (!Number.isFinite(n)) return "N/A";
  return `${(n / 100_000).toFixed(1)} 億`; // 千元 -> 億元
}

function formatPct(value: number | null): string {
  if (value === null) return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/** 台股慣例：漲(正)=紅、跌(負)=綠 */
function pctColor(value: number | null): string {
  if (value === null) return "text-zinc-400 dark:text-zinc-500";
  return value >= 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400";
}

/**
 * 營收面板（2026-07-11 新增，2026-08-21改標題「月營收」→「營收」+加年份切換）：
 * TWSE/TPEx 官方月營收彙總表只回傳「最新一期」，沒辦法一次回填歷史，這裡顯示的多月資料是
 * 每次排程執行自然累積出來的（見 fetchTwMonthlyRevenue.ts 說明），剛上線時大部分股票可能
 * 只有 1 筆。
 *
 * 年份切換：預設只顯示資料裡最新一筆所在的年份（通常就是今年），累積夠多年份後表格不會
 * 一直往下長，其他年份收進dropdown選——用「資料裡最新一筆的年份」當預設值而不是系統當下
 * 的西元年，這樣即使排程斷更一段時間、資料還停在去年，預設畫面還是會顯示「有資料的那年」
 * 而不是空白。
 */
export function MonthlyRevenuePanel({ rows }: { rows: MonthlyRevenueRow[] }) {
  const years = useMemo(() => {
    const set = new Set(rows.map((r) => r.revenueMonth.slice(0, 4)));
    return [...set].sort((a, b) => Number(b) - Number(a));
  }, [rows]);

  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const activeYear = selectedYear ?? years[0] ?? null;
  const visibleRows = activeYear ? rows.filter((r) => r.revenueMonth.startsWith(activeYear)) : [];

  if (rows.length === 0) {
    return (
      <Card>
        <SectionHeader icon={BarChart3} iconColor="emerald" title="營收" />
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">這檔股票目前沒有營收資料。</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionHeader
          icon={BarChart3}
          iconColor="emerald"
          title="營收"
          tooltip={
            <InfoTooltip>
              資料來源：TWSE/TPEx 官方每月營收彙總表。年增率(YoY)是台股最常用的成長性指標；累計營收年增率把今年以來所有月份加總跟去年同期比，比單月數字更不容易被單月異常值誤導。這兩個端點只回傳最新一期，多月資料是排程累積出來的，剛上線時可能只有1筆。
            </InfoTooltip>
          }
        />
        {years.length > 1 && (
          <select
            value={activeYear ?? ""}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}年
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[480px] text-xs">
          <thead>
            <tr className="text-left text-zinc-400 dark:text-zinc-500">
              <th className="pr-2 font-normal">月份</th>
              <th className="pr-2 text-right font-normal">營收</th>
              <th className="pr-2 text-right font-normal">月增率</th>
              <th className="pr-2 text-right font-normal">年增率</th>
              <th className="text-right font-normal">累計年增率</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr key={r.revenueMonth} className="border-t border-zinc-50 dark:border-white/5">
                <td className="py-1 pr-2 font-medium text-zinc-800 dark:text-zinc-200">{r.revenueMonth}</td>
                <td className="pr-2 text-right text-zinc-600 dark:text-zinc-400">{formatRevenue(r.revenue)}</td>
                <td className={`pr-2 text-right font-medium ${pctColor(r.momGrowthPct)}`}>{formatPct(r.momGrowthPct)}</td>
                <td className={`pr-2 text-right font-medium ${pctColor(r.yoyGrowthPct)}`}>{formatPct(r.yoyGrowthPct)}</td>
                <td className={`text-right font-medium ${pctColor(r.cumulativeYoyGrowthPct)}`}>
                  {formatPct(r.cumulativeYoyGrowthPct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
