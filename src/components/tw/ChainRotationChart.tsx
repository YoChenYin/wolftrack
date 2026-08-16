"use client";

import { useState } from "react";
import { Waypoints } from "lucide-react";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { InfoTooltip } from "../InfoTooltip";
import { FetchError } from "../ui/FetchError";
import { useJsonFetch } from "@/lib/useJsonFetch";

interface ChainRotationStageSeries {
  stageKey: string;
  label: string;
  values: (number | null)[];
  latestConcentration5d: number | null;
}

interface ChainRotationResult {
  chainName: string;
  chainNameFull: string;
  dates: string[];
  stages: ChainRotationStageSeries[];
}

/** 階段固定配色，上游→下游用色相漸層排列，跨鏈切換時同一個stageKey顏色不變，方便記憶 */
const STAGE_COLORS: Record<string, string> = {
  upstream: "#dc2626",
  midstream: "#d97706",
  downstream: "#059669",
  support: "#4f46e5",
};

const CHART_WIDTH = 760;
const CHART_HEIGHT = 260;
const PADDING = { top: 12, right: 12, bottom: 24, left: 44 };

function concentrationBadgeClass(value: number | null): string {
  if (value === null) return "bg-zinc-100 text-zinc-400 dark:bg-white/5 dark:text-zinc-600";
  if (value >= 20) return "bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-400";
  if (value >= 10) return "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400";
  return "bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400";
}

/**
 * 產業鏈資金輪動（2026-08-16）：跟ChainSignalLights（單點snapshot）、ThemeFlowChart
 * （跨鏈但不分階段）不同，這裡是「單一產業鏈」的上中下游階段資金這幾個月怎麼輪動——
 * 用tab切換要看哪條鏈，同一張圖疊加各階段最新籌碼集中度（見computeChainRotation.ts）。
 */
export function ChainRotationChart() {
  const { data, error, retry } = useJsonFetch<{ chains: ChainRotationResult[] }>("/api/chain-rotation");
  const [activeChain, setActiveChain] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hiddenStages, setHiddenStages] = useState<Set<string>>(new Set());

  if (error) {
    return (
      <Card>
        <SectionHeader icon={Waypoints} iconColor="emerald" title="產業鏈資金輪動" />
        <FetchError message={error} onRetry={retry} />
      </Card>
    );
  }

  if (!data || data.chains.length === 0) {
    return (
      <Card>
        <SectionHeader icon={Waypoints} iconColor="emerald" title="產業鏈資金輪動" />
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">載入中…</p>
      </Card>
    );
  }

  const chain = data.chains.find((c) => c.chainName === activeChain) ?? data.chains[0];
  const { dates, stages } = chain;
  const visibleStages = stages.filter((s) => !hiddenStages.has(s.stageKey));

  let strongestStage: string | null = null;
  let weakestStage: string | null = null;
  if (hoverIndex !== null) {
    const atHover = visibleStages
      .map((s) => ({ stageKey: s.stageKey, value: s.values[hoverIndex] }))
      .filter((s): s is { stageKey: string; value: number } => s.value !== null);
    if (atHover.length > 0) {
      strongestStage = atHover.reduce((a, b) => (b.value > a.value ? b : a)).stageKey;
      weakestStage = atHover.reduce((a, b) => (b.value < a.value ? b : a)).stageKey;
    }
  }

  const allValues = visibleStages.flatMap((s) => s.values.filter((v): v is number => v !== null));
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
  function toggleStage(stageKey: string) {
    setHiddenStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageKey)) next.delete(stageKey);
      else next.add(stageKey);
      return next;
    });
  }

  const yTicks = 4;
  const tickValues = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks);

  return (
    <Card>
      <SectionHeader
        icon={Waypoints}
        iconColor="emerald"
        title="產業鏈資金輪動"
        tooltip={
          <InfoTooltip>
            單一產業鏈的上中下游階段近半年族群平均累積報酬時間序列，疊加各階段最新籌碼集中度——
            看資金這幾個月怎麼從上游流向下游（或反過來），跟動能一起轉強的階段最值得留意。
          </InfoTooltip>
        }
      />

      <div className="mt-2 flex flex-wrap gap-1.5">
        {data.chains.map((c) => (
          <button
            key={c.chainName}
            type="button"
            onClick={() => {
              setActiveChain(c.chainName);
              setHiddenStages(new Set());
            }}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              c.chainName === chain.chainName
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-400 dark:hover:bg-white/15"
            }`}
          >
            {c.chainNameFull}
          </button>
        ))}
      </div>

      {dates.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">這條鏈目前沒有足夠的價格歷史。</p>
      ) : (
        <>
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

              {visibleStages.map((s) => {
                const isStrongest = s.stageKey === strongestStage;
                const isWeakest = s.stageKey === weakestStage;
                const isExtreme = isStrongest || isWeakest;
                return (
                  <path
                    key={s.stageKey}
                    d={toPath(s.values)}
                    fill="none"
                    stroke={STAGE_COLORS[s.stageKey] ?? "#71717a"}
                    strokeWidth={hoverIndex === null ? 2 : isExtreme ? 3 : 1}
                    opacity={hoverIndex === null ? 0.9 : isExtreme ? 1 : 0.25}
                  />
                );
              })}

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

              {dates.map((_, i) => (
                <rect
                  key={i}
                  x={xFor(i) - innerW / dates.length / 2}
                  y={PADDING.top}
                  width={innerW / dates.length}
                  height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setHoverIndex(i)}
                />
              ))}

              {[0, Math.floor(dates.length / 2), dates.length - 1].map((i) => (
                <text key={i} x={xFor(i)} y={CHART_HEIGHT - 6} textAnchor="middle" fontSize="9" fill="light-dark(#a1a1aa, #71717a)">
                  {dates[i]?.slice(5)}
                </text>
              ))}
            </svg>
          </div>

          {hoverIndex !== null && (
            <div className="mt-1 rounded bg-zinc-50 p-2 text-[11px] dark:bg-white/5">
              <span className="font-medium text-zinc-600 dark:text-zinc-300">{dates[hoverIndex]}</span>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                {stages
                  .filter((s) => !hiddenStages.has(s.stageKey))
                  .map((s) => ({ ...s, v: s.values[hoverIndex] }))
                  .sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity))
                  .map(({ stageKey, label, v }) => (
                    <span
                      key={stageKey}
                      className={`flex items-center gap-1 ${
                        stageKey === strongestStage || stageKey === weakestStage
                          ? "font-medium text-zinc-700 dark:text-zinc-200"
                          : "text-zinc-500 dark:text-zinc-400"
                      }`}
                    >
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: STAGE_COLORS[stageKey] ?? "#71717a" }} />
                      {label}
                      <span className={v !== null && v >= 100 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}>
                        {v !== null ? `${(v - 100).toFixed(1)}%` : "—"}
                      </span>
                    </span>
                  ))}
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {stages.map((s) => (
              <button
                key={s.stageKey}
                type="button"
                onClick={() => toggleStage(s.stageKey)}
                className={`flex items-center gap-1.5 text-[11px] ${
                  hiddenStages.has(s.stageKey) ? "text-zinc-300 dark:text-zinc-600" : "text-zinc-600 dark:text-zinc-300"
                }`}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: hiddenStages.has(s.stageKey) ? "#e4e4e7" : STAGE_COLORS[s.stageKey] ?? "#71717a" }}
                />
                {s.label}
                <span className={`rounded px-1 py-0.5 font-medium ${concentrationBadgeClass(s.latestConcentration5d)}`}>
                  籌碼{s.latestConcentration5d !== null ? `${s.latestConcentration5d.toFixed(0)}%` : "N/A"}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
