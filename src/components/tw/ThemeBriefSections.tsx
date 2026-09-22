import Link from "next/link";
import { Crown, Layers, Scale, LineChart, Newspaper } from "lucide-react";
import type { ThemeResearchBrief } from "@/lib/valuation/computeThemeResearchBrief";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { InfoTooltip } from "../InfoTooltip";
import { GroupValuationTable } from "./GroupValuationTable";
import { BacktestValidationTable } from "./BacktestValidationTable";
import { ThemeNarrativePanel } from "./ThemeNarrativePanel";

const STAGE_COLORS: Record<string, string> = {
  upstream: "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-400",
  midstream: "bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-400",
  downstream: "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400",
  support: "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-400",
};

/**
 * 一份 theme 研究簡報的完整區塊——結構/估值/歷史驗證/敘事面，固定欄位。這是「模板」真正
 * 的意思：theme層級頁（/tw/chains/theme/[themeName]）跟chain層級頁（/tw/chains/[chainName]，
 * 依階段迭代每個theme）共用同一份元件，換一個theme就重新產生一份，不用另外維護兩套 UI。
 */
export function ThemeBriefSections({ brief, standalone = true }: { brief: ThemeResearchBrief; standalone?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="flex items-center justify-between gap-2">
          <SectionHeader icon={Layers} iconColor="zinc" title={brief.themeName} />
          {!standalone && (
            <Link
              href={`/tw/chains/theme/${encodeURIComponent(brief.themeName)}`}
              className="shrink-0 text-xs font-medium text-violet-600 hover:underline dark:text-violet-400"
            >
              看獨立頁 →
            </Link>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {brief.chainStages.length > 0 ? (
            brief.chainStages.map((s) => (
              <span
                key={`${s.chainName}-${s.stageKey}`}
                className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STAGE_COLORS[s.stageKey] ?? STAGE_COLORS.support}`}
              >
                {s.chainName}・{s.label}
              </span>
            ))
          ) : (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-400/10 dark:text-amber-400">
              尚未分類進任何產業鏈
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          共 {brief.members.length} 檔成分股
          {brief.leader.length > 0 && (
            <span className="ml-1.5 inline-flex items-center gap-1">
              <Crown className="h-3 w-3 text-amber-500" strokeWidth={2.25} />
              龍頭：{brief.leader.join("、")}
            </span>
          )}
        </p>
      </Card>

      <Card>
        <SectionHeader icon={Scale} iconColor="blue" title="估值比較" />
        <div className="mt-3">
          <GroupValuationTable group={brief.valuation} />
        </div>
      </Card>

      <Card>
        <SectionHeader
          icon={LineChart}
          iconColor="violet"
          title="歷史驗證"
          tooltip={
            <InfoTooltip>
              把這個theme成分股過去每一次戰術訊號觸發後的實際報酬（5/10/20/40/60日）跟同期大盤比較，
              判斷訊號歷史上是不是真的有效，不是只憑現在的技術面/籌碼面現況推測。
            </InfoTooltip>
          }
        />
        <div className="mt-3">
          <BacktestValidationTable themeBacktest={brief.backtest} marketBaseline={brief.marketBaseline} />
        </div>
      </Card>

      <Card>
        <SectionHeader icon={Newspaper} iconColor="amber" title="敘事面" />
        <div className="mt-3">
          <ThemeNarrativePanel narrative={brief.narrative} />
        </div>
      </Card>
    </div>
  );
}
