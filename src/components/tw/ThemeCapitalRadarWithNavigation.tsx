"use client";

import { useRouter } from "next/navigation";
import { ThemeCapitalRadar } from "./ThemeCapitalRadar";

/** 跟 ThemeHeatmapWithNavigation.tsx 同樣的理由：點排行榜裡的theme要導到 /tw?sector=X
 * 套用板塊篩選，導航邏輯留在這層，ThemeCapitalRadar本身保持純展示+onSelectTheme callback。 */
export function ThemeCapitalRadarWithNavigation() {
  const router = useRouter();
  return <ThemeCapitalRadar onSelectTheme={(themeName) => router.push(`/tw?sector=${encodeURIComponent(themeName)}`)} />;
}
