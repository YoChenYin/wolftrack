import Link from "next/link";
import type { SectorTrendItem, TacticalStatus } from "@/lib/trend/sectorTrendsQuery";
import type { Market } from "@/generated/prisma/enums";

const COLUMN_META: Record<TacticalStatus, { emoji: string; title: string; subtitle: string; accent: string; badge: string }> = {
  reversal: {
    emoji: "🔵",
    title: "反轉雷達",
    subtitle: "接近趨勢切換點，變盤初期 — 提早佈局",
    accent: "border-t-blue-500",
    badge: "bg-blue-50 text-blue-700",
  },
  pullback: {
    emoji: "🟡",
    title: "蓄勢待發",
    subtitle: "回檔整理中 — 等拉回上車",
    accent: "border-t-amber-500",
    badge: "bg-amber-50 text-amber-700",
  },
  bullish: {
    emoji: "🟢",
    title: "趨勢穩健",
    subtitle: "已進入上升軌道、動能延續 — 續抱追蹤",
    accent: "border-t-emerald-500",
    badge: "bg-emerald-50 text-emerald-700",
  },
};

function formatChangePct(value: number | null): string {
  if (value === null) return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function changeColorClass(value: number | null): string {
  if (value === null) return "text-zinc-400";
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-red-600";
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
                </div>
                <p className="truncate text-xs text-zinc-500">{item.companyName}</p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {item.signalDate ? (
                    <>
                      反轉點 {item.signalDate}
                      {item.daysSinceSignal !== null && <> · {item.daysSinceSignal} 天前</>}
                    </>
                  ) : (
                    "反轉點 N/A"
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

              <div className={`shrink-0 text-right text-sm font-semibold ${changeColorClass(item.changePctSinceSignal)}`}>
                {formatChangePct(item.changePctSinceSignal)}
                <p className="text-[10px] font-normal text-zinc-400">訊號後漲跌幅</p>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
