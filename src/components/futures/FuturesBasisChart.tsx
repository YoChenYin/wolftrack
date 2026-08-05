"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { InfoTooltip } from "../InfoTooltip";
import { twReturnColor } from "@/lib/tw/color";
import type { FuturesBasisDay } from "@/lib/futures/computeTaifexOverview";

const CHART_WIDTH = 720;
const CHART_HEIGHT = 180;
const PADDING = { top: 12, right: 12, bottom: 22, left: 48 };

function formatPoints(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(0)}`;
}

function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

/** 台指期基差：正價差(期貨>現貨)通常反映市場偏多氣氛，逆價差反映偏空——只是氣氛指標，不是絕對訊號 */
export function FuturesBasisChart({ days }: { days: FuturesBasisDay[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (days.length === 0) {
    return (
      <Card>
        <SectionHeader icon={ArrowLeftRight} iconColor="violet" title="台指期基差" />
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">尚未有資料，排程更新後會逐日累積。</p>
      </Card>
    );
  }

  const latest = days[days.length - 1];
  const hoverDay = hoverIndex !== null ? days[hoverIndex] : null;
  const display = hoverDay ?? latest;

  const summary = (
    <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
      <div>
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{display.date} 期貨({display.contractMonth})</p>
        <p className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">{display.futuresClose.toFixed(0)}</p>
      </div>
      <div>
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">現貨(TAIEX)</p>
        <p className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">{display.spotClose.toFixed(0)}</p>
      </div>
      <div>
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">基差</p>
        <p className={`text-lg font-semibold ${twReturnColor(display.basis)}`}>
          {formatPoints(display.basis)} <span className="text-xs font-medium">({formatPct(display.basisPct)})</span>
        </p>
      </div>
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
          display.basis >= 0
            ? "bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-400"
            : "bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400"
        }`}
      >
        {display.basis >= 0 ? "正價差" : "逆價差"}
      </span>
    </div>
  );

  if (days.length < 2) {
    return (
      <Card>
        <SectionHeader
          icon={ArrowLeftRight}
          iconColor="violet"
          title="台指期基差"
          tooltip={
            <InfoTooltip>
              台指期(TX)近月合約收盤價 減去 TAIEX現貨收盤價。正價差（期貨&gt;現貨）通常反映市場偏多氣氛，逆價差反映偏空，只是氣氛指標不是絕對訊號。目前剛開始每天累積，只有1天資料，之後會自然疊出走勢。
            </InfoTooltip>
          }
        />
        {summary}
      </Card>
    );
  }

  const values = days.map((d) => d.basis);
  const minV = Math.min(...values, 0);
  const maxV = Math.max(...values, 0);
  const pad = Math.max((maxV - minV) * 0.15, 5);
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
  const path = days.map((d, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(d.basis).toFixed(1)}`).join(" ");

  const yTicks = 4;
  const tickValues = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks);

  return (
    <Card>
      <SectionHeader
        icon={ArrowLeftRight}
        iconColor="violet"
        title="台指期基差"
        tooltip={
          <InfoTooltip>
            台指期(TX)近月合約收盤價 減去 TAIEX現貨收盤價。正價差（期貨&gt;現貨）通常反映市場偏多氣氛，逆價差反映偏空，只是氣氛指標不是絕對訊號。資料從排程開始跑那天起每天累積一筆。
          </InfoTooltip>
        }
      />
      {summary}

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
            y1={yFor(0)}
            y2={yFor(0)}
            stroke="light-dark(#d4d4d8, #3f3f46)"
            strokeWidth={1}
            strokeDasharray="3,3"
          />

          <path d={path} fill="none" stroke="light-dark(#7c3aed, #c4b5fd)" strokeWidth={1.75} />

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
    </Card>
  );
}
