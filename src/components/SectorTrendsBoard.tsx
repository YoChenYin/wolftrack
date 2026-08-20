"use client";

import { useEffect, useState, useTransition } from "react";
import { Scale } from "lucide-react";
import { TrendColumn } from "./TrendColumn";
import { TrendTable } from "./TrendTable";
import { TACTICAL_STATUS_META } from "@/lib/trend/tacticalStatusMeta";
import { GroupValuationTable } from "./tw/GroupValuationTable";
import { UNCATEGORIZED_THEME_CODE } from "@/lib/valuation/groupConfig";
import { Card } from "./ui/Card";
import { SectionHeader } from "./ui/SectionHeader";
import type { SectorTrendsGrouped, TacticalStatus } from "@/lib/trend/sectorTrendsQuery";
import type { GroupValuationResult } from "@/lib/valuation/computeGroupValuation";
import type { BadgeStats } from "@/lib/trend/tw/backtestSummary";
import type { Market } from "@/generated/prisma/enums";

/** 台股五段式依多空分組，給下面的tab切換用。刻意定義在這個client component裡而不是
 * sectorTrendsQuery.ts——那個檔案開頭 import { prisma }，就算只匯出這兩個常數，value import
 * （不像type import會被erase）還是會把整個module、連帶Prisma client一起打進client bundle，
 * 2026-08-17第一次這樣做時本機就直接500（"chunking context does not support external modules"）。 */
const TW_LONG_STATUSES: TacticalStatus[] = ["trustTurnBuy", "combinedBuy", "buyDip", "bottomPattern"];
const TW_SHORT_STATUSES: TacticalStatus[] = ["trustTurnSell", "combinedSell"];

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
  backtestStats,
}: {
  market: Market;
  sectors: SectorOption[];
  themes: ThemeOption[];
  initialData: SectorTrendsGrouped;
  /** 2026-08-21新增：戰術訊號回測結果（見backtestSummary.ts），key是分類名稱，跟sector/theme
   * 篩選無關的靜態資料，只在首次載入查一次，不用像data那樣切換篩選時重查 */
  backtestStats?: Record<string, BadgeStats>;
}) {
  const [selectedSector, setSelectedSector] = useState<string>(initialData.sector);
  const [selectedTheme, setSelectedTheme] = useState<string>(initialData.theme);
  const [data, setData] = useState<SectorTrendsGrouped>(initialData);
  const [isPending, startTransition] = useTransition();
  /** 2026-08-17：台股改多空五段式，UI用tab切換要看多方（投信轉買/投信外資合買/逢低布局）
   * 還是空方（投信轉賣/投信外資合賣，沒有逢低布局的空方對應概念）。
   * 2026-08-18：多方/空方底下的3(或2)個分類本身也改成tab切換（原本是並排卡片），一次只看
   * 一個分類的表格，切換分類跟切換多空是兩層不同的tab，UI故意做出不同樣式區分層級。
   * 2026-08-20：多方再加第4個分類「底部出現」（頭肩底/N字底反轉型態，見detectBottomPattern.ts）
   * ——技術上跟其他4個不同，不是對應status的某個值而是bottomPatternStage不是null，
   * 但對TW_LONG_STATUSES/UI來說一樣當成6選1 tab的其中一個，見sectorTrendsQuery.ts的
   * TacticalStatus型別說明。 */
  const [twSide, setTwSide] = useState<"long" | "short">("long");
  const [selectedCategory, setSelectedCategory] = useState<TacticalStatus>(TW_LONG_STATUSES[0]);

  function handleSelectSide(side: "long" | "short") {
    setTwSide(side);
    setSelectedCategory(side === "long" ? TW_LONG_STATUSES[0] : TW_SHORT_STATUSES[0]);
  }

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

  // 只有選了非「全部」的板塊時才需要打這支API，切回「全部」時不用特地清掉groupValuation
  // 狀態——底下render時本來就會用showValuation擋住，不會顯示過期資料
  const showValuation = market === "TW" && selectedSector !== "all" && selectedSector !== UNCATEGORIZED_THEME_CODE;

  useEffect(() => {
    if (!showValuation) return;
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
  }, [showValuation, selectedSector]);

  function handleSelectSector(sectorCode: string) {
    setSelectedSector(sectorCode);
    fetchTrends(sectorCode, selectedTheme);
  }

  function handleSelectTheme(themeCode: string) {
    setSelectedTheme(themeCode);
    fetchTrends(selectedSector, themeCode);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {/* 2026-08-19：板塊下拉選單移除（使用者要求）——現在改用/tw/chains的板塊熱圖點選來篩選
              （見ThemeHeatmapWithNavigation.tsx，導到 /tw?sector=X），這裡只保留「目前篩選中」的
              狀態顯示 + 清除按鈕，不提供從這頁手動選板塊的入口 */}
          {selectedSector !== "all" && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">篩選中</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                {sectors.find((s) => s.sectorCode === selectedSector)?.sectorNameZh ?? selectedSector}
                <button type="button" onClick={() => handleSelectSector("all")} className="text-white/70 hover:text-white dark:text-zinc-900/60 dark:hover:text-zinc-900">
                  ✕
                </button>
              </span>
            </div>
          )}

          {themes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-14 shrink-0 text-xs font-medium text-zinc-400 dark:text-zinc-500">題材</span>
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

        {data.asOfDate && (
          <p className="text-xs text-zinc-400 dark:text-zinc-500">資料日期（as of）：{data.asOfDate}</p>
        )}

        {showValuation && (
          <Card>
            <SectionHeader icon={Scale} iconColor="blue" title={`${selectedSector} · PE/PB 估值比較`} />
            {valuationLoading && <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">載入中…</p>}
            {!valuationLoading && groupValuation && (
              <div className="mt-3">
                <GroupValuationTable group={groupValuation} />
              </div>
            )}
            {!valuationLoading && !groupValuation && (
              <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">這個板塊目前沒有估值資料。</p>
            )}
          </Card>
        )}

        {market === "TW" ? (
          <>
            <div className="flex gap-2">
              <FilterPill label="多方" active={twSide === "long"} onClick={() => handleSelectSide("long")} />
              <FilterPill label="空方" active={twSide === "short"} onClick={() => handleSelectSide("short")} />
            </div>
            <CategoryTabs
              statuses={twSide === "long" ? TW_LONG_STATUSES : TW_SHORT_STATUSES}
              selected={selectedCategory}
              onSelect={setSelectedCategory}
            />
            <TrendTable
              status={selectedCategory}
              items={data.groups[selectedCategory]}
              loading={isPending}
              backtestStats={backtestStats?.[selectedCategory]}
            />
          </>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <TrendColumn market={market} status="reversal" items={data.groups.reversal} loading={isPending} />
            <TrendColumn market={market} status="pullback" items={data.groups.pullback} loading={isPending} />
            <TrendColumn market={market} status="bullish" items={data.groups.bullish} loading={isPending} />
          </div>
        )}
      </div>
    </div>
  );
}

/** 多方/空方底下的分類切換——用底線tab（不是圓角pill）跟上一層的FilterPill做出樣式區分，
 * 讓使用者一眼看出這是巢狀的第二層篩選，不是跟多方/空方平行的另一組選項。 */
function CategoryTabs({
  statuses,
  selected,
  onSelect,
}: {
  statuses: TacticalStatus[];
  selected: TacticalStatus;
  onSelect: (status: TacticalStatus) => void;
}) {
  return (
    <div className="flex gap-4 overflow-x-auto border-b border-zinc-200 dark:border-white/10">
      {statuses.map((status) => {
        const active = status === selected;
        return (
          <button
            key={status}
            type="button"
            onClick={() => onSelect(status)}
            className={`shrink-0 whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
              active
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "border-transparent text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            }`}
          >
            {TACTICAL_STATUS_META[status].title}
          </button>
        );
      })}
    </div>
  );
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15"
      }`}
    >
      {label}
    </button>
  );
}
