"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Construction } from "lucide-react";

const TABS = [
  { href: "/", flag: "🇺🇸", label: "WolfTrack 狼蹤", underConstruction: true },
  { href: "/tw", flag: "🇹🇼", label: "WolfTrack TW", underConstruction: false },
] as const;

export function MarketNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex w-full max-w-6xl gap-1 px-6">
        {TABS.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
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
              <span>{tab.flag}</span>
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
