import Link from "next/link";
import { CircleAlert, ChevronsUp, ChevronsDown, Minimize2, CheckCircle2 } from "lucide-react";
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

/**
 * 2026-08-18：台股版戰術面板改成表格（取代卡片版TrendColumn，美股不受影響），一個row看完
 * 收盤價/漲跌/買賣超金額/籌碼集中度5·10·20日/MA排列/布林訊號，比卡片版資訊密度高、
 * 適合掃描比較多檔股票。手機版用overflow-x-auto橫向捲動，股票欄位sticky在最左邊，
 * 捲到右邊看其他欄位時還是知道自己在看哪一檔。
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
          {meta.unproven && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-white/10 dark:text-zinc-400"
              title="用真實production資料回測過：這組條件本身沒有穩健正超額報酬，出現不代表歷史上會賺錢"
            >
              <CircleAlert className="h-3 w-3" strokeWidth={2.25} />
              效果未驗證
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="px-4 py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">載入中…</div>
      ) : items.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">目前沒有符合條件的股票</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-[11px] font-medium text-zinc-400 dark:border-white/10 dark:text-zinc-500">
                <th className="sticky left-0 z-10 bg-white px-4 py-2 font-medium dark:bg-zinc-900">股票</th>
                <th className="px-3 py-2 text-right font-medium">收盤價</th>
                <th className="px-3 py-2 text-right font-medium">今日漲跌</th>
                <th className="px-3 py-2 text-right font-medium">買賣超(百萬)</th>
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
                  <td className="sticky left-0 z-10 min-w-[160px] bg-white px-4 py-2.5 group-hover:bg-zinc-50 dark:bg-zinc-900 dark:group-hover:bg-white/[0.03]">
                    <div className="flex items-baseline gap-1.5">
                      <Link href={`/tw/stock/${item.ticker}`} className="font-semibold text-zinc-900 hover:underline dark:text-zinc-100">
                        {item.ticker}
                      </Link>
                      <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">{stripCompanySuffix(item.companyName)}</span>
                    </div>
                    {item.triggerReason && (
                      <p className="mt-0.5 max-w-[260px] truncate text-[11px] text-zinc-400 dark:text-zinc-500" title={item.triggerReason}>
                        {item.triggerReason}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {item.priceNow.toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    <span className={changeColorClass(item.todayChangeAmount)}>
                      {item.todayChangeAmount !== null ? `${item.todayChangeAmount >= 0 ? "+" : ""}${item.todayChangeAmount.toFixed(2)}` : "—"}
                    </span>
                    <span className={`ml-1 text-xs ${changeColorClass(item.todayChangePct)}`}>
                      {item.todayChangePct !== null ? `(${item.todayChangePct >= 0 ? "+" : ""}${item.todayChangePct.toFixed(1)}%)` : ""}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    <span className={changeColorClass(item.netBuySellAmountMillions)}>
                      {item.netBuySellAmountMillions !== null
                        ? `${item.netBuySellAmountMillions >= 0 ? "+" : ""}${item.netBuySellAmountMillions.toLocaleString(undefined, { maximumFractionDigits: 1 })}`
                        : "—"}
                    </span>
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
                    {item.maAligned === null ? (
                      <span className="text-zinc-300 dark:text-zinc-600">—</span>
                    ) : item.maAligned ? (
                      <span className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400" title="MA5>MA10>MA20多頭排列">
                        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                      </span>
                    ) : (
                      <span className="text-zinc-300 dark:text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-center">
                    <BollingerBadge status={item.bollingerStatus} detail={item.bollingerDetail} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
