"use client";

import { useEffect, useState } from "react";

interface ThemeFlowSeries {
  category: string;
  values: (number | null)[];
}

interface ThemeFlowResult {
  dates: string[];
  series: ThemeFlowSeries[];
}

/** 14個大分類固定配色，跨次渲染保持一致，方便使用者記顏色 */
const CATEGORY_COLORS: Record<string, string> = {
  機器人: "#0f7a5c",
  記憶體儲存: "#2563eb",
  面板顯示: "#7c3aed",
  通訊航太: "#c026d3",
  電動車: "#db2777",
  能源: "#ea580c",
  景氣循環: "#a16207",
  金融消費: "#65a30d",
  ETF: "#0891b2",
  "半導體先進製程與晶圓生態圈": "#dc2626",
  "AI 伺服器與硬體物理基礎建設": "#059669",
  "被動元件與高階零組件模組板塊": "#4f46e5",
  "次世代網通與矽光子 CPO 生態圈": "#0d9488",
  "關鍵利基科技與高成長動能新賽道": "#9333ea",
};

const CHART_WIDTH = 760;
const CHART_HEIGHT = 280;
const PADDING = { top: 12, right: 12, bottom: 24, left: 44 };

export function ThemeFlowChart() {
  const [data, setData] = useState<ThemeFlowResult | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/theme-flow")
      .then((res) => res.json())
      .then(setData);
  }, []);

  if (!data || data.dates.length === 0) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">板塊資金流動</h2>
        <p className="mt-2 text-xs text-zinc-400">載入中…</p>
      </section>
    );
  }

  const { dates, series } = data;
  const visibleSeries = series.filter((s) => !hiddenCategories.has(s.category));
  const allValues = visibleSeries.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const minV = allValues.length > 0 ? Math.min(...allValues, 100) : 95;
  const maxV = allValues.length > 0 ? Math.max(...allValues, 100) : 105;
  const yPad = Math.max((maxV - minV) * 0.1, 1);
  const yMin = minV - yPad;
  const yMax = maxV + yPad;

  const innerW = CHART_WIDTH - PADDING.left - PADDING.right;
  const innerH = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  function xFor(i: number): number {
    return PADDING.left + (dates.length <= 1 ? 0 : (i / (dates.length - 1)) * innerW);
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
      const cmd = started ? "L" : "M";
      d += `${cmd}${xFor(i).toFixed(1)},${yFor(v).toFixed(1)} `;
      started = true;
    });
    return d.trim();
  }

  function toggleCategory(category: string) {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  const yTicks = 4;
  const tickValues = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-zinc-900">板塊資金流動</h2>
      <p className="mt-0.5 text-[11px] text-zinc-400">
        14 大分類近{dates.length}個交易日的族群平均累積報酬指數（起點=100），看資金往哪個板塊移動。點圖例可隱藏/顯示該線。
      </p>

      <div className="mt-3 overflow-x-auto">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="w-full min-w-[560px]"
          onMouseLeave={() => setHoverIndex(null)}
        >
          {tickValues.map((v, i) => (
            <g key={i}>
              <line
                x1={PADDING.left}
                x2={CHART_WIDTH - PADDING.right}
                y1={yFor(v)}
                y2={yFor(v)}
                stroke="#f4f4f5"
                strokeWidth={1}
              />
              <text x={PADDING.left - 6} y={yFor(v) + 3} textAnchor="end" fontSize="9" fill="#a1a1aa">
                {v.toFixed(0)}
              </text>
            </g>
          ))}
          <line
            x1={PADDING.left}
            x2={CHART_WIDTH - PADDING.right}
            y1={yFor(100)}
            y2={yFor(100)}
            stroke="#d4d4d8"
            strokeWidth={1}
            strokeDasharray="3,3"
          />

          {visibleSeries.map((s) => (
            <path
              key={s.category}
              d={toPath(s.values)}
              fill="none"
              stroke={CATEGORY_COLORS[s.category] ?? "#71717a"}
              strokeWidth={hoverIndex !== null ? 1.5 : 1.75}
              opacity={0.85}
            />
          ))}

          {hoverIndex !== null && (
            <line
              x1={xFor(hoverIndex)}
              x2={xFor(hoverIndex)}
              y1={PADDING.top}
              y2={CHART_HEIGHT - PADDING.bottom}
              stroke="#d4d4d8"
              strokeWidth={1}
            />
          )}

          {dates.map((_, i) => (
            <rect
              key={i}
              x={xFor(i) - (innerW / dates.length) / 2}
              y={PADDING.top}
              width={innerW / dates.length}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
            />
          ))}

          {[0, Math.floor(dates.length / 2), dates.length - 1].map((i) => (
            <text key={i} x={xFor(i)} y={CHART_HEIGHT - 6} textAnchor="middle" fontSize="9" fill="#a1a1aa">
              {dates[i]?.slice(5)}
            </text>
          ))}
        </svg>
      </div>

      {hoverIndex !== null && (
        <div className="mt-1 rounded bg-zinc-50 p-2 text-[11px]">
          <span className="font-medium text-zinc-600">{dates[hoverIndex]}</span>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-3">
            {series
              .filter((s) => !hiddenCategories.has(s.category))
              .map((s) => {
                const v = s.values[hoverIndex];
                return (
                  <span key={s.category} className="flex items-center gap-1 text-zinc-500">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: CATEGORY_COLORS[s.category] ?? "#71717a" }}
                    />
                    {s.category}
                    <span className={v !== null && v >= 100 ? "text-emerald-600" : "text-red-600"}>
                      {v !== null ? `${(v - 100).toFixed(1)}%` : "—"}
                    </span>
                  </span>
                );
              })}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
        {series.map((s) => (
          <button
            key={s.category}
            type="button"
            onClick={() => toggleCategory(s.category)}
            className={`flex items-center gap-1 text-[11px] ${
              hiddenCategories.has(s.category) ? "text-zinc-300" : "text-zinc-600"
            }`}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: hiddenCategories.has(s.category) ? "#e4e4e7" : CATEGORY_COLORS[s.category] ?? "#71717a" }}
            />
            {s.category}
          </button>
        ))}
      </div>
    </section>
  );
}
