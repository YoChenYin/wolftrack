import { BarChart3, ClipboardCheck, ScrollText } from "lucide-react";
import { Card, SubCard } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TwSectionNav } from "@/components/tw/TwSectionNav";
import { TrackRecordTable } from "@/components/tw/TrackRecordTable";
import { ReturnBarChart, computeDomain, type ReturnBarRow } from "@/components/tw/TrackRecordReturnChart";
import { twReturnColor } from "@/lib/tw/color";
import { computeTrackRecord, summarizeTrades, TRACK_RECORD_START_DATE, type TrackRecordStats } from "@/lib/trend/tw/trackRecord";
import {
  ENTRY_SIGNAL_LABEL,
  TRACK_RECORD_EXIT_RULE as RULE,
  exitSignalLabel,
  type EntrySignal,
  type ExitSignal,
  type TrackRecordTrade,
} from "@/lib/trend/tw/trackRecordMeta";

// 每天新訊號/新收盤價都會改變持有中部位的報酬，不能在build time凍結（跟 /tw 首頁同樣理由）
export const dynamic = "force-dynamic";

function formatPct(value: number | null, digits = 2): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function StatTile({ label, value, sub, colorValue }: { label: string; value: string; sub?: string; colorValue?: number | null }) {
  return (
    <SubCard>
      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{label}</p>
      <p
        className={`mt-1 font-[family:var(--font-tw-mono)] text-2xl font-semibold tabular-nums ${
          colorValue !== undefined ? twReturnColor(colorValue) : "text-zinc-900 dark:text-zinc-100"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">{sub}</p>}
    </SubCard>
  );
}

function BreakdownRow({ label, stats }: { label: string; stats: TrackRecordStats }) {
  return (
    <tr className="border-t border-zinc-100 dark:border-white/5">
      <td className="py-2 pr-3 font-medium text-zinc-700 dark:text-zinc-300">{label}</td>
      <td className="px-3 py-2 text-right font-[family:var(--font-tw-mono)] tabular-nums text-zinc-600 dark:text-zinc-400">{stats.count}</td>
      <td className="px-3 py-2 text-right font-[family:var(--font-tw-mono)] tabular-nums text-zinc-600 dark:text-zinc-400">
        {stats.winRatePct !== null ? `${stats.winRatePct.toFixed(0)}%` : "—"}
      </td>
      <td className={`px-3 py-2 text-right font-[family:var(--font-tw-mono)] font-semibold tabular-nums ${twReturnColor(stats.avgReturnPct)}`}>
        {formatPct(stats.avgReturnPct)}
      </td>
      <td className={`px-3 py-2 text-right font-[family:var(--font-tw-mono)] tabular-nums ${twReturnColor(stats.avgExcessReturnPct)}`}>
        {formatPct(stats.avgExcessReturnPct)}
      </td>
      <td className="py-2 pl-3 text-right font-[family:var(--font-tw-mono)] tabular-nums text-zinc-500 dark:text-zinc-400">
        {stats.avgHoldingDays !== null ? `${stats.avgHoldingDays.toFixed(1)}日` : "—"}
      </td>
    </tr>
  );
}

function toBarRow(key: string, label: string, trades: TrackRecordTrade[]): ReturnBarRow {
  const stats = summarizeTrades(trades);
  return {
    key,
    label,
    count: stats.count,
    avgReturnPct: stats.avgReturnPct,
    medianReturnPct: stats.medianReturnPct,
    winRatePct: stats.winRatePct,
    avgHoldingDays: stats.avgHoldingDays,
  };
}

export default async function TwTrackRecordPage() {
  const trades = await computeTrackRecord();
  const closed = trades.filter((t) => t.status === "closed");
  const open = trades.filter((t) => t.status === "open");
  const closedStats = summarizeTrades(closed);
  const openStats = summarizeTrades(open);
  const bySignal = (Object.keys(ENTRY_SIGNAL_LABEL) as EntrySignal[]).map((s) => ({
    signal: s,
    stats: summarizeTrades(closed.filter((t) => t.entrySignal === s)),
  }));

  // 長條圖只看已出場交易；出場方式列出規則會用到的條件+實際出現過的（規則改版前的舊交易可能有別的出場方式）
  const entryRows = (Object.keys(ENTRY_SIGNAL_LABEL) as EntrySignal[]).map((sig) =>
    toBarRow(sig, ENTRY_SIGNAL_LABEL[sig], closed.filter((t) => t.entrySignal === sig))
  );
  const exitKeys = new Set<ExitSignal>(["trailingStop", "takeProfit", "maxHolding"]);
  for (const t of closed) if (t.exitSignal) exitKeys.add(t.exitSignal);
  const exitRows = [...exitKeys].map((sig) => toBarRow(sig, exitSignalLabel(sig, RULE), closed.filter((t) => t.exitSignal === sig)));
  const chartDomain = computeDomain([...entryRows, ...exitRows]);

  return (
    <div
      className="relative flex flex-1 flex-col overflow-hidden font-[family:var(--font-tw-sans)] dark:bg-zinc-950"
      style={{ background: "var(--tw-canvas)" }}
    >
      <main className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
        <header className="tw-reveal">
          <div className="flex items-baseline gap-3">
            <h1
              className="font-[family:var(--font-tw-display)] text-3xl font-semibold tracking-tight text-zinc-900"
              style={{
                backgroundImage: "var(--tw-heading-gradient)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              狼蹤台股版
            </h1>
            <span className="font-[family:var(--font-tw-mono)] text-xs font-medium tracking-wide text-amber-800/60 dark:text-amber-400/70">
              WOLFTRACK · TW
            </span>
          </div>
          <div className="mt-2 h-px w-24 bg-gradient-to-r from-amber-700/50 to-transparent dark:from-amber-400/40" />
          <p className="mt-3 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
            把平台自 {TRACK_RECORD_START_DATE} 起每天實際選出的多方訊號，照固定規則模擬進出場，逐筆記錄買賣價格與報酬——驗證的是「照著網站訊號做會怎樣」，不是事後回測。
          </p>
          <div className="mt-4">
            <TwSectionNav />
          </div>
        </header>

        <div className="tw-reveal" style={{ animationDelay: "80ms" }}>
          <Card>
            <SectionHeader icon={ClipboardCheck} iconColor="amber" title="績效總覽" />
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
              <StatTile label="已出場" value={`${closedStats.count}`} sub={`持有中 ${open.length} 筆`} />
              <StatTile label="勝率" value={closedStats.winRatePct !== null ? `${closedStats.winRatePct.toFixed(0)}%` : "—"} sub="已出場報酬>0的比例" />
              <StatTile label="平均報酬" value={formatPct(closedStats.avgReturnPct)} colorValue={closedStats.avgReturnPct} sub="每筆已實現報酬平均" />
              <StatTile
                label="平均超額報酬"
                value={formatPct(closedStats.avgExcessReturnPct)}
                colorValue={closedStats.avgExcessReturnPct}
                sub="扣掉同期加權指數"
              />
              <StatTile
                label="持有中未實現"
                value={formatPct(openStats.avgReturnPct)}
                colorValue={openStats.avgReturnPct}
                sub={openStats.count > 0 ? `${openStats.count} 筆平均` : "目前無持有"}
              />
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-zinc-400 dark:text-zinc-500">
                    <th className="pb-1 pr-3 font-normal">進場訊號（已出場）</th>
                    <th className="px-3 pb-1 text-right font-normal">筆數</th>
                    <th className="px-3 pb-1 text-right font-normal">勝率</th>
                    <th className="px-3 pb-1 text-right font-normal">平均報酬</th>
                    <th className="px-3 pb-1 text-right font-normal">超額報酬</th>
                    <th className="pb-1 pl-3 text-right font-normal">平均持有</th>
                  </tr>
                </thead>
                <tbody>
                  {bySignal.map(({ signal, stats }) => (
                    <BreakdownRow key={signal} label={ENTRY_SIGNAL_LABEL[signal]} stats={stats} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="tw-reveal" style={{ animationDelay: "120ms" }}>
          <Card>
            <SectionHeader icon={BarChart3} iconColor="amber" title="各進出場方式的平均報酬" />
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">只計已出場交易，兩張圖共用同一個刻度；滑鼠移到長條上看筆數、勝率、中位數</p>
            <div className="mt-4 grid gap-8 md:grid-cols-2">
              <ReturnBarChart title="依進場訊號" rows={entryRows} domain={chartDomain} />
              <ReturnBarChart title="依出場方式" rows={exitRows} domain={chartDomain} />
            </div>
          </Card>
        </div>

        <div className="tw-reveal" style={{ animationDelay: "160ms" }}>
          <Card>
            <SectionHeader icon={ScrollText} iconColor="zinc" title="逐筆交易紀錄" />
            <div className="mt-4">
              <TrackRecordTable trades={trades} />
            </div>
          </Card>
        </div>

        <div className="tw-reveal" style={{ animationDelay: "240ms" }}>
          <SubCard className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            <p className="font-medium text-zinc-700 dark:text-zinc-300">規則說明</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li>進場：投信轉買／投信外資合買／逢低布局，或底部型態（頭肩底／N字底）新出現的那天。連續多天的同一訊號只算一次，持有中出現的新訊號不加碼。</li>
              <li>
                出場（先到者為準）：①移動停利——持有期間收盤曾經獲利達 {RULE.trailingActivatePct}% 以上，之後收盤跌破 {RULE.trailingMa}{" "}
                日均線，隔天開盤賣出；②底部型態進場的部位，盤中觸及型態量測目標價即停利；③持有滿 {RULE.maxHoldingDays} 個交易日，當天收盤賣出。
              </li>
              <li>
                為什麼這樣設計：用歷史資料比較過多組出場規則（見 scripts/compare-track-record-exits.ts）。投信轉賣／合賣是單日翻轉，太容易把還在漲的部位洗出場；6～15% 的停損在台股的波動下常被盤中掃掉後又漲回，前後兩段樣本都明顯拉低報酬。這組規則在比較中勝率與報酬最穩定，但歷史樣本以 2024–2026 多頭為主，空頭時期的驗證有限，且沒有停損代表單筆最大虧損沒有上限。
              </li>
              <li>成交價：進場與收盤後才確認的出場都用「隔天開盤價」，型態停利用盤中觸價（跳空時用開盤價），持有期滿用當天收盤價。滑鼠停在訊號上可看當天觸發原因。</li>
              <li>持有中部位以最新收盤價計算未實現報酬，不列入上方已出場統計。</li>
              <li>限制：股價未做除權息還原（除息日下跌會算成虧損），未扣手續費與證交稅（來回約 0.585%）。歷史績效不代表未來表現，也不是投資建議。</li>
            </ul>
          </SubCard>
        </div>
      </main>
    </div>
  );
}
