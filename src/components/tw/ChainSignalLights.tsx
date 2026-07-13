"use client";

import { useEffect, useState } from "react";
import { InfoTooltip } from "../InfoTooltip";

interface ChainStageSignal {
  stageKey: string;
  label: string;
  memberCount: number;
  signalRate: number;
  statusBreakdown: Record<string, number>;
  avgReturn5d: number | null;
  light: "green" | "yellow" | "gray";
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

export function ChainSignalLights() {
  const [chains, setChains] = useState<ChainSignalResult[] | null>(null);

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
          每個階段（上游/中游/下游/支援層）目前有多少比例的成員股票觸發戰術訊號（反轉雷達/蓄勢待發/趨勢穩健/籌碼領先），加上近5日族群平均報酬，綜合判斷燈號：🟢活躍（訊號比例≥30%或近5日報酬≥3%）、🟡初動（有訊號或近5日報酬&gt;0）、⚪平靜（都沒有）。可以看出這條鏈現在誰噴、誰還沒動。
        </InfoTooltip>
      </h2>

      <div className="mt-3 flex flex-col gap-4">
        {chains.map((chain) => {
          const sortedStages = [...chain.stages].sort(
            (a, b) => STAGE_ORDER.indexOf(a.stageKey) - STAGE_ORDER.indexOf(b.stageKey)
          );
          return (
            <div key={chain.chainName} className="rounded border border-zinc-100 p-3">
              <p className="text-sm font-medium text-zinc-800">{chain.chainNameFull}</p>
              <div className="mt-2 flex flex-wrap items-stretch gap-2">
                {sortedStages.map((stage, i) => (
                  <div key={stage.stageKey} className="flex items-center gap-2">
                    <div className={`rounded-md px-2.5 py-1.5 text-xs ring-1 ${LIGHT_STYLE[stage.light].ring}`}>
                      <div className="flex items-center gap-1 font-medium text-zinc-700">
                        <span>{LIGHT_STYLE[stage.light].emoji}</span>
                        {stage.label.split("：")[0]}
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
                    </div>
                    {i < sortedStages.length - 1 && <span className="text-zinc-300">→</span>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
