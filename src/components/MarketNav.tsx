"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Construction, LineChart, CandlestickChart } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const TABS: { href: string; flag?: string; icon?: LucideIcon; label: string; underConstruction: boolean }[] = [
  { href: "/", flag: "🇺🇸", label: "WolfTrack 狼蹤", underConstruction: true },
  { href: "/tw", flag: "🇹🇼", label: "WolfTrack TW", underConstruction: false },
  { href: "/macro", icon: LineChart, label: "總經", underConstruction: false },
  { href: "/futures", icon: CandlestickChart, label: "台指期", underConstruction: false },
];

export function MarketNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex w-full max-w-6xl gap-1 px-6">
        {TABS.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                active
                  ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-500 dark:hover:text-zinc-300"
              }`}
            >
              {tab.flag ? <span>{tab.flag}</span> : Icon && <Icon className="h-4 w-4" strokeWidth={2.25} />}
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
