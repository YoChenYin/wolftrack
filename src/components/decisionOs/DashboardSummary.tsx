"use client";

import { useState } from "react";
import { Gauge, ShieldAlert, ChevronDown } from "lucide-react";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { InfoTooltip } from "../InfoTooltip";
import type { DecisionOsSnapshotView } from "@/lib/decisionOs/queryLatestSnapshot";

const STANCE_LABEL: Record<string, string> = { bull: "偏多", bear: "偏空", neutral: "震盪" };
const STRATEGY_LABEL: Record<string, string> = {
  swingLong: "波段做多",
  swingShort: "波段放空",
  rangeBound: "區間操作",
  flat: "空手",
};
const RISK_LABEL: Record<string, string> = { low: "低", medium: "中", high: "高" };

function starsFromScore(totalScore: number): number {
  if (totalScore >= 15) return 5;
  if (totalScore >= 8) return 4;
  if (totalScore >= 3) return 3;
  if (totalScore >= -2) return 2;
  if (totalScore >= -7) return 2;
  if (totalScore >= -14) return 1;
  return 1;
}

function StanceStars({ score }: { score: number }) {
  const filled = starsFromScore(score);
  const color = score > 2 ? "text-red-600 dark:text-red-400" : score < -2 ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400 dark:text-zinc-500";
  return (
    <span className={`font-[family:var(--font-tw-mono)] text-2xl tracking-wider ${color}`}>
      {"★".repeat(filled)}
      <span className="text-zinc-200 dark:text-zinc-700">{"★".repeat(5 - filled)}</span>
    </span>
  );
}

/** 台指期 Decision OS 首頁 Dashboard：9項標準輸出（PRD第9節），30秒讓使用者知道今天值不值得交易 */
export function DashboardSummary({ snapshot }: { snapshot: DecisionOsSnapshotView | null }) {
  const [showReasons, setShowReasons] = useState(false);

  if (!snapshot) {
    return (
      <Card>
        <SectionHeader icon={Gauge} iconColor="amber" title="今日市場 Dashboard" />
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">尚未有今日的 Decision OS 分析結果，排程更新後會出現在這裡。</p>
      </Card>
    );
  }

  const blockingGates = snapshot.gates.filter((g) => g.action.includes("禁止") || g.action.includes("不交易"));

  return (
    <Card>
      <SectionHeader
        icon={Gauge}
        iconColor="amber"
        title="今日市場 Dashboard"
        tooltip={
          <InfoTooltip>
            八層分析框架的最終彙總（MVP階段：台股環境/法人籌碼/技術分析三層，其餘四層資料源尚在建置中，詳見 Decision OS PRD 第15節）。分數用確定性 Decision Engine 計算，Agent 辯論引擎為下一階段。
          </InfoTooltip>
        }
      />
      <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">資料日期：{snapshot.tradeDate}</p>

      {blockingGates.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200 dark:bg-amber-400/10 dark:ring-amber-400/20">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={2.25} />
          <div className="text-xs text-amber-800 dark:text-amber-300">
            <p className="font-semibold">關卡引擎已否決今日新倉</p>
            {blockingGates.map((g) => (
              <p key={g.gateNumber} className="mt-0.5">
                {g.gateName}：{g.detail}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">今日市場評分</p>
          <StanceStars score={snapshot.totalScore} />
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">市場結論</p>
          <p className="text-xl font-semibold text-zinc-800 dark:text-zinc-100">{STANCE_LABEL[snapshot.finalStance]}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="建議策略" value={STRATEGY_LABEL[snapshot.strategy]} />
        <Stat label="風險等級" value={RISK_LABEL[snapshot.riskLevel]} />
        <Stat label="建議倉位" value={`${snapshot.suggestedSizePct}%`} />
        <Stat label="信心分數" value={`${snapshot.finalConfidence}`} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <InfoBox label="進場條件" value={snapshot.entryCondition} />
        <InfoBox label="停損" value={snapshot.stopLossPrice !== null ? snapshot.stopLossPrice.toFixed(0) : "—"} />
        <InfoBox label="停利" value={snapshot.takeProfitPrice !== null ? snapshot.takeProfitPrice.toFixed(0) : "—"} />
      </div>

      <button
        type="button"
        onClick={() => setShowReasons((v) => !v)}
        className="mt-4 flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showReasons ? "rotate-180" : ""}`} strokeWidth={2.25} />
        理由（{snapshot.finalStance === "neutral" ? "偏多訊號 / 偏空訊號" : "支持 / 反對"}）
      </button>
      {showReasons && (
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-red-50 p-3 text-[12px] ring-1 ring-red-100 dark:bg-red-400/5 dark:ring-red-400/10">
            <p className="mb-1.5 font-semibold text-red-700 dark:text-red-400">
              {snapshot.finalStance === "neutral" ? "偏多訊號" : "支持理由"}
            </p>
            {snapshot.supportingReasons.length === 0 ? (
              <p className="text-zinc-400 dark:text-zinc-500">今日沒有明確的偏多證據。</p>
            ) : (
              <ul className="list-inside list-disc space-y-1 text-zinc-600 dark:text-zinc-300">
                {snapshot.supportingReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-lg bg-emerald-50 p-3 text-[12px] ring-1 ring-emerald-100 dark:bg-emerald-400/5 dark:ring-emerald-400/10">
            <p className="mb-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
              {snapshot.finalStance === "neutral" ? "偏空訊號" : "反對理由"}
            </p>
            {snapshot.opposingReasons.length === 0 ? (
              <p className="text-zinc-400 dark:text-zinc-500">今日沒有明確的偏空證據。</p>
            ) : (
              <ul className="list-inside list-disc space-y-1 text-zinc-600 dark:text-zinc-300">
                {snapshot.opposingReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{label}</p>
      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{value}</p>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 p-3 dark:bg-white/[0.04]">
      <p className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{label}</p>
      <p className="mt-0.5 text-[13px] text-zinc-700 dark:text-zinc-200">{value}</p>
    </div>
  );
}
