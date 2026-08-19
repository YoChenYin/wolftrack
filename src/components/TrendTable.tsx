import Link from "next/link";
import {
  CircleAlert,
  ChevronsUp,
  ChevronsDown,
  Minimize2,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  ArrowUpToLine,
  ArrowDownToLine,
  Globe,
  Landmark,
  Waves,
} from "lucide-react";
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

function formatPrice(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

/** 支撐/壓力（近60個交易日高低點，見supportResistance.ts）——壓力=建議停利參考、
 * 支撐=建議進場參考，用圖示直接標明用途（壓力=上緣、支撐=下緣）取代文字標籤，縮成緊湊的
 * icon+數字兩行，不用像文字標籤那樣佔橫向空間。今天如果已經站上壓力或跌破支撐，用顏色+
 * 粗體標出來（不再另外多一行文字），滑鼠停留看完整說明 */
function SupportResistanceCell({
  support,
  resistance,
  priceStatus,
}: {
  support: number | null;
  resistance: number | null;
  priceStatus: SectorTrendItem["priceStatus"];
}) {
  if (support === null || resistance === null) return <span className="text-zinc-300 dark:text-zinc-600">—</span>;
  const aboveResistance = priceStatus === "aboveResistance";
  const belowSupport = priceStatus === "belowSupport";
  return (
    <div className="flex flex-col items-end gap-1 text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
      <span
        className={`inline-flex items-center gap-1 ${aboveResistance ? "font-semibold text-red-600 dark:text-red-400" : ""}`}
        title={aboveResistance ? "已站上近60日壓力價" : "壓力價（近60日高點）"}
      >
        <ArrowUpToLine className="h-3 w-3 shrink-0" strokeWidth={2.25} />
        {formatPrice(resistance)}
      </span>
      <span
        className={`inline-flex items-center gap-1 ${belowSupport ? "font-semibold text-emerald-600 dark:text-emerald-400" : ""}`}
        title={belowSupport ? "已跌破近60日支撐價" : "支撐價（近60日低點）"}
      >
        <ArrowDownToLine className="h-3 w-3 shrink-0" strokeWidth={2.25} />
        {formatPrice(support)}
      </span>
    </div>
  );
}

/** 外資/投信近60個交易日持續買超部位的加權平均成本，見institutionalCostBasis.ts——用圖示
 * 區分兩種法人（地球=外資、建物=投信）取代文字標籤，跟支撐/壓力欄位同樣的緊湊排法 */
function CostBasisCell({ foreignCostBasis, trustCostBasis }: { foreignCostBasis: number | null; trustCostBasis: number | null }) {
  if (foreignCostBasis === null && trustCostBasis === null) return <span className="text-zinc-300 dark:text-zinc-600">—</span>;
  return (
    <div className="flex flex-col items-end gap-1 text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
      <span className="inline-flex items-center gap-1" title="外資近60日加權平均成本價">
        <Globe className="h-3 w-3 shrink-0 text-blue-500 dark:text-blue-400" strokeWidth={2.25} />
        {formatPrice(foreignCostBasis)}
      </span>
      <span className="inline-flex items-center gap-1" title="投信近60日加權平均成本價">
        <Landmark className="h-3 w-3 shrink-0 text-violet-500 dark:text-violet-400" strokeWidth={2.25} />
        {formatPrice(trustCostBasis)}
      </span>
    </div>
  );
}

/** 底部反轉型態（頭肩底/N字底，見detectBottomPattern.ts）——獨立於status，其他5個分頁的股票
 * 也可能剛好有值（型態跟籌碼流是不同來源的訊號，不互斥），順便讓使用者發現額外的訊號重疊。
 * 完整描述（含突破價位/目標價）放title，滑鼠停留看，欄位本身只放型態名稱+階段，維持緊湊 */
function BottomPatternCell({
  type,
  stage,
  description,
}: {
  type: SectorTrendItem["bottomPatternType"];
  stage: SectorTrendItem["bottomPatternStage"];
  description: string | null;
}) {
  if (type === null) return <span className="text-zinc-300 dark:text-zinc-600">—</span>;
  const label = type === "headShoulders" ? "頭肩底" : "N字底";
  const confirmed = stage === "confirmed";
  return (
    <div className="flex flex-col items-end gap-1 text-xs text-zinc-600 dark:text-zinc-300" title={description ?? undefined}>
      <span className="inline-flex items-center gap-1">
        <Waves className="h-3 w-3 shrink-0" strokeWidth={2.25} />
        {label}
      </span>
      <span className={confirmed ? "font-semibold text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}>
        {confirmed ? "已突破確認" : "即將突破"}
      </span>
    </div>
  );
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

/** 產業(TWSE官方產業別) + 對應板塊(group_config.json主題，如果有的話)——兩者是不同分類系統，
 * 板塊比較貼近使用者實際想看的供應鏈/概念族群，有的話一起顯示 */
function IndustryCell({ sector, themes }: { sector: SectorTrendItem["sector"]; themes: SectorTrendItem["themes"] }) {
  return (
    <div className="min-w-0">
      <div className="truncate">{sector.nameZh ?? sector.name}</div>
      {themes.length > 0 && (
        <div className="truncate text-[11px] text-zinc-400 dark:text-zinc-500">{themes.map((t) => t.nameZh ?? t.code).join("、")}</div>
      )}
    </div>
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
                  <th className="px-3 py-2 text-right font-medium">買賣超張數(整體)</th>
                  <th className="px-3 py-2 text-right font-medium">買賣超(百萬,整體)</th>
                  <th className="px-3 py-2 text-right font-medium">投信買賣超</th>
                  <th className="px-3 py-2 text-right font-medium">買賣超天數</th>
                  <th className="px-3 py-2 text-right font-medium">籌碼5日</th>
                  <th className="px-3 py-2 text-right font-medium">10日</th>
                  <th className="px-3 py-2 text-right font-medium">20日</th>
                  <th className="px-3 py-2 text-center font-medium">MA排列</th>
                  <th className="px-3 py-2 text-center font-medium">布林訊號</th>
                  <th className="px-3 py-2 text-right font-medium">
                    支撐/壓力
                    <InfoTooltip align="right">
                      <ArrowUpToLine className="mr-1 inline h-3 w-3" strokeWidth={2.25} />壓力價（近60日高點）／
                      <ArrowDownToLine className="mr-1 inline h-3 w-3" strokeWidth={2.25} />支撐價（近60日低點）。已站上壓力或跌破支撐時數字會變色加粗。
                    </InfoTooltip>
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    外資/投信成本
                    <InfoTooltip align="right">
                      <Globe className="mr-1 inline h-3 w-3" strokeWidth={2.25} />外資／
                      <Landmark className="mr-1 inline h-3 w-3" strokeWidth={2.25} />投信，近60個交易日持續買超部位的加權平均成本價。
                    </InfoTooltip>
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    型態訊號
                    <InfoTooltip align="right">
                      <Waves className="mr-1 inline h-3 w-3" strokeWidth={2.25} />
                      偵測到的底部反轉型態（頭肩底/N字底），獨立於上面的戰術分類，跟其他分頁不互斥。滑鼠停留看完整說明。
                    </InfoTooltip>
                  </th>
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
                    <td className="max-w-[160px] px-3 py-2.5 text-xs text-zinc-500 dark:text-zinc-400">
                      <IndustryCell sector={item.sector} themes={item.themes} />
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${changeColorClass(item.todayChangeAmount)}`}>
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
                    <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${changeColorClass(item.trustNetBuyLots)}`}>
                      {formatLots(item.trustNetBuyLots)}
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
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <SupportResistanceCell support={item.support} resistance={item.resistance} priceStatus={item.priceStatus} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <CostBasisCell foreignCostBasis={item.foreignCostBasis} trustCostBasis={item.trustCostBasis} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <BottomPatternCell
                        type={item.bottomPatternType}
                        stage={item.bottomPatternStage}
                        description={item.bottomPatternDescription}
                      />
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
                    <div className="text-xs text-zinc-400 dark:text-zinc-500">{item.ticker}</div>
                    <div className="mt-0.5 truncate text-[11px] text-zinc-400 dark:text-zinc-500">
                      {item.sector.nameZh ?? item.sector.name}
                      {item.themes.length > 0 && <> · {item.themes.map((t) => t.nameZh ?? t.code).join("、")}</>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`tabular-nums ${changeColorClass(item.todayChangeAmount)}`}>{item.priceNow.toFixed(2)}</div>
                    <ChangeCell amount={item.todayChangeAmount} pct={item.todayChangePct} />
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <div className="flex items-center justify-between rounded bg-zinc-50 px-2 py-1 dark:bg-white/[0.04]">
                    <span className="text-zinc-400 dark:text-zinc-500">買賣超張數(整體)</span>
                    <span className={`tabular-nums font-medium ${changeColorClass(item.netBuySellLots)}`}>{formatLots(item.netBuySellLots)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded bg-zinc-50 px-2 py-1 dark:bg-white/[0.04]">
                    <span className="text-zinc-400 dark:text-zinc-500">買賣超(百萬,整體)</span>
                    <span className={`tabular-nums font-medium ${changeColorClass(item.netBuySellAmountMillions)}`}>
                      {formatAmount(item.netBuySellAmountMillions)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded bg-zinc-50 px-2 py-1 dark:bg-white/[0.04]">
                    <span className="text-zinc-400 dark:text-zinc-500">投信買賣超</span>
                    <span className={`tabular-nums font-medium ${changeColorClass(item.trustNetBuyLots)}`}>{formatLots(item.trustNetBuyLots)}</span>
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
                    <span className="shrink-0 text-zinc-400 dark:text-zinc-500">籌碼集中度 5/10/20日</span>
                    <span className="whitespace-nowrap tabular-nums font-medium text-zinc-600 dark:text-zinc-300">
                      {formatConcentration(item.chipConcentration5)} / {formatConcentration(item.chipConcentration10)} / {formatConcentration(item.chipConcentration20)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded bg-zinc-50 px-2 py-1 dark:bg-white/[0.04]">
                    <span className="text-zinc-400 dark:text-zinc-500">支撐/壓力</span>
                    <span className="text-right tabular-nums font-medium text-zinc-600 dark:text-zinc-300">
                      {formatPrice(item.support)} / {formatPrice(item.resistance)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded bg-zinc-50 px-2 py-1 dark:bg-white/[0.04]">
                    <span className="text-zinc-400 dark:text-zinc-500">外資/投信成本</span>
                    <span className="text-right tabular-nums font-medium text-zinc-600 dark:text-zinc-300">
                      {formatPrice(item.foreignCostBasis)} / {formatPrice(item.trustCostBasis)}
                    </span>
                  </div>
                  {(item.priceStatus === "aboveResistance" || item.priceStatus === "belowSupport") && (
                    <div className="col-span-2 flex items-center justify-between rounded bg-zinc-50 px-2 py-1 dark:bg-white/[0.04]">
                      <span className="text-zinc-400 dark:text-zinc-500">支撐/壓力狀態</span>
                      <span
                        className={`font-medium ${
                          item.priceStatus === "aboveResistance"
                            ? "text-red-600 dark:text-red-400"
                            : "text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {item.priceStatus === "aboveResistance" ? "已站上壓力" : "已跌破支撐"}
                      </span>
                    </div>
                  )}
                  {item.bottomPatternType !== null && (
                    <div
                      className="col-span-2 flex items-center justify-between rounded bg-zinc-50 px-2 py-1 dark:bg-white/[0.04]"
                      title={item.bottomPatternDescription ?? undefined}
                    >
                      <span className="text-zinc-400 dark:text-zinc-500">型態訊號</span>
                      <span
                        className={`font-medium ${
                          item.bottomPatternStage === "confirmed"
                            ? "text-red-600 dark:text-red-400"
                            : "text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {item.bottomPatternType === "headShoulders" ? "頭肩底" : "N字底"}・
                        {item.bottomPatternStage === "confirmed" ? "已突破確認" : "即將突破"}
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
