"use client";

import { useState } from "react";
import Link from "next/link";
import { Crown, Workflow, ArrowUp, ArrowDown, ChevronDown } from "lucide-react";
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
  closePrice: number | null;
  todayChangeAmount: number | null;
  todayChangePct: number | null;
  epsCumulative: number | null;
  isLeader: boolean;
}

interface ChainThemeGroup {
  themeName: string;
  memberCount: number;
  avgReturn5d: number | null;
  topGainer: ChainStageMember | null;
  topLoser: ChainStageMember | null;
  members: ChainStageMember[];
}

interface ChainStageSignal {
  stageKey: string;
  label: string;
  memberCount: number;
  themeGroups: ChainThemeGroup[];
}

interface ChainSignalResult {
  chainName: string;
  chainNameFull: string;
  stages: ChainStageSignal[];
}

/** 上游→中游→下游→支援層的固定顯示順序，Object.entries() 的 key 順序不保證符合邏輯順序 */
const STAGE_ORDER = ["upstream", "midstream", "downstream", "support"];

/** 階段badge顏色依上中下游給不同色相，跟下面theme分組的中性樣式做出層級區分 */
const STAGE_BADGE_STYLE: Record<string, string> = {
  upstream: "bg-blue-600 dark:bg-blue-500",
  midstream: "bg-violet-600 dark:bg-violet-500",
  downstream: "bg-amber-600 dark:bg-amber-500",
  support: "bg-zinc-600 dark:bg-zinc-500",
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

function formatPct(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatEps(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(2)}元`;
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

/** 階段標頭：把「上游：IP與IC設計」拆成小圓角badge（上游）＋粗體標題（IP與IC設計），
 * 比原本一整行純文字更容易一眼辨識「現在在看哪個階段」，跟下面theme分組的左邊框縮排
 * 做出視覺上的層級深度差異（階段=badge+粗體、分組=縮排+中等字重） */
function StageHeading({ stageKey, label }: { stageKey: string; label: string }) {
  const separatorIndex = label.indexOf("：");
  const prefix = separatorIndex >= 0 ? label.slice(0, separatorIndex) : label;
  const rest = separatorIndex >= 0 ? label.slice(separatorIndex + 1) : null;
  return (
    <div className="flex items-center gap-2">
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${STAGE_BADGE_STYLE[stageKey] ?? "bg-zinc-600"}`}
      >
        {prefix}
      </span>
      <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{rest ?? label}</p>
    </div>
  );
}

/** 領漲/領跌單一個股標籤，點了直接連到個股頁 */
function LeadStockChip({ label, member }: { label: string; member: ChainStageMember | null }) {
  if (!member) return null;
  return (
    <Link
      href={`/tw/stock/${member.ticker}`}
      className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[11px] ring-1 ring-zinc-900/[0.04] transition-colors hover:bg-white dark:bg-black/20 dark:ring-white/[0.06] dark:hover:bg-black/30"
    >
      <span className="text-zinc-400 dark:text-zinc-500">{label}</span>
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{stripCompanySuffix(member.companyName)}</span>
      <span className={`font-semibold ${returnColor(member.return5d)}`}>{formatPct(member.return5d)}</span>
    </Link>
  );
}

/** 超過這個數量的主題分組，預設收合只顯示前COLLAPSED_VISIBLE_COUNT檔（members本身已經
 * 龍頭優先排序，所以收合狀態不會漏掉龍頭股），避免使用者一打開就要看50檔攤平的表格 */
const COLLAPSE_THRESHOLD = 15;
const COLLAPSED_VISIBLE_COUNT = 8;

/** 2026-08-19：這是階段底下的次一層——用左邊框縮排（不是再疊一層卡片）標示「屬於上面
 * 這個階段」，同時把5日漲跌%、領漲/領跌個股這些族群統計放在這個粒度（原本在階段層級，
 * 太粗看不出真正同類股票之間的差異），配合階段層級改成純粹的標題，層級深淺一眼分得出來 */
function ThemeGroupTable({ group }: { group: ChainThemeGroup }) {
  const needsCollapse = group.memberCount > COLLAPSE_THRESHOLD;
  const [expanded, setExpanded] = useState(false);
  const visibleMembers = needsCollapse && !expanded ? group.members.slice(0, COLLAPSED_VISIBLE_COUNT) : group.members;
  const hiddenCount = group.memberCount - visibleMembers.length;

  return (
    <div className="mt-3 border-l-2 border-zinc-200 pl-3 dark:border-white/10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          {group.themeName}
          <span className="ml-1.5 font-normal text-zinc-400 dark:text-zinc-500">（{group.memberCount}檔）</span>
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
            5日 <span className={`font-semibold ${returnColor(group.avgReturn5d)}`}>{formatPct(group.avgReturn5d)}</span>
          </span>
          <LeadStockChip label="領漲" member={group.topGainer} />
          <LeadStockChip label="領跌" member={group.topLoser} />
        </div>
      </div>

      <div className="mt-1.5 hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-[11px] font-medium text-zinc-400 dark:border-white/10 dark:text-zinc-500">
              <th className="py-2 pr-3 font-medium">股票</th>
              <th className="px-3 py-2 text-right font-medium">收盤價</th>
              <th className="px-3 py-2 text-right font-medium">今日漲跌</th>
              <th className="px-3 py-2 text-right font-medium">近5日</th>
              <th className="px-3 py-2 text-right font-medium">年度累積EPS</th>
              <th className="px-3 py-2 text-left font-medium">戰術訊號</th>
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
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">
                  {formatEps(m.epsCumulative)}
                </td>
                <td className="px-3 py-2.5 text-left text-xs text-zinc-500 dark:text-zinc-400">
                  {m.status ? STATUS_LABELS[m.status] ?? m.status : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-1.5 flex flex-col divide-y divide-zinc-100 md:hidden dark:divide-white/10">
        {visibleMembers.map((m) => (
          <Link key={m.ticker} href={`/tw/stock/${m.ticker}`} className="block py-2.5 active:opacity-70">
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
                <div className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">EPS {formatEps(m.epsCumulative)}</div>
              </div>
            </div>
          </Link>
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

/**
 * 2026-08-19：從燈號badge（點開才看得到個別股票）改成表格常駐顯示，並把原本單一長頁面
 * （所有鏈一次全部攤開）改成鏈與鏈之間用tab切換——6條鏈*最多4階段*每階段表格，全部攤開
 * 頁面會太長，一次只看一條鏈比較好掃描。
 * 2026-08-19再改版：階段層級拿掉聚合燈號/龍頭二軍分階判斷（層級不明顯、跟下面theme分組
 * 統計重複），改成純粹的階段標題；族群統計（5日漲跌%、領漲/領跌個股）下放到theme分組
 * 層級才有意義；表格拿掉上/下游關聯欄位（只有階段級的粗略關聯，資訊價值不高），換成
 * 年度累積EPS。
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
            每條鏈依上游→中游→下游（部分鏈另有支援層）拆解，每個階段再依原始細分主題分組列出成員股票（例如「上游：IP與IC設計」拆成「IC設計：高階運算與邊緣AI」跟「矽智財：IP與ASIC設計服務」兩組）——同一組才是真正同類、值得互相比較的股票，5日平均報酬與領漲/領跌個股也是算在這個分組粒度。超過15檔的大宗主題預設只顯示龍頭+前幾名，可點「顯示全部」展開。
            <br />
            <br />
            每檔股票顯示收盤價與今日漲跌（紅漲綠跌）、近5日報酬、今年最新一期申報的年度累積EPS、目前的戰術訊號。
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
          <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">{activeChain.chainNameFull}</p>
          {sortedStages.map((stage) => (
            <SubCard key={stage.stageKey}>
              <StageHeading stageKey={stage.stageKey} label={stage.label} />
              {stage.memberCount === 0 ? (
                <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">這個階段目前沒有追蹤中的股票</p>
              ) : (
                stage.themeGroups.map((group) => <ThemeGroupTable key={group.themeName} group={group} />)
              )}
            </SubCard>
          ))}
        </div>
      )}
    </Card>
  );
}
