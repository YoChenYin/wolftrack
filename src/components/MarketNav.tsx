"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Construction, LineChart, CandlestickChart, NotebookText, FileSearch, Globe, BarChart3 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * 2026-08-19：改用icon取代國旗emoji（使用者要求拿掉flag），並且先把台股/總經以外的tab全部
 * 隱藏（hidden: true）——不是刪除，之後要恢復只要把hidden改回false。基本面已經搬到
 * /tw/fundamentals（TwSectionNav底下的第三個分頁），不再是這裡的頂層項目。
 */
const TABS: { href: string; icon: LucideIcon; label: string; underConstruction: boolean; hidden?: boolean }[] = [
  { href: "/", icon: Globe, label: "WolfTrack 狼蹤", underConstruction: true, hidden: true },
  { href: "/tw", icon: BarChart3, label: "WolfTrack TW", underConstruction: false },
  { href: "/macro", icon: LineChart, label: "總經", underConstruction: false },
  { href: "/futures", icon: CandlestickChart, label: "台指期", underConstruction: false, hidden: true },
  { href: "/trade-log", icon: NotebookText, label: "交易紀錄", underConstruction: false, hidden: true },
  { href: "/expectation-gap", icon: FileSearch, label: "預期差", underConstruction: false, hidden: true },
];

export function MarketNav() {
  const pathname = usePathname();
  const visibleTabs = TABS.filter((tab) => !tab.hidden);

  return (
    <nav className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-3 sm:px-6">
        {visibleTabs.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-3 text-sm font-medium transition-colors sm:px-3 ${
                active
                  ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-500 dark:hover:text-zinc-300"
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={2.25} />
              {tab.label}
              {tab.underConstruction && (
                <span title="施工中">
                  <Construction className="h-3.5 w-3.5 text-amber-500" strokeWidth={2.25} />
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
