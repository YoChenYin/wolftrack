import { ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, Minimize2, type LucideIcon } from "lucide-react";
import type { BollingerSignalType, BollingerTrend } from "./bollinger/types";

export interface BollingerBadgeMeta {
  icon: LucideIcon;
  label: string;
}

/**
 * 布林通道表格徽章的中文標籤跟icon，被TrendTable(台股表格)跟TrendColumn(美股卡片)共用，
 * 跟TACTICAL_STATUS_META（tacticalStatusMeta.ts）同樣的「從元件抽出來給兩邊共用」的理由。
 *
 * 顏色刻意不放在這裡：兩個市場的漲跌配色相反（台股慣例漲紅跌綠、美股相反），呼叫端已經
 * 各自有 changeColorClass() 處理這個差異，這裡只需要回傳 bollingerScore 讓呼叫端自己決定色系。
 *
 * 只有「今天有實際訊號」或「明顯偏多/偏空的既有趨勢」才顯示徽章，一般的多頭排列(bullish，
 * 沒有strong)/盤整(rangeBound)/中性(neutral)不顯示（回傳null）——維持舊版「只在真的值得
 * 注意時才佔用表格版位」的設計，不是每天都要顯示布林通道位置。
 */
export function getBollingerBadgeMeta(
  signal: BollingerSignalType | null,
  trend: BollingerTrend | null
): BollingerBadgeMeta | null {
  switch (signal) {
    case "buyOversold":
      return { icon: ArrowUp, label: "超跌反彈" };
    case "buyMa20Breakout":
      return { icon: ArrowUp, label: "站上月線" };
    case "sellOverbought":
      return { icon: ArrowDown, label: "過熱拉回" };
    case "sellMa20Breakdown":
      return { icon: ArrowDown, label: "跌破月線" };
    case "squeezeBullishBreakout":
      return { icon: ChevronsUp, label: "收斂突破" };
    case "squeezeBearishBreakout":
      return { icon: ChevronsDown, label: "收斂跌破" };
    case "squeezeWatch":
      return { icon: Minimize2, label: "通道收斂" };
    default:
      break;
  }
  if (trend === "strongBullish") return { icon: ChevronsUp, label: "強勢多頭" };
  if (trend === "bearish") return { icon: ChevronsDown, label: "空頭排列" };
  return null;
}
