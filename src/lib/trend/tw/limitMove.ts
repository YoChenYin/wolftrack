import type { OhlcvBar } from "@/lib/trend/types";

/** 台股漲跌幅限制 ±10% */
const TW_LIMIT_PCT = 10;
/** 容忍度：實務上漲跌停價會四捨五入到最小跳動單位，不會剛好等於 10.000% */
const LIMIT_TOLERANCE_PCT = 0.5;

/**
 * 判斷某天是否觸及漲跌停(±10%)。
 * 注意：要用「還原前」的原始收盤價判斷，不能用 adjustPrice() 處理過的價格——
 * 除權息當天前一日收盤價經過調整會跟原始交易所公告的漲跌停價對不上，判斷會失準。
 * 呼叫順序：先用 rawBars 判斷 isLimitMove，再對 rawBars 跑 adjustPrice() 做後續指標計算。
 */
export function isLimitMoveDay(rawBars: OhlcvBar[], index: number): boolean {
  if (index <= 0) return false;
  const prevClose = rawBars[index - 1].close;
  const close = rawBars[index].close;
  if (prevClose === 0) return false;
  const pctChange = ((close - prevClose) / prevClose) * 100;
  return Math.abs(pctChange) >= TW_LIMIT_PCT - LIMIT_TOLERANCE_PCT;
}
