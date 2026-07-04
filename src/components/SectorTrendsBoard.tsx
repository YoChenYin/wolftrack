"use client";

import { useState, useTransition } from "react";
import { TrendColumn } from "./TrendColumn";
import type { SectorTrendsGrouped } from "@/lib/trend/sectorTrendsQuery";
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

  function fetchTrends(sectorCode: string, themeCode: string) {
    startTransition(async () => {
      const params = new URLSearchParams({ market, sector: sectorCode, theme: themeCode });
      const res = await fetch(`/api/sector-trends?${params.toString()}`);
      const next: SectorTrendsGrouped = await res.json();
      setData(next);
    });
  }

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
          <span className="w-14 shrink-0 text-xs font-medium text-zinc-400">板塊</span>
          <FilterPill label="全部板塊" active={selectedSector === "all"} onClick={() => handleSelectSector("all")} />
          {sectors.map((sector) => (
            <FilterPill
              key={sector.sectorCode}
              label={sector.sectorNameZh ?? sector.sectorName}
              active={selectedSector === sector.sectorCode}
              onClick={() => handleSelectSector(sector.sectorCode)}
            />
          ))}
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TrendColumn market={market} status="reversal" items={data.groups.reversal} loading={isPending} />
        <TrendColumn market={market} status="pullback" items={data.groups.pullback} loading={isPending} />
        <TrendColumn market={market} status="bullish" items={data.groups.bullish} loading={isPending} />
      </div>
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
