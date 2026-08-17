import Link from "next/link";
import { CheckCircle2, AlertTriangle, Rocket, CircleAlert, ChevronsUp, ChevronsDown, Minimize2 } from "lucide-react";
import type { SectorTrendItem, TacticalStatus } from "@/lib/trend/sectorTrendsQuery";
import { TACTICAL_STATUS_META } from "@/lib/trend/tacticalStatusMeta";
import type { Market } from "@/generated/prisma/enums";
import { stripCompanySuffix } from "@/lib/formatCompanyName";
import { InfoTooltip } from "./InfoTooltip";
import { IconBadge } from "./ui/IconBadge";
import { Sparkline } from "./ui/Sparkline";

function formatChangePct(value: number | null): string {
  if (value === null) return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/** 台股慣例是漲紅跌綠，跟美股的漲綠跌紅相反，這個元件兩個市場共用，要照market分開判斷 */
function changeColorClass(value: number | null, market: Market): string {
  if (value === null) return "text-zinc-400 dark:text-zinc-500";
  const upColor = market === "TW" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400";
  const downColor = market === "TW" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  if (value > 0) return upColor;
  if (value < 0) return downColor;
  return "text-zinc-500 dark:text-zinc-400";
}

export function TrendColumn({
  market,
  status,
  items,
  loading,
}: {
  market: Market;
  status: TacticalStatus;
  items: SectorTrendItem[];
  loading?: boolean;
}) {
  const meta = TACTICAL_STATUS_META[status];

  return (
    <section
      className={`flex flex-col rounded-2xl border-t-4 bg-white shadow-[0_1px_2px_rgba(24,24,27,0.04),0_10px_28px_-14px_rgba(24,24,27,0.14)] ring-1 ring-zinc-900/[0.05] dark:bg-zinc-900 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),0_10px_28px_-14px_rgba(0,0,0,0.5)] dark:ring-white/[0.06] ${meta.accent}`}
    >
      <header className="border-b border-zinc-100 px-4 py-3.5 dark:border-white/10">
        <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          <IconBadge icon={meta.icon} color={meta.iconColor} />
          {meta.title}
          {meta.unproven && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-white/10 dark:text-zinc-400"
              title="用真實production資料回測過：這組條件本身沒有穩健正超額報酬，出現不代表歷史上會賺錢"
            >
              <CircleAlert className="h-3 w-3" strokeWidth={2.25} />
              效果未驗證
            </span>
          )}
          <InfoTooltip>{meta.criteria}</InfoTooltip>
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{meta.subtitle}</p>
      </header>

      <div className="flex flex-col divide-y divide-zinc-100 dark:divide-white/10">
        {loading ? (
          <div className="px-4 py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">載入中…</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">目前沒有符合條件的股票</div>
        ) : (
          items.map((item, index) => (
            <div key={item.ticker} className="flex items-center gap-3 px-4 py-3">
              <span className="w-5 shrink-0 text-xs font-medium text-zinc-400 dark:text-zinc-500">{index + 1}</span>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  {market === "TW" ? (
                    <Link
                      href={`/tw/stock/${item.ticker}`}
                      className="font-semibold text-zinc-900 hover:underline dark:text-zinc-100"
                    >
                      {item.ticker}
                    </Link>
                  ) : (
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">{item.ticker}</span>
                  )}
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${meta.badge}`}>
                    {item.coreScore.toFixed(0)}
                  </span>
                  {item.chipBadge === "confirmed" && (
                    <span
                      className="inline-flex items-center gap-0.5 text-xs text-emerald-600"
                      title="籌碼確認：技術面與法人籌碼同步走強"
                    >
                      <CheckCircle2 className="h-3 w-3" strokeWidth={2.25} />
                      籌碼確認
                    </span>
                  )}
                  {item.chipBadge === "divergence" && (
                    <span
                      className="inline-flex items-center gap-0.5 text-xs text-amber-600"
                      title="籌碼背離：價格續強但法人籌碼轉弱"
                    >
                      <AlertTriangle className="h-3 w-3" strokeWidth={2.25} />
                      籌碼背離
                    </span>
                  )}
                  {item.revenueYoyGrowthPct !== null && (
                    <span
                      className={`inline-flex items-center gap-0.5 text-xs font-medium ${changeColorClass(item.revenueYoyGrowthPct, market)}`}
                      title={`${item.revenueMonth} 月營收年增率`}
                    >
                      {item.revenueYoyGrowthPct >= 20 && <Rocket className="h-3 w-3" strokeWidth={2.25} />}
                      營收{item.revenueYoyGrowthPct >= 0 ? "+" : ""}
                      {item.revenueYoyGrowthPct.toFixed(0)}%
                    </span>
                  )}
                  {item.bollingerStatus === "high" && (
                    <span
                      className="inline-flex items-center gap-0.5 text-xs text-amber-600 dark:text-amber-400"
                      title={`布林偏高：貼近通道上緣（${item.bollingerDetail}）`}
                    >
                      <ChevronsUp className="h-3 w-3" strokeWidth={2.25} />
                      布林偏高
                    </span>
                  )}
                  {item.bollingerStatus === "low" && (
                    <span
                      className="inline-flex items-center gap-0.5 text-xs text-blue-600 dark:text-blue-400"
                      title={`布林偏低：貼近通道下緣（${item.bollingerDetail}）`}
                    >
                      <ChevronsDown className="h-3 w-3" strokeWidth={2.25} />
                      布林偏低
                    </span>
                  )}
                  {item.bollingerStatus === "squeeze" && (
                    <span
                      className="inline-flex items-center gap-0.5 text-xs text-violet-600 dark:text-violet-400"
                      title={`通道收斂：帶寬明顯窄於20日均值，方向未定但波動可能即將放大（${item.bollingerDetail}）`}
                    >
                      <Minimize2 className="h-3 w-3" strokeWidth={2.25} />
                      通道收斂
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {stripCompanySuffix(item.companyName)}
                </p>
                <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                  {item.signalDate ? (
                    <>
                      {meta.signalLabel} {item.signalDate}
                      {item.daysSinceSignal !== null && <> · {item.daysSinceSignal} 天前</>}
                    </>
                  ) : (
                    `${meta.signalLabel} N/A`
                  )}
                </p>
                {item.triggerReason && (
                  <p className="mt-0.5 text-[11px] leading-snug text-zinc-400 dark:text-zinc-500" title="今天為什麼被分類進這一欄">
                    {item.triggerReason}
                  </p>
                )}
                {item.themes.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {item.themes.map((theme) => (
                      <span
                        key={theme.code}
                        className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-white/10 dark:text-zinc-400"
                      >
                        {theme.nameZh ?? theme.code}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="shrink-0 text-right">
                {item.sparkline && item.sparkline.length >= 2 && (
                  <div className="mb-1 flex justify-end" title="近20日收盤走勢">
                    <Sparkline
                      values={item.sparkline}
                      colorClassName={changeColorClass(
                        item.sparkline[item.sparkline.length - 1] - item.sparkline[0],
                        market
                      )}
                    />
                  </div>
                )}
                <div className={`text-sm font-semibold ${changeColorClass(item.changePctSinceSignal, market)}`}>
                  {formatChangePct(item.changePctSinceSignal)}
                </div>
                <p className="text-[10px] font-normal text-zinc-400 dark:text-zinc-500">訊號後漲跌幅</p>
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {item.priceNow.toFixed(2)}
                  <span className={`ml-1 font-medium ${changeColorClass(item.todayChangePct, market)}`}>
                    {formatChangePct(item.todayChangePct)}
                  </span>
                </div>
                <p className="text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                  今日收盤
                  {item.volatilitySinceSignal !== null && <> · 波動率{item.volatilitySinceSignal.toFixed(1)}%</>}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
