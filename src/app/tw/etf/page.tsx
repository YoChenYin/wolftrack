import { PieChart, Flame } from "lucide-react";
import { TwSectionNav } from "@/components/tw/TwSectionNav";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { twReturnColor } from "@/lib/tw/color";
import {
  queryEtfOverview,
  computeLeadingTypes,
  STRUCTURE_TYPE_LABEL,
  STYLE_TAG_LABEL,
  type EtfStructureType,
  type EtfOverviewItem,
} from "@/lib/trend/tw/queryEtfOverview";

// 這個頁面直接查資料庫，不能被當成靜態頁面在 build time 凍結一份快照
export const dynamic = "force-dynamic";

const STRUCTURE_TYPE_ORDER: EtfStructureType[] = ["equity", "active", "leveraged", "inverse", "bond", "commodity"];
/** 平均漲跌幅樣本數低於這個門檻，不放進「今日領漲類型」——避免單一檔ETF的漲跌被誤讀成整個類型的動向 */
const MIN_SAMPLE_FOR_LEADING_TYPE = 3;

function EtfTable({ items }: { items: EtfOverviewItem[] }) {
  // 有資料的按日漲跌幅由高到低排（今天領漲的排最前面），沒有資料的一律排最後
  const sorted = [...items].sort((a, b) => {
    if ((a.dayChangePct === null) !== (b.dayChangePct === null)) return a.dayChangePct === null ? 1 : -1;
    if (a.dayChangePct !== null && b.dayChangePct !== null) return b.dayChangePct - a.dayChangePct;
    return a.ticker.localeCompare(b.ticker);
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] text-left text-sm">
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
              <td className="py-2 text-zinc-600 dark:text-zinc-300">
                {item.name}
                {item.styleTag && (
                  <span className="ml-1.5 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-400/10 dark:text-violet-400">
                    {STYLE_TAG_LABEL[item.styleTag]}
                  </span>
                )}
              </td>
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
  const leadingTypes = computeLeadingTypes(items).filter((t) => t.sampleSize >= MIN_SAMPLE_FOR_LEADING_TYPE);

  const byType = new Map<EtfStructureType, EtfOverviewItem[]>();
  for (const item of items) {
    const list = byType.get(item.structureType) ?? [];
    list.push(item);
    byType.set(item.structureType, list);
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
            依代號後綴分類（TWSE/TPEx官方編碼慣例，反映槓桿/反向/債券等風險機制，不是行銷話術）。追蹤中{items.length}檔，目前{withData}檔已有近期價格資料。
          </p>
          <div className="mt-4">
            <TwSectionNav />
          </div>
        </header>

        {leadingTypes.length > 0 && (
          <div className="tw-reveal" style={{ animationDelay: "60ms" }}>
            <Card>
              <SectionHeader icon={Flame} iconColor="rose" title="今日領漲類型" />
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">依結構型分類的平均日漲跌幅排序，樣本數低於{MIN_SAMPLE_FOR_LEADING_TYPE}檔不列入</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {leadingTypes.map((t) => (
                  <div key={t.structureType} className="rounded-xl bg-zinc-50/70 px-3 py-2 ring-1 ring-zinc-900/[0.04] dark:bg-white/[0.04] dark:ring-white/[0.06]">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{STRUCTURE_TYPE_LABEL[t.structureType]}</p>
                    <p className={`font-[family:var(--font-tw-mono)] text-lg font-semibold tabular-nums ${twReturnColor(t.avgChangePct)}`}>
                      {t.avgChangePct > 0 ? "+" : ""}
                      {t.avgChangePct.toFixed(2)}%
                    </p>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{t.sampleSize}檔平均</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {STRUCTURE_TYPE_ORDER.map((type, i) => {
          const typeItems = byType.get(type) ?? [];
          if (typeItems.length === 0) return null;
          return (
            <div key={type} className="tw-reveal" style={{ animationDelay: `${(i + 2) * 60}ms` }}>
              <Card>
                <SectionHeader icon={PieChart} iconColor="violet" title={`${STRUCTURE_TYPE_LABEL[type]}（${typeItems.length}檔）`} />
                <div className="mt-3">
                  <EtfTable items={typeItems} />
                </div>
              </Card>
            </div>
          );
        })}
      </main>
    </div>
  );
}
