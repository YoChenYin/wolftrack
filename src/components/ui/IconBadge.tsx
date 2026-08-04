import type { LucideIcon } from "lucide-react";

const BADGE_COLORS = {
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-400",
  rose: "bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-400",
  emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-400",
  zinc: "bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400",
} as const;

/** CUBE風格的圓形色塊icon徽章：色塊承載顏色，icon本身維持單色線條，取代原本裸露的emoji/icon */
export function IconBadge({
  icon: Icon,
  color = "zinc",
  size = "md",
}: {
  icon: LucideIcon;
  color?: keyof typeof BADGE_COLORS;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "h-5 w-5" : "h-7 w-7";
  const iconSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full ${box} ${BADGE_COLORS[color]}`}>
      <Icon className={iconSize} strokeWidth={2.25} />
    </span>
  );
}
