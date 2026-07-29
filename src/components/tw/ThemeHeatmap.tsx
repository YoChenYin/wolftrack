"use client";

import { useState } from "react";
import { LayoutGrid } from "lucide-react";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { FetchError } from "../ui/FetchError";
import { useJsonFetch } from "@/lib/useJsonFetch";

interface ThemeChainStage {
  chainName: string;
  stageKey: string;
  label: string;
}

interface ThemeHeatmapCell {
  themeName: string;
  category: string;
  return5d: number | null;
  return10d: number | null;
  return20d: number | null;
  concentration5d: number | null;
  concentration10d: number | null;
  concentration20d: number | null;
  sampleSize: number;
  chainStages: ThemeChainStage[];
}

/** 鏈位階配色：上游藍、中游紫、下游橘、支援層灰，跟熱圖本身的綠紅漲跌配色區隔開 */
const STAGE_COLORS: Record<string, string> = {
  upstream: "bg-blue-50 text-blue-700",
  midstream: "bg-violet-50 text-violet-700",
  downstream: "bg-amber-50 text-amber-700",
  support: "bg-zinc-100 text-zinc-600",
};

/** 報酬率映到熱圖底色：台股慣例正值紅(漲)、負值綠(跌)，深淺依幅度（±5% 封頂，超過一樣是最深色） */
function heatColor(value: number | null): string {
  if (value === null) return "transparent";
  const clamped = Math.max(-5, Math.min(5, value));
  const intensity = Math.abs(clamped) / 5; // 0~1
  if (clamped >= 0) {
    const alpha = 0.12 + intensity * 0.55;
    return `rgba(190, 60, 45, ${alpha.toFixed(2)})`;
  }
  const alpha = 0.12 + intensity * 0.55;
  return `rgba(16, 122, 90, ${alpha.toFixed(2)})`;
}

function textColor(value: number | null): string {
  if (value === null) return "#a1a1aa";
  return Math.abs(value) >= 2.5 ? "#fff" : value >= 0 ? "#8a2e20" : "#0f5c43";
}

/** 台股慣例：買超(正)=紅、賣超(負)=綠，跟報酬率配色邏輯一致 */
function concentrationColor(value: number | null): string {
  if (value === null) return "text-zinc-300";
  if (value > 0) return "text-red-600";
  if (value < 0) return "text-emerald-600";
  return "text-zinc-400";
}

function formatPct(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function ReturnCell({ return: r, concentration }: { return: number | null; concentration: number | null }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span
        className="inline-block w-16 rounded px-1.5 py-0.5 text-right font-medium"
        style={{ background: heatColor(r), color: textColor(r) }}
      >
        {formatPct(r)}
      </span>
      <span className={`text-[10px] font-medium ${concentrationColor(concentration)}`}>
        籌{formatPct(concentration)}
      </span>
    </div>
  );
}

export function ThemeHeatmap({ onSelectTheme }: { onSelectTheme: (themeName: string) => void }) {
  const { data, error, retry } = useJsonFetch<{ cells: ThemeHeatmapCell[] }>("/api/theme-heatmap");
  const [sortBy, setSortBy] = useState<"return5d" | "return10d" | "return20d">("return20d");
  const [chainFilter, setChainFilter] = useState<string | null>(null);
  const cells = data?.cells ?? null;

  if (error) {
    return (
      <Card>
        <SectionHeader icon={LayoutGrid} iconColor="violet" title="板塊熱圖" />
        <FetchError message={error} onRetry={retry} />
      </Card>
    );
  }

  if (!cells) {
    return (
      <Card>
        <SectionHeader icon={LayoutGrid} iconColor="violet" title="板塊熱圖" />
        <p className="mt-2 text-xs text-zinc-400">載入中…</p>
      </Card>
    );
  }

  const chainNames = [...new Set(cells.flatMap((c) => c.chainStages.map((s) => s.chainName)))];
  const filtered = chainFilter ? cells.filter((c) => c.chainStages.some((s) => s.chainName === chainFilter)) : cells;
  const sorted = [...filtered].sort((a, b) => (b[sortBy] ?? -999) - (a[sortBy] ?? -999));

  return (
    <Card>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SectionHeader icon={LayoutGrid} iconColor="violet" title="板塊熱圖" />
        <div className="flex flex-wrap gap-1 text-[11px]">
          {(["return5d", "return10d", "return20d"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSortBy(key)}
              className={`rounded px-2 py-1 font-medium ${
                sortBy === key ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              }`}
            >
              依{key === "return5d" ? "5日" : key === "return10d" ? "10日" : "20日"}排序
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-[11px] text-zinc-400">
        族群成員平均報酬率（上）與籌碼集中度（下，籌碼領先股價，投信外資買超佔量能比例），點列可直接篩選該板塊；標籤是該板塊在產業鏈上的位置
      </p>

      <div className="mt-2 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setChainFilter(null)}
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            chainFilter === null ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
          }`}
        >
          全部產業鏈
        </button>
        {chainNames.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setChainFilter(name)}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              chainFilter === name ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="mt-3 max-h-80 overflow-y-auto overflow-x-auto">
        <table className="w-full min-w-[420px] text-xs">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left text-zinc-400">
              <th className="pb-1.5 font-normal">板塊</th>
              <th className="w-20 pb-1.5 text-right font-normal">5日</th>
              <th className="w-20 pb-1.5 text-right font-normal">10日</th>
              <th className="w-20 pb-1.5 text-right font-normal">20日</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((cell) => (
              <tr
                key={cell.themeName}
                onClick={() => onSelectTheme(cell.themeName)}
                className="cursor-pointer border-t border-zinc-50 hover:bg-zinc-50"
              >
                <td className="py-1 pr-2 font-medium text-zinc-800">
                  {cell.themeName}
                  {cell.sampleSize > 0 && <span className="ml-1 text-[10px] font-normal text-zinc-400">({cell.sampleSize})</span>}
                  {cell.chainStages.map((s) => (
                    <span
                      key={`${s.chainName}-${s.stageKey}`}
                      className={`ml-1 rounded px-1 py-0.5 text-[9px] font-normal ${STAGE_COLORS[s.stageKey] ?? "bg-zinc-100 text-zinc-500"}`}
                    >
                      {s.chainName}·{s.label.split("：")[0]}
                    </span>
                  ))}
                </td>
                <td className="py-1">
                  <ReturnCell return={cell.return5d} concentration={cell.concentration5d} />
                </td>
                <td className="py-1">
                  <ReturnCell return={cell.return10d} concentration={cell.concentration10d} />
                </td>
                <td className="py-1">
                  <ReturnCell return={cell.return20d} concentration={cell.concentration20d} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
