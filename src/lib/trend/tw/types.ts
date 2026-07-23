import type { IndicatorSnapshot, SubScores, TrendStatus } from "@/lib/trend/types";
import type { ChipSubScores } from "./chipScore";
import type { ChipMomentum } from "./chipConcentration";

export type ChipBadge = "confirmed" | "divergence";

export interface TwDailySignal {
  tradeDate: string;
  /** 還原股價後的收盤價 */
  closePrice: number;
  volume: number;
  indicators: IndicatorSnapshot;
  technicalSubScores: SubScores;
  /** 技術面分數（5因子加權，跟美股版 coreScore 算法相同），0-100 */
  technicalScore: number;
  /** 籌碼面分數，0-100 */
  chipScore: number;
  chipSubScores: ChipSubScores;
  /** TW: 0.5*technicalScore + 0.5*chipScore；漲跌停日直接沿用 technicalScore 佔位，不參與排名 */
  coreScore: number;
  status: TrendStatus;
  reversalPointDate: string | null;
  priceAtSignal: number | null;
  isLimitMove: boolean;
  chipConcentration5: number;
  chipConcentration10: number;
  chipConcentration20: number;
  chipMomentum: ChipMomentum;
  /**
   * 舊版欄位（2026-07-23前，status="bullish"時才會有值：技術面穩健+籌碼轉強/轉弱的交叉驗證徽章）。
   * 改版後籌碼流已經是台股主要訊號來源，不再是疊加在技術面分類之上的次要訊號，永遠是null，
   * 只是保留欄位讓舊資料還能正常顯示，不用另外跑一次移除欄位的migration。
   */
  chipBadge: ChipBadge | null;
}
