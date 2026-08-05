"use client";

import { useState } from "react";
import { Scale } from "lucide-react";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { InfoTooltip } from "../InfoTooltip";
import type { PutCallRatioDay } from "@/lib/futures/computeTaifexOverview";

const CHART_WIDTH = 720;
const CHART_HEIGHT = 180;
const PADDING = { top: 12, right: 12, bottom: 22, left: 40 };

const SERIES: { key: "putCallOiRatioPct" | "putCallVolumeRatioPct"; label: string; color: string }[] = [
  { key: "putCallOiRatioPct", label: "未平倉量比", color: "light-dark(#0891b2, #22d3ee)" },
  { key: "putCallVolumeRatioPct", label: "成交量比", color: "light-dark(#a1a1aa, #71717a)" },
];

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** 台指選擇權Put/Call比：>100%代表賣權比買權多，市場情緒偏保守/避險，也常被拿來當反指標看 */
export function PutCallRatioChart({ days }: { days: PutCallRatioDay[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (days.length === 0) {
    return (
      <Card>
        <SectionHeader icon={Scale} iconColor="blue" title="選擇權 Put/Call 比" />
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">尚未有資料，排程更新後會逐日累積。</p>
      </Card>
    );
  }

  const latest = days[days.length - 1];
  const hoverDay = hoverIndex !== null ? days[hoverIndex] : null;
  const display = hoverDay ?? latest;

  if (days.length < 2) {
    return (
      <Card>
        <SectionHeader
          icon={Scale}
          iconColor="blue"
          title="選擇權 Put/Call 比"
          tooltip={
            <InfoTooltip>
              臺指選擇權賣權(Put)/買權(Call)的成交量與未平倉量比值。&gt;100%代表賣權比買權多，市場情緒偏保守/避險；也常被拿來當反指標——比值過高有時反而代表悲觀情緒接近極端。
            </InfoTooltip>
          }
        />
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
          <div>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{display.date} 未平倉量比</p>
            <p className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">{formatPct(display.putCallOiRatioPct)}</p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">成交量比</p>
            <p className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">{formatPct(display.putCallVolumeRatioPct)}</p>
          </div>
        </div>
      </Card>
    );
  }

  const allValues = days.flatMap((d) => [d.putCallOiRatioPct, d.putCallVolumeRatioPct]);
  const minV = Math.min(...allValues, 100);
  const maxV = Math.max(...allValues, 100);
  const pad = Math.max((maxV - minV) * 0.15, 3);
  const yMin = minV - pad;
  const yMax = maxV + pad;

  const innerW = CHART_WIDTH - PADDING.left - PADDING.right;
  const innerH = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  function xFor(i: number): number {
    return PADDING.left + (days.length <= 1 ? 0 : (i / (days.length - 1)) * innerW);
  }
  function yFor(v: number): number {
    return PADDING.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  }
  function toPath(key: (typeof SERIES)[number]["key"]): string {
    return days.map((d, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(d[key]).toFixed(1)}`).join(" ");
  }

  const yTicks = 4;
  const tickValues = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks);

  return (
    <Card>
      <SectionHeader
        icon={Scale}
        iconColor="blue"
        title="選擇權 Put/Call 比"
        tooltip={
          <InfoTooltip>
            臺指選擇權賣權(Put)/買權(Call)的成交量與未平倉量比值。&gt;100%代表賣權比買權多，市場情緒偏保守/避險；也常被拿來當反指標——比值過高有時反而代表悲觀情緒接近極端。
          </InfoTooltip>
        }
      />

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
                {v.toFixed(0)}
              </text>
            </g>
          ))}
          <line
            x1={PADDING.left}
            x2={CHART_WIDTH - PADDING.right}
            y1={yFor(100)}
            y2={yFor(100)}
            stroke="light-dark(#d4d4d8, #3f3f46)"
            strokeWidth={1}
            strokeDasharray="3,3"
          />

          {SERIES.map((s) => (
            <path key={s.key} d={toPath(s.key)} fill="none" stroke={s.color} strokeWidth={1.75} />
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
            <text key={i} x={xFor(i)} y={CHART_HEIGHT - 4} textAnchor="middle" fontSize="9" fill="light-dark(#a1a1aa, #71717a)">
              {days[i]?.date.slice(5)}
            </text>
          ))}
        </svg>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label} <span className="font-medium text-zinc-700 dark:text-zinc-200">{formatPct(display[s.key])}</span>
          </span>
        ))}
        <span className="text-zinc-400 dark:text-zinc-500">{display.date}</span>
      </div>
    </Card>
  );
}
