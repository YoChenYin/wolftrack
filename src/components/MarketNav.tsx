"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "🇺🇸 WolfTrack 狼蹤" },
  { href: "/tw", label: "🇹🇼 WolfTrack TW" },
] as const;

export function MarketNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl gap-1 px-6">
        {TABS.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                active
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
