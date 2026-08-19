"use client";

import { useMemo, useState } from "react";
import { Layers, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";

export interface ChipConcentrationDay {
  date: string; // YYYY-MM-DD
  concentration5: number | null;
  concentration10: number | null;
  concentration20: number | null;
  momentum: "strengthening" | "neutral" | "weakening" | null;
}

const CHART_WIDTH = 720;
const CHART_HEIGHT = 200;
const PADDING = { top: 12, right: 12, bottom: 24, left: 40 };

const RANGES = [
  { key: "1m", label: "1個月", tradingDays: 20 },
  { key: "3m", label: "3個月", tradingDays: 60 },
  { key: "6m", label: "6個月", tradingDays: 120 },
  { key: "1y", label: "1年", tradingDays: 250 },
  { key: "all", label: "全部", tradingDays: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const SERIES: { key: "concentration5" | "concentration10" | "concentration20"; label: string; color: string }[] = [
  { key: "concentration5", label: "5日", color: "light-dark(#dc2626, #f87171)" },
  { key: "concentration10", label: "10日", color: "light-dark(#d97706, #fbbf24)" },
  { key: "concentration20", label: "20日", color: "light-dark(#71717a, #a1a1aa)" },
];

const MOMENTUM_META = {
  strengthening: { label: "轉強", icon: TrendingUp, className: "text-red-600 dark:text-red-400" },
  neutral: { label: "持平", icon: Minus, className: "text-zinc-500 dark:text-zinc-400" },
  weakening: { label: "轉弱", icon: TrendingDown, className: "text-emerald-600 dark:text-emerald-400" },
} as const;

/** 5/10/20日籌碼集中度排列圖：三條線的相對位置看轉強/轉弱（5>10>20=轉強，5<10=轉弱）。
 * 2026-08-19新增區間切換（比照PriceTrendChart）——外層改傳全部歷史，這裡自己依選取
 * 區間裁切 */
export function ChipConcentrationChart({ days: allDays }: { days: ChipConcentrationDay[] }) {
  const [range, setRange] = useState<RangeKey>("3m");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const rangeConfig = RANGES.find((r) => r.key === range)!;
  const days = useMemo(() => allDays.slice(-rangeConfig.tradingDays), [allDays, rangeConfig.tradingDays]);

  if (days.length < 2) {
    return (
      <Card>
        <SectionHeader icon={Layers} iconColor="amber" title="籌碼集中度" />
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">歷史資料不足，無法繪製籌碼集中度走勢。</p>
      </Card>
    );
  }

  const allValues = days.flatMap((d) => [d.concentration5, d.concentration10, d.concentration20]).filter((v): v is number => v !== null);
  const minV = allValues.length > 0 ? Math.min(...allValues, 0) : -5;
  const maxV = allValues.length > 0 ? Math.max(...allValues, 0) : 5;
  const yPad = Math.max((maxV - minV) * 0.1, 0.5);
  const yMin = minV - yPad;
  const yMax = maxV + yPad;

  const innerW = CHART_WIDTH - PADDING.left - PADDING.right;
  const innerH = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  function xFor(i: number): number {
    return PADDING.left + (days.length <= 1 ? 0 : (i / (days.length - 1)) * innerW);
  }
  function yFor(v: number): number {
    return PADDING.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  }
  function toPath(values: (number | null)[]): string {
    let d = "";
    let started = false;
    values.forEach((v, i) => {
      if (v === null) {
        started = false;
        return;
      }
      d += `${started ? "L" : "M"}${xFor(i).toFixed(1)},${yFor(v).toFixed(1)} `;
      started = true;
    });
    return d.trim();
  }

  const latest = days[days.length - 1];
  const latestMomentum = latest.momentum ? MOMENTUM_META[latest.momentum] : null;
  const MomentumIcon = latestMomentum?.icon;
  const hoverDay = hoverIndex !== null ? days[hoverIndex] : null;

  const yTicks = 4;
  const tickValues = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks);

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionHeader icon={Layers} iconColor="amber" title="籌碼集中度" />
        <div className="flex items-center gap-2">
          {latestMomentum && MomentumIcon && (
            <span className={`flex items-center gap-1 text-xs font-semibold ${latestMomentum.className}`}>
              <MomentumIcon className="h-3.5 w-3.5" strokeWidth={2.25} />
              {latestMomentum.label}
            </span>
          )}
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  range === r.key
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-400 dark:hover:bg-white/15"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
        (外資+投信買超張數) ÷ 總成交量，5/10/20日排列：5日 &gt; 10日 &gt; 20日 且 5日 &gt; 0 = 轉強；5日 &lt; 10日 = 轉弱。
      </p>

      <div className="mt-3 overflow-x-auto">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="w-full min-w-[480px]"
          onMouseLeave={() => setHoverIndex(null)}
        >
          {tickValues.map((v, i) => (
            <g key={i}>
              <line
                x1={PADDING.left}
                x2={CHART_WIDTH - PADDING.right}
                y1={yFor(v)}
                y2={yFor(v)}
                stroke="light-dark(#f4f4f5, #27272a)"
                strokeWidth={1}
              />
              <text x={PADDING.left - 6} y={yFor(v) + 3} textAnchor="end" fontSize="9" fill="light-dark(#a1a1aa, #71717a)">
                {v.toFixed(1)}
              </text>
            </g>
          ))}
          <line
            x1={PADDING.left}
            x2={CHART_WIDTH - PADDING.right}
            y1={yFor(0)}
            y2={yFor(0)}
            stroke="light-dark(#d4d4d8, #3f3f46)"
            strokeWidth={1}
            strokeDasharray="3,3"
          />

          {SERIES.map((s) => (
            <path key={s.key} d={toPath(days.map((d) => d[s.key]))} fill="none" stroke={s.color} strokeWidth={1.5} />
          ))}

          {hoverIndex !== null && (
            <line
              x1={xFor(hoverIndex)}
              x2={xFor(hoverIndex)}
              y1={PADDING.top}
              y2={CHART_HEIGHT - PADDING.bottom}
              stroke="light-dark(#d4d4d8, #3f3f46)"
              strokeWidth={1}
            />
          )}

          {days.map((_, i) => (
            <rect
              key={i}
              x={xFor(i) - innerW / days.length / 2}
              y={PADDING.top}
              width={innerW / days.length}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
            />
          ))}

          {[0, Math.floor(days.length / 2), days.length - 1].map((i) => (
            <text key={i} x={xFor(i)} y={CHART_HEIGHT - 6} textAnchor="middle" fontSize="9" fill="light-dark(#a1a1aa, #71717a)">
              {days[i]?.date.slice(5)}
            </text>
          ))}
        </svg>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
        {SERIES.map((s) => {
          const day = hoverDay ?? latest;
          const value = day[s.key];
          return (
            <span key={s.key} className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.label} <span className="font-medium text-zinc-700 dark:text-zinc-200">{value !== null ? value.toFixed(2) : "—"}</span>
            </span>
          );
        })}
        <span className="text-zinc-400 dark:text-zinc-500">{hoverDay?.date ?? latest.date}</span>
      </div>
    </Card>
  );
}
