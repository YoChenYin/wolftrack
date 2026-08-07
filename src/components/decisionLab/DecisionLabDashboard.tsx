"use client";

import { useState } from "react";
import { Compass, ChevronDown } from "lucide-react";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { InfoTooltip } from "../InfoTooltip";
import { twReturnColor } from "@/lib/tw/color";
import type { DecisionLabSnapshotView } from "@/lib/decisionLab/querySnapshot";
import { REGIME_LABELS } from "@/lib/decisionLab/types";

const STRATEGY_LABELS: Record<string, string> = {
  trendFollowing: "Trend Following",
  breakout: "Breakout",
  meanReversion: "Mean Reversion",
  scalping: "Scalping",
  noTrade: "No Trade",
};

function formatPct(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function scoreColor(score: number, max: number): string {
  if (max === 0) return "text-zinc-400 dark:text-zinc-500";
  const ratio = score / max;
  if (ratio >= 0.65) return "text-red-600 dark:text-red-400";
  if (ratio <= 0.35) return "text-emerald-600 dark:text-emerald-400";
  return "text-zinc-600 dark:text-zinc-300";
}

/** Decision Lab：總經頁最上方，M1全球市場/M7 Regime/M8 Trading Score/M9 Scenario/M10 Trading Plan（Phase 1範圍） */
export function DecisionLabDashboard({ snapshot }: { snapshot: DecisionLabSnapshotView | null }) {
  const [showFactors, setShowFactors] = useState(false);

  if (!snapshot) {
    return (
      <Card>
        <SectionHeader icon={Compass} iconColor="violet" title="Decision Lab" />
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">尚未有今日的 Decision Lab 分析結果，排程更新後會出現在這裡。</p>
      </Card>
    );
  }

  const missingFactors = snapshot.factors.filter((f) => f.value === null);

  return (
    <Card>
      <SectionHeader
        icon={Compass}
        iconColor="violet"
        title="Decision Lab"
        tooltip={
          <InfoTooltip>
            全球市場決策儀表板，Phase 1 範圍：全球市場行情、市場狀態(Regime)、Trading Score、今日情境劇本、交易計畫建議。不是喊單，是提供資訊讓你自己判斷；Macro/Liquidity/Sentiment/Breadth
            四個因子資料源尚未建置，Trading Score 目前滿分上限低於100，詳見展開的因子明細。
          </InfoTooltip>
        }
      />
      <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">資料日期：{snapshot.snapshotDate}</p>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Trading Score</p>
          <p className={`font-[family:var(--font-tw-display)] text-4xl font-semibold ${scoreColor(snapshot.tradingScore, snapshot.maxPossibleScore)}`}>
            {snapshot.tradingScore}
            <span className="text-lg text-zinc-400 dark:text-zinc-500"> / {snapshot.maxPossibleScore}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Market Regime</p>
          <p className="text-xl font-semibold text-zinc-800 dark:text-zinc-100">{REGIME_LABELS[snapshot.regime]}</p>
          <p className="max-w-xs text-[11px] text-zinc-400 dark:text-zinc-500">{snapshot.regimeReasoning}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowFactors((v) => !v)}
        className="mt-3 flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showFactors ? "rotate-180" : ""}`} strokeWidth={2.25} />
        因子明細（{snapshot.factors.length - missingFactors.length}/{snapshot.factors.length} 項有資料）
      </button>
      {showFactors && (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {snapshot.factors.map((f) => (
            <div key={f.key} className="rounded-lg bg-zinc-50 p-2.5 text-[11px] dark:bg-white/[0.04]">
              <div className="flex items-center justify-between">
                <span className="font-medium text-zinc-600 dark:text-zinc-300">
                  {f.label} <span className="text-zinc-400 dark:text-zinc-500">({f.weight}%)</span>
                </span>
                <span className={f.value === null ? "text-zinc-300 dark:text-zinc-600" : "font-semibold text-zinc-700 dark:text-zinc-200"}>
                  {f.value === null ? "無資料" : f.value}
                </span>
              </div>
              <p className="mt-0.5 text-zinc-400 dark:text-zinc-500">{f.detail}</p>
            </div>
          ))}
        </div>
      )}

      {/* M1 Global Market Heatmap */}
      <h4 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">全球市場</h4>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 md:grid-cols-9">
        {snapshot.globalMarket.map((entry) => (
          <div key={entry.ticker} className="rounded-lg bg-zinc-50 p-2 text-center dark:bg-white/[0.04]">
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{entry.ticker}</p>
            <p className={`text-[12px] font-semibold ${twReturnColor(entry.changePct)}`}>{formatPct(entry.changePct)}</p>
          </div>
        ))}
      </div>

      {/* M9 Scenario Generator */}
      <h4 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">今日情境劇本</h4>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {snapshot.scenarios.map((s) => (
          <div key={s.label} className="rounded-lg bg-zinc-50 p-3 text-[12px] dark:bg-white/[0.04]">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">情境 {s.label}</span>
              <span className="font-[family:var(--font-tw-mono)] font-semibold text-violet-600 dark:text-violet-400">{s.probability}%</span>
            </div>
            <p className="mt-1 font-medium text-zinc-600 dark:text-zinc-300">{s.description}</p>
            <p className="mt-1.5 text-zinc-400 dark:text-zinc-500">條件：{s.condition}</p>
            <p className="mt-0.5 text-zinc-400 dark:text-zinc-500">風險：{s.risk}</p>
            <p className="mt-0.5 text-zinc-400 dark:text-zinc-500">策略：{s.strategy}</p>
          </div>
        ))}
      </div>

      {/* M10 Trading Plan */}
      <h4 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">交易計畫建議</h4>
      <div className="flex flex-wrap items-center gap-4 rounded-lg bg-zinc-50 p-3 dark:bg-white/[0.04]">
        <div>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500">建議策略</p>
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{STRATEGY_LABELS[snapshot.tradingPlanStrategy] ?? snapshot.tradingPlanStrategy}</p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500">建議曝險</p>
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{snapshot.suggestedSizePct}%</p>
        </div>
        <div className="flex-1 basis-full sm:basis-0">
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500">理由</p>
          <p className="text-[12px] text-zinc-600 dark:text-zinc-300">{snapshot.tradingPlanReason}</p>
        </div>
      </div>
    </Card>
  );
}
