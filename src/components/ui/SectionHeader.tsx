import type { LucideIcon } from "lucide-react";
import { IconBadge } from "./IconBadge";

/** 卡片標題列：圖示徽章 + 標題 + 選填說明tooltip，取代每個區塊各自重複的h2 markup */
export function SectionHeader({
  icon,
  iconColor = "zinc",
  title,
  tooltip,
}: {
  icon: LucideIcon;
  iconColor?: "amber" | "blue" | "rose" | "emerald" | "violet" | "zinc";
  title: string;
  tooltip?: React.ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
      <IconBadge icon={icon} color={iconColor} />
      {title}
      {tooltip}
    </h2>
  );
}
