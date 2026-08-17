"use client";

import { useRouter } from "next/navigation";
import { ThemeHeatmap } from "./ThemeHeatmap";

/** ThemeHeatmap搬到/tw/chains後，點主題不能再直接改同一頁的sector篩選state（已經是不同頁面），
 * 改成導到 /tw?sector=X，/tw/page.tsx 會讀這個query param當SectorTrendsBoard的初始篩選值。 */
export function ThemeHeatmapWithNavigation() {
  const router = useRouter();
  return <ThemeHeatmap onSelectTheme={(themeName) => router.push(`/tw?sector=${encodeURIComponent(themeName)}`)} />;
}
