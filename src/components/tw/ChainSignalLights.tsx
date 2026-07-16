"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { InfoTooltip } from "../InfoTooltip";
import { stripCompanySuffix } from "@/lib/formatCompanyName";

interface ChainStageMember {
  ticker: string;
  companyName: string;
  status: string | null;
  return5d: number | null;
}

interface ChainStageSignal {
  stageKey: string;
  label: string;
  memberCount: number;
  signalRate: number;
  statusBreakdown: Record<string, number>;
  avgReturn5d: number | null;
  light: "green" | "yellow" | "gray";
  members: ChainStageMember[];
}

interface ChainSignalResult {
  chainName: string;
  chainNameFull: string;
  stages: ChainStageSignal[];
}

/** 上游→中游→下游→支援層的固定顯示順序，Object.entries() 的 key 順序不保證符合邏輯順序 */
const STAGE_ORDER = ["upstream", "midstream", "downstream", "support"];

const LIGHT_STYLE: Record<string, { emoji: string; ring: string }> = {
  green: { emoji: "🟢", ring: "ring-emerald-200 bg-emerald-50" },
  yellow: { emoji: "🟡", ring: "ring-amber-200 bg-amber-50" },
  gray: { emoji: "⚪", ring: "ring-zinc-200 bg-zinc-50" },
};

const STATUS_LABELS: Record<string, string> = {
  reversal: "反轉雷達",
  pullback: "蓄勢待發",
  bullish: "趨勢穩健",
  chipLeading: "籌碼領先",
  limitMove: "漲跌停",
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
          每個階段（上游/中游/下游/支援層）目前有多少比例的成員股票觸發戰術訊號（反轉雷達/蓄勢待發/趨勢穩健/籌碼領先），加上近5日族群平均報酬，綜合判斷燈號：🟢活躍（訊號比例≥30%或近5日報酬≥3%）、🟡初動（有訊號或近5日報酬&gt;0）、⚪平靜（都沒有）。點擊各階段可以展開看實際成員股票。
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
                          <span>{LIGHT_STYLE[stage.light].emoji}</span>
                          {stage.label.split("：")[0]}
                          {stage.memberCount > 0 && (
                            <span className="text-zinc-400">{isOpen ? "▲" : "▼"}</span>
                          )}
                        </div>
                        {stage.memberCount > 0 ? (
                          <div className="mt-0.5 text-[10px] text-zinc-500">
                            {Object.entries(stage.statusBreakdown)
                              .map(([status, count]) => `${STATUS_LABELS[status] ?? status}${count}`)
                              .join(" ") || "無訊號"}
                            {" · 5日"}
                            {formatPct(stage.avgReturn5d)}
                          </div>
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
                        <span className="font-medium text-zinc-700">
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
