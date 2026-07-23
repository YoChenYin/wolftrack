import Link from "next/link";
import type { SectorTrendItem, TacticalStatus } from "@/lib/trend/sectorTrendsQuery";
import type { Market } from "@/generated/prisma/enums";
import { stripCompanySuffix } from "@/lib/formatCompanyName";
import { InfoTooltip } from "./InfoTooltip";

const COLUMN_META: Record<
  TacticalStatus,
  { emoji: string; title: string; subtitle: string; accent: string; badge: string; criteria: string; signalLabel: string }
> = {
  reversal: {
    emoji: "🔵",
    title: "反轉雷達",
    subtitle: "接近趨勢切換點，變盤初期 — 提早佈局",
    accent: "border-t-blue-500",
    badge: "bg-blue-50 text-blue-700",
    criteria:
      "近期剛發生黃金交叉，動能剛轉強：① MA20/MA50 在近5個交易日內出現黃金交叉 ② 同期間 MACD 柱狀圖由負轉正 ③ 近3日內出現爆量（成交量 > 20日均量 ×1.5倍）。三者同時符合才會進這一欄。",
    signalLabel: "反轉點",
  },
  pullback: {
    emoji: "🟡",
    title: "蓄勢待發",
    subtitle: "回檔整理中 — 等拉回上車",
    accent: "border-t-amber-500",
    badge: "bg-amber-50 text-amber-700",
    criteria:
      "多頭排列中的健康回檔，準備反彈：① 均線多頭排列（MA20>MA50>MA200）② 從近60日高點回檔5%~15%之間 ③ 股價貼近MA20或MA50支撐（±2%以內）④ RSI從超買區(>70)冷卻回40~55區間。",
    signalLabel: "反轉點",
  },
  bullish: {
    emoji: "🟢",
    title: "趨勢穩健",
    subtitle: "已進入上升軌道、動能延續 — 續抱追蹤",
    accent: "border-t-emerald-500",
    badge: "bg-emerald-50 text-emerald-700",
    criteria:
      "確立中的強勢多頭趨勢：① 均線多頭排列且MA20/MA50/MA200近5日都上揚 ② ADX14>25且持續走高 ③ 近20日內至少2次「新高」 ④ 從近60日高點回檔不到5%。",
    signalLabel: "反轉點",
  },
  entry: {
    emoji: "🔵",
    title: "進場",
    subtitle: "籌碼+技術面同步轉強 — 符合條件，效果待驗證",
    accent: "border-t-blue-500",
    badge: "bg-blue-50 text-blue-700",
    criteria:
      "① 投信/外資近3個月合計買超 ② 買超力道與籌碼集中度呈5日>10日>20日加速排列 ③ MA5>MA10>MA20多頭排列 ④ KD黃金交叉、K持續走強、且KD<80未過熱。⚠️用真實production資料回測過：這組條件本身的20日超額報酬中位數約-0.04%（接近打平，不是驗證有效的alpha訊號），只是「符合這組條件」，出現不代表歷史上會賺錢，請搭配「出場」訊號嚴格執行風控。",
    signalLabel: "訊號起點",
  },
  exit: {
    emoji: "🔴",
    title: "出場",
    subtitle: "至少一項風控條件觸發 — 建議減碼或出場",
    accent: "border-t-rose-500",
    badge: "bg-rose-50 text-rose-700",
    criteria:
      "任一成立即觸發：① MA5跌破MA10 ② 投信/外資賣超力道呈2日>5日>10日加速（且近2日確實淨賣超）③ 近3日漲幅>15%且股價跌破MA5，或近3日漲幅>10%且跌破MA10（噴出後停利）。回測驗證投信/外資賣超加速是預測力最強的出場訊號（20日中位超額報酬約-2%），MA死叉次之（約-0.5%~-1.4%，時間拉越長越準）。",
    signalLabel: "訊號起點",
  },
  buyDip: {
    emoji: "🟡",
    title: "逢低布局",
    subtitle: "回落季線的健康拉回 — 目前唯一驗證有效的訊號",
    accent: "border-t-amber-500",
    badge: "bg-amber-50 text-amber-700",
    criteria:
      "① 股價落在季線(MA60)±1.5%範圍內 ② 近5日籌碼集中度≥15%。✅用真實production資料回測過，是目前這套策略裡唯一有穩健正超額報酬的訊號：20日中位超額報酬約+2.1%~+2.3%，勝率70%以上。",
    signalLabel: "訊號起點",
  },
};

function formatChangePct(value: number | null): string {
  if (value === null) return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/** 台股慣例是漲紅跌綠，跟美股的漲綠跌紅相反，這個元件兩個市場共用，要照market分開判斷 */
function changeColorClass(value: number | null, market: Market): string {
  if (value === null) return "text-zinc-400";
  const upColor = market === "TW" ? "text-red-600" : "text-emerald-600";
  const downColor = market === "TW" ? "text-emerald-600" : "text-red-600";
  if (value > 0) return upColor;
  if (value < 0) return downColor;
  return "text-zinc-500";
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
  const meta = COLUMN_META[status];

  return (
    <section className={`flex flex-col rounded-lg border border-t-4 border-zinc-200 bg-white ${meta.accent} shadow-sm`}>
      <header className="border-b border-zinc-100 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900">
          <span>{meta.emoji}</span>
          {meta.title}
          <InfoTooltip>{meta.criteria}</InfoTooltip>
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">{meta.subtitle}</p>
      </header>

      <div className="flex flex-col divide-y divide-zinc-100">
        {loading ? (
          <div className="px-4 py-6 text-center text-sm text-zinc-400">載入中…</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-zinc-400">目前沒有符合條件的股票</div>
        ) : (
          items.map((item, index) => (
            <div key={item.ticker} className="flex items-center gap-3 px-4 py-3">
              <span className="w-5 shrink-0 text-xs font-medium text-zinc-400">{index + 1}</span>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  {market === "TW" ? (
                    <Link href={`/tw/stock/${item.ticker}`} className="font-semibold text-zinc-900 hover:underline">
                      {item.ticker}
                    </Link>
                  ) : (
                    <span className="font-semibold text-zinc-900">{item.ticker}</span>
                  )}
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${meta.badge}`}>
                    {item.coreScore.toFixed(0)}
                  </span>
                  {item.chipBadge === "confirmed" && (
                    <span className="text-xs" title="籌碼確認：技術面與法人籌碼同步走強">
                      籌碼確認 ✅
                    </span>
                  )}
                  {item.chipBadge === "divergence" && (
                    <span className="text-xs" title="籌碼背離：價格續強但法人籌碼轉弱">
                      籌碼背離 ⚠️
                    </span>
                  )}
                  {item.revenueYoyGrowthPct !== null && (
                    <span
                      className={`text-xs font-medium ${changeColorClass(item.revenueYoyGrowthPct, market)}`}
                      title={`${item.revenueMonth} 月營收年增率`}
                    >
                      {item.revenueYoyGrowthPct >= 20 ? "🚀" : ""}營收{item.revenueYoyGrowthPct >= 0 ? "+" : ""}
                      {item.revenueYoyGrowthPct.toFixed(0)}%
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-zinc-500">{stripCompanySuffix(item.companyName)}</p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {item.signalDate ? (
                    <>
                      {meta.signalLabel} {item.signalDate}
                      {item.daysSinceSignal !== null && <> · {item.daysSinceSignal} 天前</>}
                    </>
                  ) : (
                    `${meta.signalLabel} N/A`
                  )}
                </p>
                {item.themes.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {item.themes.map((theme) => (
                      <span
                        key={theme.code}
                        className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500"
                      >
                        {theme.nameZh ?? theme.code}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="shrink-0 text-right">
                <div className={`text-sm font-semibold ${changeColorClass(item.changePctSinceSignal, market)}`}>
                  {formatChangePct(item.changePctSinceSignal)}
                </div>
                <p className="text-[10px] font-normal text-zinc-400">訊號後漲跌幅</p>
                <div className="mt-1 text-xs text-zinc-500">
                  {item.priceNow.toFixed(2)}
                  <span className={`ml-1 font-medium ${changeColorClass(item.todayChangePct, market)}`}>
                    {formatChangePct(item.todayChangePct)}
                  </span>
                </div>
                <p className="text-[10px] font-normal text-zinc-400">
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
