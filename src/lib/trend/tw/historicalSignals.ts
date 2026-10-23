import { prisma } from "@/lib/prisma";
import type { OhlcvBar } from "@/lib/trend/types";
import type { InstitutionalDay } from "./chipScore";
import { computeChipFlowIndicators, classifyChipFlow } from "./classifyChipFlow";
import { detectBottomPattern } from "./detectBottomPattern";
import { isLimitMoveDay } from "./limitMove";
import type { SimDay } from "./trackRecordSim";
import type { RevenueMonth } from "./revenueMomentum";

/**
 * 研究腳本共用：從DB載入單一股票的完整歷史，並把正式環境的分類邏輯（籌碼流+底部型態）回溯
 * 套用到每一天，產生跟daily_trend_signals同樣形狀的訊號（只用當天以前的資料）。
 * 使用者：scripts/compare-track-record-exits.ts、scripts/backtest-revenue-chip.ts
 */

/** 籌碼流（MA60）+底部型態（120天pivot）需要的暖身期，跟runTwDailyBatch.ts一致 */
export const SIGNAL_WARMUP_DAYS = 210;
const BOTTOM_PATTERN_WINDOW = 130;

export async function loadPriceBars(stockId: number): Promise<OhlcvBar[]> {
  const rows = await prisma.twDailyPrice.findMany({ where: { stockId }, orderBy: { tradeDate: "asc" } });
  return rows.map((r) => ({
    date: r.tradeDate.toISOString().slice(0, 10),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
  }));
}

export async function loadInstitutionalDays(stockId: number): Promise<InstitutionalDay[]> {
  const rows = await prisma.twInstitutionalTrading.findMany({ where: { stockId }, orderBy: { tradeDate: "asc" } });
  return rows.map((r) => ({
    date: r.tradeDate.toISOString().slice(0, 10),
    foreignNetBuyShares: Number(r.foreignNetBuyShares),
    investTrustNetBuyShares: Number(r.investTrustNetBuyShares),
    dealerNetBuyShares: Number(r.dealerNetBuyShares),
    totalVolumeShares: Number(r.totalVolumeShares),
  }));
}

export async function loadRevenueMonths(stockId: number): Promise<RevenueMonth[]> {
  const rows = await prisma.twMonthlyRevenue.findMany({ where: { stockId }, orderBy: { revenueMonth: "asc" } });
  return rows.map((r) => ({ month: r.revenueMonth.toISOString().slice(0, 10), revenue: Number(r.revenue) }));
}

export function buildSignalDays(bars: OhlcvBar[], institutional: InstitutionalDay[]): Map<string, SimDay> {
  const indicators = computeChipFlowIndicators(bars);
  const days = new Map<string, SimDay>();
  for (let i = SIGNAL_WARMUP_DAYS; i < bars.length; i++) {
    const isLimitMove = isLimitMoveDay(bars, i);
    const chip = classifyChipFlow(bars, indicators, i, institutional, isLimitMove);
    const bottom = detectBottomPattern(bars.slice(Math.max(0, i + 1 - BOTTOM_PATTERN_WINDOW), i + 1));
    days.set(bars[i].date, {
      status: isLimitMove ? "limitMove" : chip.status,
      triggerReason: chip.triggerReason,
      hasBottomPattern: bottom !== null,
      bottomPatternDescription: bottom?.description ?? null,
      bottomPatternTargetPrice: bottom?.targetPrice ?? null,
    });
  }
  return days;
}
