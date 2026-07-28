import type { LucideIcon } from "lucide-react";

const BADGE_COLORS = {
  amber: "bg-amber-50 text-amber-700",
  blue: "bg-blue-50 text-blue-700",
  rose: "bg-rose-50 text-rose-700",
  emerald: "bg-emerald-50 text-emerald-700",
  violet: "bg-violet-50 text-violet-700",
  zinc: "bg-zinc-100 text-zinc-500",
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
