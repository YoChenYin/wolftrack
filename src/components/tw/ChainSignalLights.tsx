"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, Zap, Circle, TrendingDown, TrendingUp, CheckCircle2, Crown, type LucideIcon } from "lucide-react";
import { InfoTooltip } from "../InfoTooltip";
import { stripCompanySuffix } from "@/lib/formatCompanyName";

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
  green: { icon: Flame, iconClassName: "text-emerald-600", ring: "ring-emerald-200 bg-emerald-50" },
  yellow: { icon: Zap, iconClassName: "text-amber-600", ring: "ring-amber-200 bg-amber-50" },
  gray: { icon: Circle, iconClassName: "text-zinc-400", ring: "ring-zinc-200 bg-zinc-50" },
  declining: { icon: TrendingDown, iconClassName: "text-sky-600", ring: "ring-sky-200 bg-sky-50" },
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
  leadersOnly: { icon: Flame, iconClassName: "text-orange-600", label: "龍頭領漲，二軍未動" },
  broadRally: { icon: CheckCircle2, iconClassName: "text-emerald-600", label: "全面齊漲" },
  followersCatchingUp: { icon: TrendingUp, iconClassName: "text-blue-600", label: "二軍補漲" },
};

function formatPct(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/** 台股慣例：漲=紅、跌=綠（跟美股相反） */
function returnColor(value: number | null): string {
  if (value === null) return "text-zinc-400";
  if (value > 0) return "text-red-600";
  if (value < 0) return "text-emerald-600";
  return "text-zinc-500";
}

export function ChainSignalLights() {
  const [chains, setChains] = useState<ChainSignalResult[] | null>(null);
  // key格式："<chainName>::<stageKey>"，同時間只展開一個階段的成員清單
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/chain-signals")
      .then((res) => res.json())
      .then((data: { chains: ChainSignalResult[] }) => setChains(data.chains));
  }, []);

  if (!chains) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">產業鏈訊號燈號</h2>
        <p className="mt-2 text-xs text-zinc-400">載入中…</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="flex items-center gap-1 text-sm font-semibold text-zinc-900">
        產業鏈訊號燈號
        <InfoTooltip>
          每個階段（上游/中游/下游/支援層）目前有多少比例的成員股票觸發籌碼流訊號（進場/出場/逢低布局），加上近5日族群平均報酬與實際上漲/下跌檔數，綜合判斷燈號：走弱（近5日報酬&lt;-1%，不管訊號比例多高都優先判定，避免訊號跟實際下跌方向矛盾）、活躍（近5日報酬≥3%，或訊號比例≥30%且報酬沒有轉負）、初動（有訊號或報酬&gt;0）、平靜（都沒有）。
          <br />
          <br />
          額外把龍頭股（group_config.json標記的leader）跟其餘成員（二軍）分開算近5日報酬，判斷現在漲的是誰：龍頭領漲＝只有龍頭平均漲≥2%、二軍還沒動；全面齊漲＝龍頭二軍都漲≥2%，最強的擴散狀態；二軍補漲＝龍頭已經緩下來、換二軍漲≥2%，通常代表這波族群動能接近尾聲。同樣是30%訊號比例，「龍頭剛啟動」跟「連二軍都補漲完」代表的階段完全不同，只看聚合平均看不出這個差異。點擊各階段可以展開看實際成員股票（皇冠圖示標記龍頭）。
        </InfoTooltip>
      </h2>

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
            <div key={chain.chainName} className="rounded border border-zinc-100 p-3">
              <p className="text-sm font-medium text-zinc-800">{chain.chainNameFull}</p>
              <div className="mt-2 flex flex-wrap items-stretch gap-2">
                {sortedStages.map((stage, i) => {
                  const key = `${chain.chainName}::${stage.stageKey}`;
                  const isOpen = key === expandedKey;
                  return (
                    <div key={stage.stageKey} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandedKey(isOpen ? null : key)}
                        disabled={stage.memberCount === 0}
                        className={`rounded-md px-2.5 py-1.5 text-left text-xs ring-1 transition-shadow disabled:cursor-default ${
                          LIGHT_STYLE[stage.light].ring
                        } ${isOpen ? "ring-2 ring-zinc-400" : "hover:ring-zinc-300"}`}
                      >
                        <div className="flex items-center gap-1 font-medium text-zinc-700">
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
                            <span className="text-zinc-400">{isOpen ? "▲" : "▼"}</span>
                          )}
                        </div>
                        {stage.memberCount > 0 ? (
                          <>
                            <div className="mt-0.5 text-[10px] text-zinc-500">
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
                              <div className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-zinc-600">
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
                            <div className="mt-0.5 text-[10px] text-zinc-400">
                              龍頭({stage.leaders.count}檔) {formatPct(stage.leaders.avgReturn5d)} · 二軍(
                              {stage.followers.count}檔) {formatPct(stage.followers.avgReturn5d)}
                            </div>
                          </>
                        ) : (
                          <div className="mt-0.5 text-[10px] text-zinc-400">無成員資料</div>
                        )}
                      </button>
                      {i < sortedStages.length - 1 && <span className="text-zinc-300">→</span>}
                    </div>
                  );
                })}
              </div>

              {activeStage && (
                <div className="mt-2 rounded border border-zinc-100 bg-zinc-50 p-2">
                  <p className="mb-1.5 text-[11px] font-medium text-zinc-500">
                    {activeStage.label.split("：")[0]} 成員股票（依近5日報酬排序）
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeStage.members.map((member) => (
                      <Link
                        key={member.ticker}
                        href={`/tw/stock/${member.ticker}`}
                        className="flex items-center gap-1.5 rounded border border-zinc-200 bg-white px-2 py-1 text-[11px] hover:border-zinc-300"
                      >
                        <span className="inline-flex items-center gap-1 font-medium text-zinc-700">
                          {member.isLeader && (
                            <span title="龍頭股">
                              <Crown className="h-3 w-3 text-amber-500" />
                            </span>
                          )}
                          {member.ticker} {stripCompanySuffix(member.companyName)}
                        </span>
                        {member.status && (
                          <span className="text-zinc-400">{STATUS_LABELS[member.status] ?? member.status}</span>
                        )}
                        <span className={`font-medium ${returnColor(member.return5d)}`}>
                          {formatPct(member.return5d)}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
