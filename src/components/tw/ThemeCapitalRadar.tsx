"use client";

import { Compass } from "lucide-react";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { IconBadge } from "../ui/IconBadge";
import { FetchError } from "../ui/FetchError";
import { InfoTooltip } from "../InfoTooltip";
import { useJsonFetch } from "@/lib/useJsonFetch";
import { twReturnColor } from "@/lib/tw/color";
import { classifyThemeMomentum, THEME_MOMENTUM_META, type ThemeMomentumBucket } from "@/lib/valuation/themeMomentum";

interface ThemeHeatmapCell {
  themeName: string;
  category: string;
  return1d: number | null;
  return5d: number | null;
  return10d: number | null;
  return20d: number | null;
  concentration1d: number | null;
  concentration5d: number | null;
  concentration10d: number | null;
  concentration20d: number | null;
  sampleSize: number;
}

const TOP_N = 6;
const BUCKET_ORDER: ThemeMomentumBucket[] = ["leading", "outflowing", "accumulating"];

function formatPct(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function RadarRow({ rank, cell, onSelect }: { rank: number; cell: ThemeHeatmapCell; onSelect: (themeName: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(cell.themeName)}
      className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-zinc-50 dark:hover:bg-white/5"
    >
      <span className="mt-0.5 w-4 shrink-0 text-[11px] font-medium text-zinc-300 dark:text-zinc-600">{rank}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">{cell.themeName}</p>
        <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
          今日 <span className={twReturnColor(cell.return1d)}>{formatPct(cell.return1d)}</span>
          {" ・ "}本週 <span className={twReturnColor(cell.return5d)}>{formatPct(cell.return5d)}</span>
        </p>
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
          籌碼 今日 <span className={twReturnColor(cell.concentration1d)}>{formatPct(cell.concentration1d)}</span>
          {" ・ "}本週 <span className={twReturnColor(cell.concentration5d)}>{formatPct(cell.concentration5d)}</span>
        </p>
      </div>
    </button>
  );
}

function RadarColumn({ bucket, cells, onSelect }: { bucket: ThemeMomentumBucket; cells: ThemeHeatmapCell[]; onSelect: (themeName: string) => void }) {
  const meta = THEME_MOMENTUM_META[bucket];
  return (
    <div className="flex-1">
      <div className="flex items-center gap-1.5">
        <IconBadge icon={meta.icon} color={meta.color} size="sm" />
        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{meta.label}</p>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">({cells.length})</span>
      </div>
      <div className="mt-1.5 flex flex-col">
        {cells.length === 0 ? (
          <p className="px-1.5 py-2 text-[11px] text-zinc-400 dark:text-zinc-500">目前沒有明顯訊號</p>
        ) : (
          cells.map((cell, i) => <RadarRow key={cell.themeName} rank={i + 1} cell={cell} onSelect={onSelect} />)
        )}
      </div>
    </div>
  );
}

/**
 * 「板塊資金雷達」：把板塊熱圖（ThemeHeatmap.tsx）裡的原始數字直接分類成三份排行榜，
 * 不用使用者自己盯著表格解讀——強勢籌碼集中/資金流出/悄悄進場中，分類邏輯見
 * themeMomentum.ts的classifyThemeMomentum()。跟ThemeHeatmap共用同一個
 * /api/theme-heatmap endpoint，只是多了client端的分類+排序。
 */
export function ThemeCapitalRadar({ onSelectTheme }: { onSelectTheme: (themeName: string) => void }) {
  const { data, error, retry } = useJsonFetch<{ cells: ThemeHeatmapCell[] }>("/api/theme-heatmap");

  if (error) {
    return (
      <Card>
        <SectionHeader icon={Compass} iconColor="amber" title="板塊資金雷達" />
        <FetchError message={error} onRetry={retry} />
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <SectionHeader icon={Compass} iconColor="amber" title="板塊資金雷達" />
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">載入中…</p>
      </Card>
    );
  }

  const bucketed = new Map<ThemeMomentumBucket, ThemeHeatmapCell[]>([
    ["leading", []],
    ["outflowing", []],
    ["accumulating", []],
  ]);
  for (const cell of data.cells) {
    const bucket = classifyThemeMomentum(cell);
    if (bucket) bucketed.get(bucket)!.push(cell);
  }
  bucketed.get("leading")!.sort((a, b) => (b.return5d ?? -Infinity) - (a.return5d ?? -Infinity));
  bucketed.get("outflowing")!.sort((a, b) => (a.concentration5d ?? Infinity) - (b.concentration5d ?? Infinity));
  bucketed.get("accumulating")!.sort((a, b) => (b.concentration5d ?? -Infinity) - (a.concentration5d ?? -Infinity));

  return (
    <Card>
      <SectionHeader
        icon={Compass}
        iconColor="amber"
        title="板塊資金雷達"
        tooltip={
          <InfoTooltip>
            把板塊熱圖的今日/本週報酬率+籌碼集中度直接分成三種情境：強勢籌碼集中（本週籌碼集中、今天還在買、報酬已經噴出）、資金流出（本週籌碼淨流出、今天還在賣）、悄悄進場中（本週籌碼集中、今天還在買，但報酬還沒噴出——籌碼通常領先股價，這是超前部署的情境）。樣本數過少的板塊不分類。
          </InfoTooltip>
        }
      />
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:gap-3">
        {BUCKET_ORDER.map((bucket) => (
          <RadarColumn key={bucket} bucket={bucket} cells={bucketed.get(bucket)!.slice(0, TOP_N)} onSelect={onSelectTheme} />
        ))}
      </div>
    </Card>
  );
}
