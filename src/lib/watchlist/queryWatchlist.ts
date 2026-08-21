import { prisma } from "@/lib/prisma";
import type { Market } from "@/generated/prisma/enums";

export interface WatchlistDisplayItem {
  stockId: number;
  market: Market;
  ticker: string;
  companyName: string;
  note: string | null;
  addedAt: Date;
  latestClose: number | null;
  latestTradeDate: Date | null;
}

/** 一次查完watchlist清單裡每檔股票「最新一天」的收盤價，避免N+1（對每檔股票各查一次） */
export async function queryWatchlistForUser(userId: number): Promise<WatchlistDisplayItem[]> {
  const items = await prisma.userWatchlistItem.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { stock: true },
  });
  if (items.length === 0) return [];

  const stockIds = items.map((item) => item.stockId);
  const recentSignals = await prisma.dailyTrendSignal.findMany({
    where: { stockId: { in: stockIds } },
    orderBy: { tradeDate: "desc" },
    select: { stockId: true, tradeDate: true, closePrice: true },
  });

  const latestByStockId = new Map<number, { tradeDate: Date; closePrice: number }>();
  for (const signal of recentSignals) {
    if (!latestByStockId.has(signal.stockId)) {
      latestByStockId.set(signal.stockId, { tradeDate: signal.tradeDate, closePrice: Number(signal.closePrice) });
    }
  }

  return items.map((item) => {
    const latest = latestByStockId.get(item.stockId);
    return {
      stockId: item.stockId,
      market: item.stock.market,
      ticker: item.stock.ticker,
      companyName: item.stock.companyName,
      note: item.note,
      addedAt: item.createdAt,
      latestClose: latest?.closePrice ?? null,
      latestTradeDate: latest?.tradeDate ?? null,
    };
  });
}

/** 個股頁的加入觀察按鈕：只需要知道「這檔股票在不在使用者的清單裡」，不用查整份清單 */
export async function isStockInWatchlist(userId: number, stockId: number): Promise<boolean> {
  const item = await prisma.userWatchlistItem.findUnique({
    where: { userId_stockId: { userId, stockId } },
    select: { id: true },
  });
  return item !== null;
}
