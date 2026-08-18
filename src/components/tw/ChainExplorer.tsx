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
  ArrowUp,
  ArrowDown,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { InfoTooltip } from "../InfoTooltip";
import { stripCompanySuffix } from "@/lib/formatCompanyName";
import { Card, SubCard } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { FetchError } from "../ui/FetchError";
import { useJsonFetch } from "@/lib/useJsonFetch";

interface ChainAdjacentStock {
  ticker: string;
  companyName: string;
}

interface ChainStageMember {
  ticker: string;
  companyName: string;
  status: string | null;
  return5d: number | null;
  closePrice: number | null;
  todayChangeAmount: number | null;
  todayChangePct: number | null;
  isLeader: boolean;
}

interface ChainTierStats {
  count: number;
  avgReturn5d: number | null;
  risingCount: number;
  fallingCount: number;
}

interface ChainThemeGroup {
  themeName: string;
  memberCount: number;
  members: ChainStageMember[];
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
  themeGroups: ChainThemeGroup[];
  adjacentMembers: { upstream: ChainAdjacentStock[]; downstream: ChainAdjacentStock[] };
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
  trustTurnBuy: "投信轉買",
  combinedBuy: "投信外資合買",
  buyDip: "逢低布局",
  trustTurnSell: "投信轉賣",
  combinedSell: "投信外資合賣",
  entry: "進場",
  exit: "出場",
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

function ChangeCell({ amount, pct }: { amount: number | null; pct: number | null }) {
  if (amount === null) return <span className="text-zinc-300 dark:text-zinc-600">—</span>;
  const Icon = amount > 0 ? ArrowUp : amount < 0 ? ArrowDown : null;
  return (
    <div className={`flex flex-col items-end ${returnColor(amount)}`}>
      <span className="inline-flex items-center gap-0.5 font-medium tabular-nums">
        {Icon && <Icon className="h-3 w-3" strokeWidth={2.5} />}
        {Math.abs(amount).toFixed(2)}
      </span>
      <span className="text-[11px] tabular-nums opacity-80">{pct !== null ? formatPct(pct) : ""}</span>
    </div>
  );
}

/** 同一階段的股票目前共用同一份上/下游名單（資料只到「哪些股票屬於哪個階段」的粒度，
 * 沒有個股對個股的實際供應鏈配對），顯示上限制3檔+"還有N檔"避免表格被撐爆 */
function AdjacentChips({ label, stocks }: { label: string; stocks: ChainAdjacentStock[] }) {
  if (stocks.length === 0) return <span className="text-zinc-300 dark:text-zinc-600">—</span>;
  const shown = stocks.slice(0, 3);
  const rest = stocks.length - shown.length;
  const fullList = stocks.map((s) => `${s.ticker} ${stripCompanySuffix(s.companyName)}`).join("、");
  return (
    <div className="flex flex-wrap items-center gap-1" title={`${label}：${fullList}`}>
      {shown.map((s) => (
        <Link
          key={s.ticker}
          href={`/tw/stock/${s.ticker}`}
          className="rounded bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 ring-1 ring-zinc-900/[0.04] transition-colors hover:bg-zinc-100 dark:bg-white/[0.04] dark:text-zinc-400 dark:ring-white/[0.06] dark:hover:bg-white/10"
        >
          {s.ticker}
        </Link>
      ))}
      {rest > 0 && <span className="text-[10px] text-zinc-400 dark:text-zinc-500">+{rest}</span>}
    </div>
  );
}

/** 階段標頭的燈號+龍頭二軍分階摘要，跟原本ChainSignalLights的燈號badge同一套邏輯，
 * 表格化之後保留下來當作「這階段整體現況」的快速摘要，不用逐檔股票自己心算 */
function StageSummary({ stage }: { stage: ChainStageSignal }) {
  const LightIcon = LIGHT_STYLE[stage.light].icon;
  return (
    <div className={`inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg px-2.5 py-1.5 text-[11px] ring-1 ${LIGHT_STYLE[stage.light].ring}`}>
      <span className="flex items-center gap-1.5 text-[13px] font-semibold text-zinc-800 dark:text-zinc-200">
        <LightIcon className={`h-4 w-4 shrink-0 ${LIGHT_STYLE[stage.light].iconClassName}`} strokeWidth={2.25} />
        {stage.memberCount}檔
      </span>
      <span className="flex items-center gap-2 tabular-nums">
        <span className="flex items-center gap-0.5 text-red-600 dark:text-red-400">
          <TrendingUp className="h-3 w-3" strokeWidth={2.5} />
          {stage.risingCount}
        </span>
        <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
          <TrendingDown className="h-3 w-3" strokeWidth={2.5} />
          {stage.fallingCount}
        </span>
      </span>
      <span className="text-zinc-500 dark:text-zinc-400">
        5日 <span className={`font-semibold ${returnColor(stage.avgReturn5d)}`}>{formatPct(stage.avgReturn5d)}</span>
      </span>
      {stage.phase !== "mixed" &&
        (() => {
          const PhaseIcon = PHASE_LABELS[stage.phase].icon;
          return (
            <span className={`flex items-center gap-1 rounded-full bg-white/70 px-1.5 py-0.5 font-medium dark:bg-black/20 ${PHASE_LABELS[stage.phase].iconClassName}`}>
              <PhaseIcon className="h-3 w-3 shrink-0" strokeWidth={2.25} />
              {PHASE_LABELS[stage.phase].label}
            </span>
          );
        })()}
    </div>
  );
}

/** 超過這個數量的主題分組，預設收合只顯示前COLLAPSED_VISIBLE_COUNT檔（members本身已經
 * 龍頭優先排序，所以收合狀態不會漏掉龍頭股），避免使用者一打開就要看50檔攤平的表格 */
const COLLAPSE_THRESHOLD = 15;
const COLLAPSED_VISIBLE_COUNT = 8;

function ThemeGroupTable({
  group,
  hasUpstream,
  hasDownstream,
  adjacentMembers,
}: {
  group: ChainThemeGroup;
  hasUpstream: boolean;
  hasDownstream: boolean;
  adjacentMembers: { upstream: ChainAdjacentStock[]; downstream: ChainAdjacentStock[] };
}) {
  const needsCollapse = group.memberCount > COLLAPSE_THRESHOLD;
  const [expanded, setExpanded] = useState(false);
  const visibleMembers = needsCollapse && !expanded ? group.members.slice(0, COLLAPSED_VISIBLE_COUNT) : group.members;
  const hiddenCount = group.memberCount - visibleMembers.length;

  return (
    <div className="mt-4">
      <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
        {group.themeName}
        <span className="ml-1.5 font-normal text-zinc-400 dark:text-zinc-500">（{group.memberCount}檔）</span>
      </p>

      <div className="mt-1.5 hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-[11px] font-medium text-zinc-400 dark:border-white/10 dark:text-zinc-500">
              <th className="py-2 pr-3 font-medium">股票</th>
              <th className="px-3 py-2 text-right font-medium">收盤價</th>
              <th className="px-3 py-2 text-right font-medium">今日漲跌</th>
              <th className="px-3 py-2 text-right font-medium">近5日</th>
              <th className="px-3 py-2 text-left font-medium">戰術訊號</th>
              {hasUpstream && <th className="px-3 py-2 text-left font-medium">上游關聯</th>}
              {hasDownstream && <th className="px-3 py-2 text-left font-medium">下游關聯</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-white/10">
            {visibleMembers.map((m) => (
              <tr key={m.ticker} className="group">
                <td className="py-2.5 pr-3">
                  <Link href={`/tw/stock/${m.ticker}`} className="flex items-center gap-1.5 hover:underline">
                    {m.isLeader && (
                      <span title="龍頭股">
                        <Crown className="h-3 w-3 shrink-0 text-amber-500" />
                      </span>
                    )}
                    <span>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">{stripCompanySuffix(m.companyName)}</span>
                      <span className="ml-1.5 text-xs text-zinc-400 dark:text-zinc-500">{m.ticker}</span>
                    </span>
                  </Link>
                </td>
                <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${returnColor(m.todayChangeAmount)}`}>
                  {m.closePrice !== null ? m.closePrice.toFixed(2) : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  <ChangeCell amount={m.todayChangeAmount} pct={m.todayChangePct} />
                </td>
                <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${returnColor(m.return5d)}`}>{formatPct(m.return5d)}</td>
                <td className="px-3 py-2.5 text-left text-xs text-zinc-500 dark:text-zinc-400">
                  {m.status ? STATUS_LABELS[m.status] ?? m.status : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                </td>
                {hasUpstream && (
                  <td className="px-3 py-2.5">
                    <AdjacentChips label="上游" stocks={adjacentMembers.upstream} />
                  </td>
                )}
                {hasDownstream && (
                  <td className="px-3 py-2.5">
                    <AdjacentChips label="下游" stocks={adjacentMembers.downstream} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-1.5 flex flex-col divide-y divide-zinc-100 md:hidden dark:divide-white/10">
        {visibleMembers.map((m) => (
          // 卡片本身不整張包在<Link>裡——下面的上/下游關聯各自也是可點的<Link>，HTML不允許<a>巢狀<a>
          <div key={m.ticker} className="py-2.5">
            <Link href={`/tw/stock/${m.ticker}`} className="block active:opacity-70">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {m.isLeader && (
                      <span title="龍頭股">
                        <Crown className="h-3 w-3 shrink-0 text-amber-500" />
                      </span>
                    )}
                    <span className="truncate font-semibold text-zinc-900 dark:text-zinc-100">{stripCompanySuffix(m.companyName)}</span>
                  </div>
                  <div className="text-xs text-zinc-400 dark:text-zinc-500">{m.ticker}</div>
                  {m.status && <div className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">{STATUS_LABELS[m.status] ?? m.status}</div>}
                </div>
                <div className="shrink-0 text-right">
                  <div className={`tabular-nums ${returnColor(m.todayChangeAmount)}`}>{m.closePrice !== null ? m.closePrice.toFixed(2) : "—"}</div>
                  <ChangeCell amount={m.todayChangeAmount} pct={m.todayChangePct} />
                </div>
              </div>
            </Link>
            {(hasUpstream || hasDownstream) && (
              <div className="mt-1.5 flex flex-col gap-1">
                {hasUpstream && (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="shrink-0 text-zinc-400 dark:text-zinc-500">上游</span>
                    <AdjacentChips label="上游" stocks={adjacentMembers.upstream} />
                  </div>
                )}
                {hasDownstream && (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="shrink-0 text-zinc-400 dark:text-zinc-500">下游</span>
                    <AdjacentChips label="下游" stocks={adjacentMembers.downstream} />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {needsCollapse && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 flex items-center gap-1 text-xs font-medium text-violet-600 hover:underline dark:text-violet-400"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} strokeWidth={2.25} />
          {expanded ? "收合" : `顯示全部 ${group.memberCount} 檔（還有 ${hiddenCount} 檔）`}
        </button>
      )}
    </div>
  );
}

function StageTable({ stage }: { stage: ChainStageSignal }) {
  if (stage.memberCount === 0) {
    return <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">這個階段目前沒有追蹤中的股票</p>;
  }

  const hasUpstream = stage.adjacentMembers.upstream.length > 0;
  const hasDownstream = stage.adjacentMembers.downstream.length > 0;

  return (
    <div className="divide-y divide-zinc-100 dark:divide-white/10">
      {stage.themeGroups.map((group) => (
        <ThemeGroupTable
          key={group.themeName}
          group={group}
          hasUpstream={hasUpstream}
          hasDownstream={hasDownstream}
          adjacentMembers={stage.adjacentMembers}
        />
      ))}
    </div>
  );
}

/**
 * 2026-08-19：從燈號badge（點開才看得到個別股票）改成表格常駐顯示，並把原本單一長頁面
 * （所有鏈一次全部攤開）改成鏈與鏈之間用tab切換——6條鏈*最多4階段*每階段表格，全部攤開
 * 頁面會太長，一次只看一條鏈比較好掃描。
 */
export function ChainExplorer() {
  const { data, error, retry } = useJsonFetch<{ chains: ChainSignalResult[] }>("/api/chain-signals");
  const chains = data?.chains ?? null;
  const [selectedChain, setSelectedChain] = useState<string | null>(null);

  if (error) {
    return (
      <Card>
        <SectionHeader icon={Workflow} iconColor="violet" title="產業鏈" />
        <FetchError message={error} onRetry={retry} />
      </Card>
    );
  }

  if (!chains) {
    return (
      <Card>
        <SectionHeader icon={Workflow} iconColor="violet" title="產業鏈" />
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">載入中…</p>
      </Card>
    );
  }

  const activeChainName = selectedChain && chains.some((c) => c.chainName === selectedChain) ? selectedChain : chains[0]?.chainName ?? null;
  const activeChain = chains.find((c) => c.chainName === activeChainName) ?? null;
  const sortedStages = activeChain ? [...activeChain.stages].sort((a, b) => STAGE_ORDER.indexOf(a.stageKey) - STAGE_ORDER.indexOf(b.stageKey)) : [];

  return (
    <Card>
      <SectionHeader
        icon={Workflow}
        iconColor="violet"
        title="產業鏈"
        tooltip={
          <InfoTooltip>
            每條鏈依上游→中游→下游（部分鏈另有支援層）拆解，每個階段再依原始細分主題分組列出成員股票（例如「上游：IP與IC設計」拆成「IC設計：高階運算與邊緣AI」跟「矽智財：IP與ASIC設計服務」兩組）——同一組才是真正同類、值得互相比較的股票；超過15檔的大宗主題預設只顯示龍頭+前幾名，可點「顯示全部」展開。每檔股票顯示收盤價與今日漲跌（紅漲綠跌）、近5日報酬、目前的戰術訊號，以及所屬階段的上/下游關聯股票。
            <br />
            <br />
            階段標頭的燈號綜合「多少比例成員有觸發戰術訊號」+「近5日族群平均報酬」判斷：走弱（近5日報酬&lt;-1%，優先判定）、活躍（報酬≥3%或訊號比例≥30%且未轉負）、初動（有訊號或報酬&gt;0）、平靜（都沒有）。另外把龍頭股（皇冠圖示）跟二軍分開算，標示「龍頭領漲」「全面齊漲」「二軍補漲」判斷現在是哪個階段。
            <br />
            <br />
            半導體/AI伺服器/記憶體/光通訊四條鏈的成員以AI運算（CPU/GPU/AI伺服器/資料中心）概念股為主；被動元件、電動車兩條鏈涵蓋範圍較廣，不限於AI應用。
          </InfoTooltip>
        }
      />

      <div className="mt-3 flex gap-4 overflow-x-auto border-b border-zinc-200 dark:border-white/10">
        {chains.map((chain) => {
          const active = chain.chainName === activeChainName;
          return (
            <button
              key={chain.chainName}
              type="button"
              onClick={() => setSelectedChain(chain.chainName)}
              className={`shrink-0 whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
                active
                  ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                  : "border-transparent text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              }`}
            >
              {chain.chainName}
            </button>
          );
        })}
      </div>

      {activeChain && (
        <div className="mt-4 flex flex-col gap-5">
          <p className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200">{activeChain.chainNameFull}</p>
          {sortedStages.map((stage) => (
            <SubCard key={stage.stageKey}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{stage.label}</p>
                <StageSummary stage={stage} />
              </div>
              <StageTable stage={stage} />
            </SubCard>
          ))}
        </div>
      )}
    </Card>
  );
}
