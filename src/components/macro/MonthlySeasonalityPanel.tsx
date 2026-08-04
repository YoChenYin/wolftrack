"use client";

import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { twReturnColor } from "@/lib/tw/color";
import type { MonthlySeasonalityResult } from "@/lib/macro/computeMonthlySeasonality";

const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

const CYCLE_CHART_WIDTH = 720;
const CYCLE_CHART_HEIGHT = 200;
const CYCLE_PADDING = { top: 12, right: 12, bottom: 22, left: 44 };

const BAR_CHART_WIDTH = 720;
const BAR_CHART_HEIGHT = 160;
const BAR_PADDING = { top: 10, right: 12, bottom: 20, left: 40 };

/** 參考序列固定配色，跟頁面上其他圖表色系區隔開來 */
const SERIES_COLORS: Record<string, string> = {
  TAIEX: "light-dark(#78350f, #f0b866)",
  TPEX: "light-dark(#2563eb, #60a5fa)",
  "2330": "light-dark(#7c3aed, #c4b5fd)",
  SPX: "light-dark(#0f7a5c, #34d399)",
};

function formatPct(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

/** 熱力圖儲存格背景色：紅=上漲、綠=下跌，深淺依報酬率大小（±8%以上算最深色） */
function cellBg(value: number | null): string {
  if (value === null || value === 0) return "transparent";
  const intensity = Math.min(Math.abs(value) / 8, 1);
  return value > 0
    ? `light-dark(rgba(220,38,38,${0.08 + intensity * 0.32}), rgba(248,113,113,${0.1 + intensity * 0.3}))`
    : `light-dark(rgba(5,150,105,${0.08 + intensity * 0.32}), rgba(52,211,153,${0.1 + intensity * 0.3}))`;
}

/**
 * 總經頁「台股歷年月份表現」：上方是 TAIEX/櫃買指數/權值股(2330)/S&P500(美股對照) 幾條參考序列的
 * 「年度週期」疊圖（每月平均報酬從1月累加到12月），一眼看出一年中哪幾個月是上漲期、哪幾個月容易拉回；
 * 下方是切換單一序列看月份平均報酬長條圖 + 年份×月份熱力圖的細節。
 */
export function MonthlySeasonalityPanel({ series }: { series: MonthlySeasonalityResult[] }) {
  const withData = series.filter((s) => s.years.length > 0);
  const [activeTicker, setActiveTicker] = useState<string | undefined>(withData[0]?.ticker);
  const [hiddenTickers, setHiddenTickers] = useState<Set<string>>(new Set());
  const [cycleHoverMonth, setCycleHoverMonth] = useState<number | null>(null);
  const [barHoverMonth, setBarHoverMonth] = useState<number | null>(null);

  if (withData.length === 0) {
    return (
      <Card>
        <SectionHeader icon={CalendarRange} iconColor="blue" title="台股歷年月份表現" />
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">目前沒有足夠的歷史資料可計算季節性。</p>
      </Card>
    );
  }

  const active = withData.find((s) => s.ticker === activeTicker) ?? withData[0];
  const visibleSeries = withData.filter((s) => !hiddenTickers.has(s.ticker));

  // --- 年度週期疊圖 ---
  const allCumValues = visibleSeries.flatMap((s) => s.summary.map((m) => m.cumulativeAvgReturnPct).filter((v): v is number => v !== null));
  const cycleMinV = allCumValues.length > 0 ? Math.min(...allCumValues, 0) : -5;
  const cycleMaxV = allCumValues.length > 0 ? Math.max(...allCumValues, 0) : 5;
  const cyclePad = Math.max((cycleMaxV - cycleMinV) * 0.1, 0.5);
  const cycleYMin = cycleMinV - cyclePad;
  const cycleYMax = cycleMaxV + cyclePad;
  const cycleInnerW = CYCLE_CHART_WIDTH - CYCLE_PADDING.left - CYCLE_PADDING.right;
  const cycleInnerH = CYCLE_CHART_HEIGHT - CYCLE_PADDING.top - CYCLE_PADDING.bottom;

  function cycleXFor(i: number): number {
    return CYCLE_PADDING.left + (i / 11) * cycleInnerW;
  }
  function cycleYFor(v: number): number {
    return CYCLE_PADDING.top + cycleInnerH - ((v - cycleYMin) / (cycleYMax - cycleYMin)) * cycleInnerH;
  }
  function cyclePathFor(s: MonthlySeasonalityResult): string {
    let d = "";
    let started = false;
    s.summary.forEach((m, i) => {
      if (m.cumulativeAvgReturnPct === null) {
        started = false;
        return;
      }
      d += `${started ? "L" : "M"}${cycleXFor(i).toFixed(1)},${cycleYFor(m.cumulativeAvgReturnPct).toFixed(1)} `;
      started = true;
    });
    return d.trim();
  }
  const cycleYTicks = 4;
  const cycleTickValues = Array.from({ length: cycleYTicks + 1 }, (_, i) => cycleYMin + ((cycleYMax - cycleYMin) * i) / cycleYTicks);

  function toggleTicker(ticker: string) {
    setHiddenTickers((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  }

  // --- 單一序列細節：月份平均報酬長條圖 ---
  const cellByYearMonth = new Map<string, number>();
  for (const c of active.cells) cellByYearMonth.set(`${c.year}-${c.month}`, c.returnPct);
  const maxAbsAvg = Math.max(...active.summary.map((s) => Math.abs(s.avgReturnPct ?? 0)), 1);
  const barInnerW = BAR_CHART_WIDTH - BAR_PADDING.left - BAR_PADDING.right;
  const barInnerH = BAR_CHART_HEIGHT - BAR_PADDING.top - BAR_PADDING.bottom;
  const barZeroY = BAR_PADDING.top + barInnerH / 2;
  const slotW = barInnerW / 12;
  const barWidth = Math.min(slotW * 0.55, 36);

  function barXFor(i: number): number {
    return BAR_PADDING.left + (i + 0.5) * slotW;
  }
  function barHeightFor(v: number): number {
    return (Math.abs(v) / maxAbsAvg) * (barInnerH / 2);
  }

  const hoverSummary = barHoverMonth !== null ? active.summary[barHoverMonth - 1] : null;
  const displayYears = [...active.years].reverse(); // 最近年份在最上面

  return (
    <Card>
      <SectionHeader icon={CalendarRange} iconColor="blue" title="台股歷年月份表現" />
      <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
        年度週期：各參考序列從1月累加到12月的平均報酬曲線，看一年中哪幾個月是上漲期、哪幾個月容易拉回。點圖例可隱藏/顯示。
      </p>

      <div className="mt-3 overflow-x-auto">
        <svg
          viewBox={`0 0 ${CYCLE_CHART_WIDTH} ${CYCLE_CHART_HEIGHT}`}
          className="w-full min-w-[480px]"
          onMouseLeave={() => setCycleHoverMonth(null)}
        >
          {cycleTickValues.map((v, i) => (
            <g key={i}>
              <line
                x1={CYCLE_PADDING.left}
                x2={CYCLE_CHART_WIDTH - CYCLE_PADDING.right}
                y1={cycleYFor(v)}
                y2={cycleYFor(v)}
                stroke="light-dark(#f4f4f5, #27272a)"
                strokeWidth={1}
              />
              <text x={CYCLE_PADDING.left - 6} y={cycleYFor(v) + 3} textAnchor="end" fontSize="9" fill="light-dark(#a1a1aa, #71717a)">
                {v.toFixed(0)}
              </text>
            </g>
          ))}
          <line
            x1={CYCLE_PADDING.left}
            x2={CYCLE_CHART_WIDTH - CYCLE_PADDING.right}
            y1={cycleYFor(0)}
            y2={cycleYFor(0)}
            stroke="light-dark(#d4d4d8, #3f3f46)"
            strokeWidth={1}
            strokeDasharray="3,3"
          />

          {visibleSeries.map((s) => (
            <path key={s.ticker} d={cyclePathFor(s)} fill="none" stroke={SERIES_COLORS[s.ticker] ?? "#71717a"} strokeWidth={1.75} opacity={0.9} />
          ))}

          {cycleHoverMonth !== null && (
            <line
              x1={cycleXFor(cycleHoverMonth - 1)}
              x2={cycleXFor(cycleHoverMonth - 1)}
              y1={CYCLE_PADDING.top}
              y2={CYCLE_CHART_HEIGHT - CYCLE_PADDING.bottom}
              stroke="light-dark(#d4d4d8, #3f3f46)"
              strokeWidth={1}
            />
          )}

          {MONTH_LABELS.map((_, i) => (
            <rect
              key={`hit-${i}`}
              x={cycleXFor(i) - cycleInnerW / 24}
              y={CYCLE_PADDING.top}
              width={cycleInnerW / 12}
              height={cycleInnerH}
              fill="transparent"
              onMouseEnter={() => setCycleHoverMonth(i + 1)}
            />
          ))}

          {MONTH_LABELS.map((label, i) => (
            <text key={label} x={cycleXFor(i)} y={CYCLE_CHART_HEIGHT - 6} textAnchor="middle" fontSize="9" fill="light-dark(#a1a1aa, #71717a)">
              {label}
            </text>
          ))}
        </svg>
      </div>

      {cycleHoverMonth !== null ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded bg-zinc-50 p-2 text-[11px] dark:bg-white/5">
          <span className="font-medium text-zinc-600 dark:text-zinc-300">{MONTH_LABELS[cycleHoverMonth - 1]}底累計</span>
          {visibleSeries.map((s) => {
            const v = s.summary[cycleHoverMonth - 1]?.cumulativeAvgReturnPct ?? null;
            return (
              <span key={s.ticker} className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: SERIES_COLORS[s.ticker] ?? "#71717a" }} />
                {s.label} <span className={`font-medium ${twReturnColor(v)}`}>{formatPct(v)}</span>
              </span>
            );
          })}
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">滑過曲線看各序列當月累計平均報酬</p>
      )}

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
        {withData.map((s) => (
          <button
            key={s.ticker}
            type="button"
            onClick={() => toggleTicker(s.ticker)}
            className={`flex items-center gap-1 text-[11px] ${
              hiddenTickers.has(s.ticker) ? "text-zinc-300 dark:text-zinc-600" : "text-zinc-600 dark:text-zinc-300"
            }`}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: hiddenTickers.has(s.ticker) ? "#e4e4e7" : SERIES_COLORS[s.ticker] ?? "#71717a" }}
            />
            {s.label}
          </button>
        ))}
      </div>

      <div className="my-4 border-t border-zinc-100 dark:border-white/5" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
          {active.label}：{active.years[0]}~{active.years[active.years.length - 1]}年共{active.years.length}年樣本（{active.dataFrom}~{active.dataTo}）。紅=上漲、綠=下跌。
        </p>
        <div className="flex gap-1">
          {withData.map((s) => (
            <button
              key={s.ticker}
              type="button"
              onClick={() => setActiveTicker(s.ticker)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                active.ticker === s.ticker
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-400 dark:hover:bg-white/15"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <svg
          viewBox={`0 0 ${BAR_CHART_WIDTH} ${BAR_CHART_HEIGHT}`}
          className="w-full min-w-[480px]"
          onMouseLeave={() => setBarHoverMonth(null)}
        >
          <line
            x1={BAR_PADDING.left}
            x2={BAR_CHART_WIDTH - BAR_PADDING.right}
            y1={barZeroY}
            y2={barZeroY}
            stroke="light-dark(#d4d4d8, #3f3f46)"
            strokeWidth={1}
          />

          {active.summary.map((s, i) => {
            if (s.avgReturnPct === null) return null;
            const h = barHeightFor(s.avgReturnPct);
            const y = s.avgReturnPct >= 0 ? barZeroY - h : barZeroY;
            const isHover = barHoverMonth === s.month;
            return (
              <rect
                key={s.month}
                x={barXFor(i) - barWidth / 2}
                y={y}
                width={barWidth}
                height={Math.max(h, 0.5)}
                fill={s.avgReturnPct >= 0 ? "light-dark(#dc2626, #f87171)" : "light-dark(#059669, #34d399)"}
                opacity={barHoverMonth === null || isHover ? 0.9 : 0.35}
                rx={1.5}
              />
            );
          })}

          {active.summary.map((s, i) => (
            <rect
              key={`hit-${s.month}`}
              x={barXFor(i) - slotW / 2}
              y={BAR_PADDING.top}
              width={slotW}
              height={barInnerH}
              fill="transparent"
              onMouseEnter={() => setBarHoverMonth(s.month)}
            />
          ))}

          {MONTH_LABELS.map((label, i) => (
            <text key={label} x={barXFor(i)} y={BAR_CHART_HEIGHT - 4} textAnchor="middle" fontSize="9" fill="light-dark(#a1a1aa, #71717a)">
              {label}
            </text>
          ))}
        </svg>
      </div>

      <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        {hoverSummary ? (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded bg-zinc-50 p-2 dark:bg-white/5">
            <span className="font-medium text-zinc-700 dark:text-zinc-200">{MONTH_LABELS[hoverSummary.month - 1]}</span>
            <span>
              平均 <span className={`font-medium ${twReturnColor(hoverSummary.avgReturnPct)}`}>{formatPct(hoverSummary.avgReturnPct)}</span>
            </span>
            <span>
              中位數 <span className={`font-medium ${twReturnColor(hoverSummary.medianReturnPct)}`}>{formatPct(hoverSummary.medianReturnPct)}</span>
            </span>
            <span>
              勝率 <span className="font-medium text-zinc-700 dark:text-zinc-200">{hoverSummary.winRatePct}%</span>
            </span>
            <span className="text-zinc-400 dark:text-zinc-500">{hoverSummary.sampleYears}年樣本</span>
          </span>
        ) : (
          <span>滑過上方長條看各月份平均報酬/中位數/勝率</span>
        )}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-[11px]">
          <thead>
            <tr className="text-zinc-400 dark:text-zinc-500">
              <th className="py-1 pr-2 text-left font-normal">年份</th>
              {MONTH_LABELS.map((label) => (
                <th key={label} className="px-1 py-1 text-right font-normal">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayYears.map((year) => (
              <tr key={year} className="border-t border-zinc-50 dark:border-white/5">
                <td className="py-1 pr-2 font-medium text-zinc-600 dark:text-zinc-300">{year}</td>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                  const value = cellByYearMonth.get(`${year}-${month}`) ?? null;
                  return (
                    <td
                      key={month}
                      className={`px-1 py-1 text-right font-medium ${twReturnColor(value)}`}
                      style={{ background: cellBg(value) }}
                    >
                      {value !== null ? value.toFixed(1) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-zinc-200 dark:border-white/10">
              <td className="py-1 pr-2 font-semibold text-zinc-700 dark:text-zinc-200">平均</td>
              {active.summary.map((s) => (
                <td key={s.month} className={`px-1 py-1 text-right font-semibold ${twReturnColor(s.avgReturnPct)}`}>
                  {formatPct(s.avgReturnPct).replace("%", "")}
                </td>
              ))}
            </tr>
            <tr>
              <td className="py-1 pr-2 text-zinc-400 dark:text-zinc-500">勝率</td>
              {active.summary.map((s) => (
                <td key={s.month} className="px-1 py-1 text-right text-zinc-400 dark:text-zinc-500">
                  {s.winRatePct !== null ? `${s.winRatePct}%` : "—"}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
