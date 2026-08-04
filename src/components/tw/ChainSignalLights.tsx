"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Flame,
  Zap,
  Circle,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  Crown,
  Workflow,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { InfoTooltip } from "../InfoTooltip";
import { stripCompanySuffix } from "@/lib/formatCompanyName";
import { Card, SubCard } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { FetchError } from "../ui/FetchError";
import { useJsonFetch } from "@/lib/useJsonFetch";

interface ChainStageMember {
  ticker: string;
  companyName: string;
  status: string | null;
  return5d: number | null;
  isLeader: boolean;
}

interface ChainTierStats {
  count: number;
  avgReturn5d: number | null;
  risingCount: number;
  fallingCount: number;
}

interface ChainStageSignal {
  stageKey: string;
  label: string;
  memberCount: number;
  signalRate: number;
  statusBreakdown: Record<string, number>;
  avgReturn5d: number | null;
  risingCount: number;
  fallingCount: number;
  light: "green" | "yellow" | "gray" | "declining";
  leaders: ChainTierStats;
  followers: ChainTierStats;
  phase: "leadersOnly" | "broadRally" | "followersCatchingUp" | "mixed";
  members: ChainStageMember[];
}

interface ChainSignalResult {
  chainName: string;
  chainNameFull: string;
  stages: ChainStageSignal[];
}

/** 上游→中游→下游→支援層的固定顯示順序，Object.entries() 的 key 順序不保證符合邏輯順序 */
const STAGE_ORDER = ["upstream", "midstream", "downstream", "support"];

const LIGHT_STYLE: Record<string, { icon: LucideIcon; iconClassName: string; ring: string }> = {
  green: {
    icon: Flame,
    iconClassName: "text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-200 bg-emerald-50 dark:ring-emerald-400/20 dark:bg-emerald-400/10",
  },
  yellow: {
    icon: Zap,
    iconClassName: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-200 bg-amber-50 dark:ring-amber-400/20 dark:bg-amber-400/10",
  },
  gray: {
    icon: Circle,
    iconClassName: "text-zinc-400 dark:text-zinc-500",
    ring: "ring-zinc-200 bg-zinc-50 dark:ring-white/10 dark:bg-white/5",
  },
  declining: {
    icon: TrendingDown,
    iconClassName: "text-sky-600 dark:text-sky-400",
    ring: "ring-sky-200 bg-sky-50 dark:ring-sky-400/20 dark:bg-sky-400/10",
  },
};

const STATUS_LABELS: Record<string, string> = {
  entry: "進場",
  exit: "出場",
  buyDip: "逢低布局",
  limitMove: "漲跌停",
};

/** mixed不顯示任何文字，避免多空不明/資料不足的情況硬湊一個沒有意義的標籤 */
const PHASE_LABELS: Record<
  Exclude<ChainStageSignal["phase"], "mixed">,
  { icon: LucideIcon; iconClassName: string; label: string }
> = {
  leadersOnly: { icon: Flame, iconClassName: "text-orange-600 dark:text-orange-400", label: "龍頭領漲，二軍未動" },
  broadRally: { icon: CheckCircle2, iconClassName: "text-emerald-600 dark:text-emerald-400", label: "全面齊漲" },
  followersCatchingUp: { icon: TrendingUp, iconClassName: "text-blue-600 dark:text-blue-400", label: "二軍補漲" },
};

function formatPct(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/** 台股慣例：漲=紅、跌=綠（跟美股相反） */
function returnColor(value: number | null): string {
  if (value === null) return "text-zinc-400 dark:text-zinc-500";
  if (value > 0) return "text-red-600 dark:text-red-400";
  if (value < 0) return "text-emerald-600 dark:text-emerald-400";
  return "text-zinc-500 dark:text-zinc-400";
}

export function ChainSignalLights() {
  const { data, error, retry } = useJsonFetch<{ chains: ChainSignalResult[] }>("/api/chain-signals");
  // key格式："<chainName>::<stageKey>"，同時間只展開一個階段的成員清單
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const chains = data?.chains ?? null;

  if (error) {
    return (
      <Card>
        <SectionHeader icon={Workflow} iconColor="violet" title="產業鏈訊號燈號" />
        <FetchError message={error} onRetry={retry} />
      </Card>
    );
  }

  if (!chains) {
    return (
      <Card>
        <SectionHeader icon={Workflow} iconColor="violet" title="產業鏈訊號燈號" />
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">載入中…</p>
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader
        icon={Workflow}
        iconColor="violet"
        title="產業鏈訊號燈號"
        tooltip={
          <InfoTooltip>
            每個階段（上游/中游/下游/支援層）目前有多少比例的成員股票觸發籌碼流訊號（進場/出場/逢低布局），加上近5日族群平均報酬與實際上漲/下跌檔數，綜合判斷燈號：走弱（近5日報酬&lt;-1%，不管訊號比例多高都優先判定，避免訊號跟實際下跌方向矛盾）、活躍（近5日報酬≥3%，或訊號比例≥30%且報酬沒有轉負）、初動（有訊號或報酬&gt;0）、平靜（都沒有）。
            <br />
            <br />
            額外把龍頭股（group_config.json標記的leader）跟其餘成員（二軍）分開算近5日報酬，判斷現在漲的是誰：龍頭領漲＝只有龍頭平均漲≥2%、二軍還沒動；全面齊漲＝龍頭二軍都漲≥2%，最強的擴散狀態；二軍補漲＝龍頭已經緩下來、換二軍漲≥2%，通常代表這波族群動能接近尾聲。同樣是30%訊號比例，「龍頭剛啟動」跟「連二軍都補漲完」代表的階段完全不同，只看聚合平均看不出這個差異。點擊各階段可以展開看實際成員股票（皇冠圖示標記龍頭）。
          </InfoTooltip>
        }
      />

      <div className="mt-3 flex flex-col gap-4">
        {chains.map((chain) => {
          const sortedStages = [...chain.stages].sort(
            (a, b) => STAGE_ORDER.indexOf(a.stageKey) - STAGE_ORDER.indexOf(b.stageKey)
          );
          const activeKey = sortedStages
            .map((s) => `${chain.chainName}::${s.stageKey}`)
            .find((k) => k === expandedKey);
          const activeStage = sortedStages.find((s) => `${chain.chainName}::${s.stageKey}` === activeKey);

          return (
            <SubCard key={chain.chainName}>
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{chain.chainNameFull}</p>
              <div className="mt-2 flex flex-col sm:flex-row sm:flex-wrap sm:items-stretch gap-2">
                {sortedStages.map((stage, i) => {
                  const key = `${chain.chainName}::${stage.stageKey}`;
                  const isOpen = key === expandedKey;
                  return (
                    <div key={stage.stageKey} className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandedKey(isOpen ? null : key)}
                        disabled={stage.memberCount === 0}
                        className={`w-full rounded-md px-2.5 py-1.5 text-left text-xs ring-1 transition-shadow disabled:cursor-default sm:w-auto ${
                          LIGHT_STYLE[stage.light].ring
                        } ${isOpen ? "ring-2 ring-zinc-400 dark:ring-zinc-500" : "hover:ring-zinc-300 dark:hover:ring-white/20"}`}
                      >
                        <div className="flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300">
                          {(() => {
                            const LightIcon = LIGHT_STYLE[stage.light].icon;
                            return (
                              <LightIcon
                                className={`h-3.5 w-3.5 ${LIGHT_STYLE[stage.light].iconClassName}`}
                                strokeWidth={2.25}
                              />
                            );
                          })()}
                          {stage.label.split("：")[0]}
                          {stage.memberCount > 0 && (
                            <span className="text-zinc-400 dark:text-zinc-500">{isOpen ? "▲" : "▼"}</span>
                          )}
                        </div>
                        {stage.memberCount > 0 ? (
                          <>
                            <div className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                              {stage.risingCount}漲{stage.fallingCount}跌 · 5日
                              <span className={`font-medium ${returnColor(stage.avgReturn5d)}`}>
                                {formatPct(stage.avgReturn5d)}
                              </span>
                              {Object.keys(stage.statusBreakdown).length > 0 && (
                                <>
                                  {" · "}
                                  {Object.entries(stage.statusBreakdown)
                                    .map(([status, count]) => `${STATUS_LABELS[status] ?? status}${count}`)
                                    .join(" ")}
                                </>
                              )}
                            </div>
                            {stage.phase !== "mixed" && (
                              <div className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-zinc-600 dark:text-zinc-400">
                                {(() => {
                                  const PhaseIcon = PHASE_LABELS[stage.phase].icon;
                                  return (
                                    <PhaseIcon
                                      className={`h-3 w-3 ${PHASE_LABELS[stage.phase].iconClassName}`}
                                      strokeWidth={2.25}
                                    />
                                  );
                                })()}
                                {PHASE_LABELS[stage.phase].label}
                              </div>
                            )}
                            <div className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
                              龍頭({stage.leaders.count}檔) {formatPct(stage.leaders.avgReturn5d)} · 二軍(
                              {stage.followers.count}檔) {formatPct(stage.followers.avgReturn5d)}
                            </div>
                          </>
                        ) : (
                          <div className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">無成員資料</div>
                        )}
                      </button>
                      {i < sortedStages.length - 1 && (
                        <>
                          <ChevronDown
                            className="h-3.5 w-3.5 self-center text-zinc-300 dark:text-zinc-600 sm:hidden"
                            strokeWidth={2.25}
                          />
                          <ChevronRight
                            className="hidden h-3.5 w-3.5 text-zinc-300 dark:text-zinc-600 sm:block"
                            strokeWidth={2.25}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {activeStage && (
                <div className="mt-2 rounded-lg bg-white p-2 ring-1 ring-zinc-900/[0.04] dark:bg-white/[0.03] dark:ring-white/[0.06]">
                  <p className="mb-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                    {activeStage.label.split("：")[0]} 成員股票（依近5日報酬排序）
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeStage.members.map((member) => (
                      <Link
                        key={member.ticker}
                        href={`/tw/stock/${member.ticker}`}
                        className="flex items-center gap-1.5 rounded-md bg-zinc-50 px-2 py-1 text-[11px] ring-1 ring-zinc-900/[0.04] transition-colors hover:bg-zinc-100 dark:bg-white/[0.04] dark:ring-white/[0.06] dark:hover:bg-white/10"
                      >
                        <span className="inline-flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300">
                          {member.isLeader && (
                            <span title="龍頭股">
                              <Crown className="h-3 w-3 text-amber-500" />
                            </span>
                          )}
                          {member.ticker} {stripCompanySuffix(member.companyName)}
                        </span>
                        {member.status && (
                          <span className="text-zinc-400 dark:text-zinc-500">
                            {STATUS_LABELS[member.status] ?? member.status}
                          </span>
                        )}
                        <span className={`font-medium ${returnColor(member.return5d)}`}>
                          {formatPct(member.return5d)}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </SubCard>
          );
        })}
      </div>
    </Card>
  );
}
