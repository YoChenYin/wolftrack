import { prisma } from "@/lib/prisma";
import { getGroupConfig } from "./groupConfig";

export interface ThemeHeatmapCell {
  themeName: string;
  category: string;
  return5d: number | null;
  return10d: number | null;
  return20d: number | null;
  /** 有實際股價資料可算報酬率的成員數（分母），跟 theme.members.length 不一定相等 */
  sampleSize: number;
  /** 2026-07-10：這個 theme 在產業鏈裡的上中下游位置，沒有的話是空陣列（見 groupConfig.ts ThemeChainStage） */
  chainStages: { chainName: string; stageKey: string; label: string }[];
}

const LOOKBACK_TRADING_DAYS = 21; // 算20日報酬要21筆(今天+20天前)
const LOOKBACK_CALENDAR_DAYS = 45; // 21個交易日抓寬鬆一點的日曆天數，含週末假日緩衝

/**
 * 每個 theme 的族群平均 5/10/20 日報酬率，給首頁「所有板塊熱圖」用。
 * 跟 computeGroupValuation() 的 calculateReturn20d 邏輯類似，但這裡要對「全部 theme 的全部
 * 成員」一次算，所以改成一次性批次撈價格（只抓最近 45 天），在記憶體裡算，避免每個 theme
 * 每個成員都各自查一次資料庫（43 個 theme x 平均5-6個成員 = 200+ 次查詢）。
 */
export async function computeThemeHeatmap(): Promise<ThemeHeatmapCell[]> {
  const config = getGroupConfig();

  const allTickers = new Set<string>();
  for (const themes of Object.values(config.industry_concepts)) {
    for (const theme of themes) {
      for (const t of theme.members) allTickers.add(t);
    }
  }

  const stocks = await prisma.stock.findMany({
    where: { market: "TW", ticker: { in: [...allTickers] } },
    select: { id: true, ticker: true },
  });
  const stockIdByTicker = new Map(stocks.map((s) => [s.ticker, s.id]));
  const stockIds = stocks.map((s) => s.id);

  const cutoff = new Date(Date.now() - LOOKBACK_CALENDAR_DAYS * 86_400_000);
  const priceRows = await prisma.twDailyPrice.findMany({
    where: { stockId: { in: stockIds }, tradeDate: { gte: cutoff } },
    orderBy: [{ stockId: "asc" }, { tradeDate: "desc" }],
    select: { stockId: true, tradeDate: true, close: true },
  });

  const barsByStockId = new Map<number, { close: number }[]>();
  for (const row of priceRows) {
    const list = barsByStockId.get(row.stockId) ?? [];
    if (list.length < LOOKBACK_TRADING_DAYS) list.push({ close: Number(row.close) });
    barsByStockId.set(row.stockId, list);
  }

  function returnOverDays(bars: { close: number }[] | undefined, days: number): number | null {
    if (!bars || bars.length <= days) return null;
    const latest = bars[0].close;
    const past = bars[days].close;
    if (past === 0) return null;
    return Math.round(((latest - past) / past) * 10000) / 100;
  }

  function tickerReturns(ticker: string): { r5: number | null; r10: number | null; r20: number | null } {
    const stockId = stockIdByTicker.get(ticker);
    const bars = stockId !== undefined ? barsByStockId.get(stockId) : undefined;
    return {
      r5: returnOverDays(bars, 5),
      r10: returnOverDays(bars, 10),
      r20: returnOverDays(bars, 20),
    };
  }

  function avg(values: (number | null)[]): number | null {
    const valid = values.filter((v): v is number => v !== null);
    if (valid.length === 0) return null;
    return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100) / 100;
  }

  const cells: ThemeHeatmapCell[] = [];
  for (const [category, themes] of Object.entries(config.industry_concepts)) {
    for (const theme of themes) {
      const perMember = theme.members.map((t) => tickerReturns(t));
      cells.push({
        themeName: theme.theme_name,
        category,
        return5d: avg(perMember.map((m) => m.r5)),
        return10d: avg(perMember.map((m) => m.r10)),
        return20d: avg(perMember.map((m) => m.r20)),
        sampleSize: perMember.filter((m) => m.r20 !== null).length,
        chainStages: theme.chainStages ?? [],
      });
    }
  }

  return cells;
}
