"use client";

import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { twReturnColor } from "@/lib/tw/color";

export interface PriceTrendBar {
  date: string; // YYYY-MM-DD
  close: number;
}

const CHART_WIDTH = 720;
const CHART_HEIGHT = 220;
const PADDING = { top: 12, right: 12, bottom: 24, left: 48 };

const RANGES = [
  { key: "1m", label: "1個月", tradingDays: 20 },
  { key: "3m", label: "3個月", tradingDays: 60 },
  { key: "6m", label: "6個月", tradingDays: 120 },
  { key: "1y", label: "1年", tradingDays: 250 },
  { key: "all", label: "全部", tradingDays: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

function formatPrice(value: number): string {
  return value.toFixed(2);
}

function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/** 個股收盤價區間走勢圖（6M/1Y 切換），台股慣例漲紅跌綠標示期間報酬 */
export function PriceTrendChart({ bars }: { bars: PriceTrendBar[] }) {
  const [range, setRange] = useState<RangeKey>("6m");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const rangeConfig = RANGES.find((r) => r.key === range)!;
  const visible = useMemo(() => bars.slice(-rangeConfig.tradingDays), [bars, rangeConfig.tradingDays]);

  if (visible.length < 2) {
    return (
      <Card>
        <SectionHeader icon={TrendingUp} iconColor="rose" title="股價走勢" />
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">歷史資料不足，無法繪製走勢圖。</p>
      </Card>
    );
  }

  const closes = visible.map((b) => b.close);
  const minV = Math.min(...closes);
  const maxV = Math.max(...closes);
  const yPad = Math.max((maxV - minV) * 0.08, 0.5);
  const yMin = minV - yPad;
  const yMax = maxV + yPad;

  const innerW = CHART_WIDTH - PADDING.left - PADDING.right;
  const innerH = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  function xFor(i: number): number {
    return PADDING.left + (visible.length <= 1 ? 0 : (i / (visible.length - 1)) * innerW);
  }
  function yFor(v: number): number {
    return PADDING.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  }

  const path = visible.map((b, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(b.close).toFixed(1)}`).join(" ");

  const periodStart = closes[0];
  const periodEnd = closes[closes.length - 1];
  const periodReturnPct = ((periodEnd - periodStart) / periodStart) * 100;

  const hoverBar = hoverIndex !== null ? visible[hoverIndex] : null;
  const hoverReturnPct = hoverBar ? ((hoverBar.close - periodStart) / periodStart) * 100 : null;

  const yTicks = 4;
  const tickValues = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks);

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionHeader icon={TrendingUp} iconColor="rose" title="股價走勢" />
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${twReturnColor(periodReturnPct)}`}>{formatPct(periodReturnPct)}</span>
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
                {formatPrice(v)}
              </text>
            </g>
          ))}

          <path d={path} fill="none" stroke="light-dark(#78350f, #f0b866)" strokeWidth={1.75} />

          {hoverIndex !== null && (
            <>
              <line
                x1={xFor(hoverIndex)}
                x2={xFor(hoverIndex)}
                y1={PADDING.top}
                y2={CHART_HEIGHT - PADDING.bottom}
                stroke="light-dark(#d4d4d8, #3f3f46)"
                strokeWidth={1}
              />
              <circle cx={xFor(hoverIndex)} cy={yFor(visible[hoverIndex].close)} r={2.5} fill="light-dark(#78350f, #f0b866)" />
            </>
          )}

          {visible.map((_, i) => (
            <rect
              key={i}
              x={xFor(i) - innerW / visible.length / 2}
              y={PADDING.top}
              width={innerW / visible.length}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
            />
          ))}

          {[0, Math.floor(visible.length / 2), visible.length - 1].map((i) => (
            <text key={i} x={xFor(i)} y={CHART_HEIGHT - 6} textAnchor="middle" fontSize="9" fill="light-dark(#a1a1aa, #71717a)">
              {visible[i]?.date.slice(5)}
            </text>
          ))}
        </svg>
      </div>

      <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        {hoverBar ? (
          <span>
            {hoverBar.date} 收盤 <span className="font-medium text-zinc-700 dark:text-zinc-200">{formatPrice(hoverBar.close)}</span>{" "}
            <span className={twReturnColor(hoverReturnPct)}>{formatPct(hoverReturnPct!)}</span>
          </span>
        ) : (
          <span>{visible[0]?.date} ~ {visible[visible.length - 1]?.date}</span>
        )}
      </div>
    </Card>
  );
}
