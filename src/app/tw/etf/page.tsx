import { PieChart } from "lucide-react";
import { TwSectionNav } from "@/components/tw/TwSectionNav";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { twReturnColor } from "@/lib/tw/color";
import { queryEtfOverview, ETF_CATEGORY_LABEL, type EtfCategory, type EtfOverviewItem } from "@/lib/trend/tw/queryEtfOverview";

// 這個頁面直接查資料庫，不能被當成靜態頁面在 build time 凍結一份快照
export const dynamic = "force-dynamic";

const CATEGORY_ORDER: EtfCategory[] = ["listed", "otc", "otcBond"];

function EtfTable({ items }: { items: EtfOverviewItem[] }) {
  // 有價格資料的排前面——413檔裡大多數還沒回填歷史，全部照代號排序會讓真正有東西看的
  // 幾檔被淹沒在一長串「—」裡面
  const sorted = [...items].sort((a, b) => {
    if ((a.latestClose === null) !== (b.latestClose === null)) return a.latestClose === null ? 1 : -1;
    return a.ticker.localeCompare(b.ticker);
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-sm">
        <thead>
          <tr className="text-xs text-zinc-400 dark:text-zinc-500">
            <th className="pb-2 font-medium">代號</th>
            <th className="pb-2 font-medium">名稱</th>
            <th className="pb-2 font-medium text-right">最新收盤</th>
            <th className="pb-2 font-medium text-right">日漲跌</th>
            <th className="pb-2 font-medium text-right">資料日期</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
          {sorted.map((item) => (
            <tr key={item.ticker}>
              <td className="py-2 font-[family:var(--font-tw-mono)] font-semibold text-zinc-900 dark:text-zinc-100">{item.ticker}</td>
              <td className="py-2 text-zinc-600 dark:text-zinc-300">{item.name}</td>
              <td className="py-2 text-right font-[family:var(--font-tw-mono)] tabular-nums text-zinc-900 dark:text-zinc-100">
                {item.latestClose !== null ? item.latestClose.toFixed(2) : "—"}
              </td>
              <td className={`py-2 text-right font-[family:var(--font-tw-mono)] tabular-nums font-medium ${twReturnColor(item.dayChangePct)}`}>
                {item.dayChangePct !== null ? `${item.dayChangePct > 0 ? "+" : ""}${item.dayChangePct.toFixed(2)}%` : "—"}
              </td>
              <td className="py-2 text-right text-xs text-zinc-400 dark:text-zinc-500">{item.latestTradeDate ?? "尚無資料"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function TwEtfPage() {
  const items = await queryEtfOverview();
  const withData = items.filter((i) => i.latestClose !== null).length;
  const byCategory = new Map<EtfCategory, EtfOverviewItem[]>();
  for (const item of items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }

  return (
    <div
      className="relative flex flex-1 flex-col overflow-hidden font-[family:var(--font-tw-sans)] dark:bg-zinc-950"
      style={{ background: "var(--tw-canvas)" }}
    >
      <main className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
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
              ETF
            </h1>
            <span className="font-[family:var(--font-tw-mono)] text-xs font-medium tracking-wide text-amber-800/60 dark:text-amber-400/70">
              WOLFTRACK · TW ETF
            </span>
          </div>
          <div className="mt-2 h-px w-24 bg-gradient-to-r from-amber-700/50 to-transparent dark:from-amber-400/40" />
          <p className="mt-3 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
            台股ETF獨立整理——法人買賣超反映造市商申贖套利，不是股票挑選的邏輯，跟選股頁分開顯示。追蹤中{items.length}檔，目前{withData}檔已有近期價格資料。
          </p>
          <div className="mt-4">
            <TwSectionNav />
          </div>
        </header>

        {CATEGORY_ORDER.map((category, i) => {
          const categoryItems = byCategory.get(category) ?? [];
          if (categoryItems.length === 0) return null;
          return (
            <div key={category} className="tw-reveal" style={{ animationDelay: `${(i + 1) * 60}ms` }}>
              <Card>
                <SectionHeader icon={PieChart} iconColor="violet" title={`${ETF_CATEGORY_LABEL[category]}（${categoryItems.length}檔）`} />
                <div className="mt-3">
                  <EtfTable items={categoryItems} />
                </div>
              </Card>
            </div>
          );
        })}
      </main>
    </div>
  );
}
