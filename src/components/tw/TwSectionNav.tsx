"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListFilter, Workflow, Presentation, Landmark, Newspaper } from "lucide-react";

const TABS = [
  { href: "/tw", icon: ListFilter, label: "選股-TW" },
  { href: "/tw/chains", icon: Workflow, label: "產業鏈" },
  { href: "/tw/fundamentals", icon: Presentation, label: "基本面" },
  { href: "/tw/institutional-reports", icon: Landmark, label: "法人報告" },
  { href: "/tw/report", icon: Newspaper, label: "每日異動" },
];

/**
 * 2026-08-18：/tw 原本把「選股結果」跟「產業鏈訊號燈號/資金輪動/板塊資金流動/熱圖」全部堆在
 * 同一頁，內容太長。拆成兩個獨立頁面（/tw選股、/tw/chains產業鏈），這個sub-nav放在兩頁最上面
 * 讓使用者知道這是TW版底下的兩個分頁，跟最上層的MarketNav（市場切換）是不同層級。
 * 2026-08-19：基本面（原本MarketNav的頂層tab /fundamentals）搬進來當第三個分頁——內容
 * 本來就是TW限定（龍頭+二軍法說會），放在TW section底下比放在頂層更合理。
 * 2026-08-19再加第四個分頁「法人報告」（券商/投顧產業趨勢文章，見esunsecClient.ts）。
 * 2026-08-20再加第五個分頁「每日異動」（每日異動報告v1，見dailyMarketDiff.ts）。
 */
export function TwSectionNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-white/10">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "border-transparent text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            }`}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
