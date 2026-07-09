"use client";

import { useEffect, useState, useTransition } from "react";
import { TrendColumn } from "./TrendColumn";
import { GroupValuationTable } from "./tw/GroupValuationTable";
import { ThemeHeatmap } from "./tw/ThemeHeatmap";
import { ChipLeadingList } from "./tw/ChipLeadingList";
import { UNCATEGORIZED_THEME_CODE } from "@/lib/valuation/groupConfig";
import type { SectorTrendsGrouped } from "@/lib/trend/sectorTrendsQuery";
import type { GroupValuationResult } from "@/lib/valuation/computeGroupValuation";
import type { Market } from "@/generated/prisma/enums";

export interface SectorOption {
  sectorCode: string;
  sectorName: string;
  sectorNameZh: string | null;
}

export interface ThemeOption {
  themeCode: string;
  themeName: string;
  themeNameZh: string | null;
}

export function SectorTrendsBoard({
  market,
  sectors,
  themes,
  initialData,
}: {
  market: Market;
  sectors: SectorOption[];
  themes: ThemeOption[];
  initialData: SectorTrendsGrouped;
}) {
  const [selectedSector, setSelectedSector] = useState<string>(initialData.sector);
  const [selectedTheme, setSelectedTheme] = useState<string>(initialData.theme);
  const [data, setData] = useState<SectorTrendsGrouped>(initialData);
  const [isPending, startTransition] = useTransition();

  // 選了非「全部」的板塊時秀出該族群的 PE/PB 估值比較（只有 TW 的板塊對應 group_config.json
  // theme，「未分類」是虛擬選項沒有對應 theme，兩者都不用打這支 API）
  const [groupValuation, setGroupValuation] = useState<GroupValuationResult | null>(null);
  const [valuationLoading, setValuationLoading] = useState(false);

  function fetchTrends(sectorCode: string, themeCode: string) {
    startTransition(async () => {
      const params = new URLSearchParams({ market, sector: sectorCode, theme: themeCode });
      const res = await fetch(`/api/sector-trends?${params.toString()}`);
      const next: SectorTrendsGrouped = await res.json();
      setData(next);
    });
  }

  useEffect(() => {
    if (market !== "TW" || selectedSector === "all" || selectedSector === UNCATEGORIZED_THEME_CODE) {
      setGroupValuation(null);
      return;
    }
    let cancelled = false;
    setValuationLoading(true);
    fetch(`/api/theme-valuation?theme=${encodeURIComponent(selectedSector)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((result: GroupValuationResult | null) => {
        if (!cancelled) setGroupValuation(result);
      })
      .finally(() => {
        if (!cancelled) setValuationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [market, selectedSector]);

  function handleSelectSector(sectorCode: string) {
    setSelectedSector(sectorCode);
    fetchTrends(sectorCode, selectedTheme);
  }

  function handleSelectTheme(themeCode: string) {
    setSelectedTheme(themeCode);
    fetchTrends(selectedSector, themeCode);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="sector-select" className="w-14 shrink-0 text-xs font-medium text-zinc-400">
            板塊
          </label>
          <select
            id="sector-select"
            value={selectedSector}
            onChange={(e) => handleSelectSector(e.target.value)}
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700"
          >
            <option value="all">全部板塊</option>
            {sectors.map((sector) => (
              <option key={sector.sectorCode} value={sector.sectorCode}>
                {sector.sectorNameZh ?? sector.sectorName}
              </option>
            ))}
          </select>
        </div>

        {themes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-14 shrink-0 text-xs font-medium text-zinc-400">題材</span>
            <FilterPill label="全部題材" active={selectedTheme === "all"} onClick={() => handleSelectTheme("all")} />
            {themes.map((theme) => (
              <FilterPill
                key={theme.themeCode}
                label={theme.themeNameZh ?? theme.themeName}
                active={selectedTheme === theme.themeCode}
                onClick={() => handleSelectTheme(theme.themeCode)}
              />
            ))}
          </div>
        )}
      </div>

      {data.asOfDate && <p className="text-xs text-zinc-400">資料日期（as of）：{data.asOfDate}</p>}

      {market === "TW" && <ThemeHeatmap onSelectTheme={handleSelectSector} />}

      {selectedSector !== "all" && selectedSector !== UNCATEGORIZED_THEME_CODE && (
        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-900">{selectedSector} · PE/PB 估值比較</h2>
          {valuationLoading && <p className="mt-2 text-xs text-zinc-400">載入中…</p>}
          {!valuationLoading && groupValuation && (
            <div className="mt-3">
              <GroupValuationTable group={groupValuation} />
            </div>
          )}
          {!valuationLoading && !groupValuation && (
            <p className="mt-2 text-xs text-zinc-400">這個板塊目前沒有估值資料。</p>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TrendColumn market={market} status="reversal" items={data.groups.reversal} loading={isPending} />
        <TrendColumn market={market} status="pullback" items={data.groups.pullback} loading={isPending} />
        <TrendColumn market={market} status="bullish" items={data.groups.bullish} loading={isPending} />
      </div>

      {market === "TW" && <ChipLeadingList items={data.chipLeading} />}
    </div>
  );
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}
