import Link from "next/link";
import { CircleAlert, ChevronsUp, ChevronsDown, Minimize2, CheckCircle2, ArrowUp, ArrowDown } from "lucide-react";
import type { SectorTrendItem, TacticalStatus } from "@/lib/trend/sectorTrendsQuery";
import { TACTICAL_STATUS_META } from "@/lib/trend/tacticalStatusMeta";
import { stripCompanySuffix } from "@/lib/formatCompanyName";
import { InfoTooltip } from "./InfoTooltip";
import { Card } from "./ui/Card";
import { SectionHeader } from "./ui/SectionHeader";

/** TW慣例紅漲綠跌，這個表格只給TW用（美股維持TrendColumn卡片版），不用像TrendColumn那樣依market切換 */
function changeColorClass(value: number | null): string {
  if (value === null) return "text-zinc-400 dark:text-zinc-500";
  if (value > 0) return "text-red-600 dark:text-red-400";
  if (value < 0) return "text-emerald-600 dark:text-emerald-400";
  return "text-zinc-500 dark:text-zinc-400";
}

function formatConcentration(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function formatLots(value: number | null): string {
  if (value === null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${Math.round(value).toLocaleString()}張`;
}

function formatAmount(value: number | null): string {
  if (value === null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}`;
}

function formatStreakDays(value: number | null): string {
  return value === null ? "—" : `${value}天`;
}

/** 漲跌用上下箭頭取代文字+/-，金額在上、%在下——一眼就能分辨方向，不用先讀符號再讀數字 */
function ChangeCell({ amount, pct }: { amount: number | null; pct: number | null }) {
  if (amount === null) return <span className="text-zinc-300 dark:text-zinc-600">—</span>;
  const Icon = amount > 0 ? ArrowUp : amount < 0 ? ArrowDown : null;
  return (
    <div className={`flex flex-col items-end ${changeColorClass(amount)}`}>
      <span className="inline-flex items-center gap-0.5 font-medium tabular-nums">
        {Icon && <Icon className="h-3 w-3" strokeWidth={2.5} />}
        {Math.abs(amount).toFixed(2)}
      </span>
      <span className="text-[11px] tabular-nums opacity-80">{pct !== null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` : ""}</span>
    </div>
  );
}

function MaAlignedIcon({ aligned }: { aligned: boolean | null }) {
  if (aligned === null) return <span className="text-zinc-300 dark:text-zinc-600">—</span>;
  if (!aligned) return <span className="text-zinc-300 dark:text-zinc-600">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400" title="MA5>MA10>MA20多頭排列">
      <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.25} />
    </span>
  );
}

function BollingerBadge({ status, detail }: { status: SectorTrendItem["bollingerStatus"]; detail: string | null }) {
  if (status === null || status === "normal") return <span className="text-zinc-300 dark:text-zinc-600">—</span>;
  const config = {
    high: { label: "偏高", icon: ChevronsUp, className: "text-amber-600 dark:text-amber-400" },
    low: { label: "偏低", icon: ChevronsDown, className: "text-blue-600 dark:text-blue-400" },
    squeeze: { label: "收斂", icon: Minimize2, className: "text-violet-600 dark:text-violet-400" },
  }[status];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-0.5 whitespace-nowrap ${config.className}`} title={detail ?? undefined}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
      {config.label}
    </span>
  );
}

function UnprovenBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-white/10 dark:text-zinc-400"
      title="用真實production資料回測過：這組條件本身沒有穩健正超額報酬，出現不代表歷史上會賺錢"
    >
      <CircleAlert className="h-3 w-3" strokeWidth={2.25} />
      效果未驗證
    </span>
  );
}

/**
 * 2026-08-18：台股版戰術面板改成表格（取代卡片版TrendColumn，美股不受影響）。
 *
 * 桌面版是完整表格；手機版2026-08-18再改版成堆疊卡片，不是表格橫向捲動——欄位增加到
 * 11欄之後，就算sticky第一欄，手機上還是要一直左右滑才看得到剩下的欄位，可讀性比堆疊
 * 卡片差。桌面版維持表格是因為欄位多、資訊密度高，適合掃描比較很多檔股票；手機螢幕窄，
 * 換成每檔股票一張卡、資訊用2欄grid排列，不用捲動就看得到全部欄位。
 */
export function TrendTable({ status, items, loading }: { status: TacticalStatus; items: SectorTrendItem[]; loading?: boolean }) {
  const meta = TACTICAL_STATUS_META[status];

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="border-b border-zinc-100 px-4 py-3.5 dark:border-white/10">
        <SectionHeader
          icon={meta.icon}
          iconColor={meta.iconColor}
          title={meta.title}
          tooltip={<InfoTooltip>{meta.criteria}</InfoTooltip>}
        />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{meta.subtitle}</p>
          {meta.unproven && <UnprovenBadge />}
        </div>
      </div>

      {loading ? (
        <div className="px-4 py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">載入中…</div>
      ) : items.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">目前沒有符合條件的股票</div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-[11px] font-medium text-zinc-400 dark:border-white/10 dark:text-zinc-500">
                  <th className="sticky left-0 z-10 bg-white px-4 py-2 font-medium dark:bg-zinc-900">股票</th>
                  <th className="px-3 py-2 text-left font-medium">產業</th>
                  <th className="px-3 py-2 text-right font-medium">收盤價</th>
                  <th className="px-3 py-2 text-right font-medium">今日漲跌</th>
                  <th className="px-3 py-2 text-right font-medium">買賣超張數</th>
                  <th className="px-3 py-2 text-right font-medium">買賣超(百萬)</th>
                  <th className="px-3 py-2 text-right font-medium">買賣超天數</th>
                  <th className="px-3 py-2 text-right font-medium">籌碼5日</th>
                  <th className="px-3 py-2 text-right font-medium">10日</th>
                  <th className="px-3 py-2 text-right font-medium">20日</th>
                  <th className="px-3 py-2 text-center font-medium">MA排列</th>
                  <th className="px-3 py-2 text-center font-medium">布林訊號</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-white/10">
                {items.map((item) => (
                  <tr key={item.ticker} className="group">
                    <td className="sticky left-0 z-10 min-w-[140px] bg-white px-4 py-2.5 group-hover:bg-zinc-50 dark:bg-zinc-900 dark:group-hover:bg-white/[0.03]">
                      <Link href={`/tw/stock/${item.ticker}`} className="block hover:underline">
                        <div className="truncate font-semibold text-zinc-900 dark:text-zinc-100">{stripCompanySuffix(item.companyName)}</div>
                        <div className="text-xs text-zinc-400 dark:text-zinc-500">{item.ticker}</div>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {item.sector.nameZh ?? item.sector.name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {item.priceNow.toFixed(2)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <ChangeCell amount={item.todayChangeAmount} pct={item.todayChangePct} />
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${changeColorClass(item.netBuySellLots)}`}>
                      {formatLots(item.netBuySellLots)}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${changeColorClass(item.netBuySellAmountMillions)}`}>
                      {formatAmount(item.netBuySellAmountMillions)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                      {formatStreakDays(item.signalStreakTradingDays)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">
                      {formatConcentration(item.chipConcentration5)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">
                      {formatConcentration(item.chipConcentration10)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">
                      {formatConcentration(item.chipConcentration20)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-center">
                      <MaAlignedIcon aligned={item.maAligned} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-center">
                      <BollingerBadge status={item.bollingerStatus} detail={item.bollingerDetail} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col divide-y divide-zinc-100 md:hidden dark:divide-white/10">
            {items.map((item) => (
              <Link key={item.ticker} href={`/tw/stock/${item.ticker}`} className="block px-4 py-3 active:bg-zinc-50 dark:active:bg-white/[0.03]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-zinc-900 dark:text-zinc-100">{stripCompanySuffix(item.companyName)}</div>
                    <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                      <span>{item.ticker}</span>
                      <span>·</span>
                      <span className="truncate">{item.sector.nameZh ?? item.sector.name}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tabular-nums text-zinc-700 dark:text-zinc-300">{item.priceNow.toFixed(2)}</div>
                    <ChangeCell amount={item.todayChangeAmount} pct={item.todayChangePct} />
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <div className="flex items-center justify-between rounded bg-zinc-50 px-2 py-1 dark:bg-white/[0.04]">
                    <span className="text-zinc-400 dark:text-zinc-500">買賣超張數</span>
                    <span className={`tabular-nums font-medium ${changeColorClass(item.netBuySellLots)}`}>{formatLots(item.netBuySellLots)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded bg-zinc-50 px-2 py-1 dark:bg-white/[0.04]">
                    <span className="text-zinc-400 dark:text-zinc-500">買賣超(百萬)</span>
                    <span className={`tabular-nums font-medium ${changeColorClass(item.netBuySellAmountMillions)}`}>
                      {formatAmount(item.netBuySellAmountMillions)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded bg-zinc-50 px-2 py-1 dark:bg-white/[0.04]">
                    <span className="text-zinc-400 dark:text-zinc-500">買賣超天數</span>
                    <span className="tabular-nums font-medium text-zinc-600 dark:text-zinc-300">{formatStreakDays(item.signalStreakTradingDays)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded bg-zinc-50 px-2 py-1 dark:bg-white/[0.04]">
                    <span className="text-zinc-400 dark:text-zinc-500">MA排列 / 布林</span>
                    <span className="flex items-center gap-1.5">
                      <MaAlignedIcon aligned={item.maAligned} />
                      <BollingerBadge status={item.bollingerStatus} detail={item.bollingerDetail} />
                    </span>
                  </div>
                  <div className="col-span-2 flex items-center justify-between rounded bg-zinc-50 px-2 py-1 dark:bg-white/[0.04]">
                    <span className="text-zinc-400 dark:text-zinc-500">籌碼集中度 5日 / 10日 / 20日</span>
                    <span className="tabular-nums font-medium text-zinc-600 dark:text-zinc-300">
                      {formatConcentration(item.chipConcentration5)} / {formatConcentration(item.chipConcentration10)} / {formatConcentration(item.chipConcentration20)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
