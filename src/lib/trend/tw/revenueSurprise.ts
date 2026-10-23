import { prisma } from "@/lib/prisma";
import { computeRevenueMomentum, revenueAvailableFrom } from "./revenueMomentum";

/**
 * 2026-10-14：基本面頁「營收驚喜榜」——最新一個月營收比預期好/差最多的公司，以及公布期間股價
 * 怎麼反應。預期營收＝去年同月×公布前3個月的年增倍數（見revenueMomentum.ts的surprisePct）。
 *
 * 刻意不做成「市場沒反應→之後會補漲」的推薦清單：scripts/backtest-revenue-surprise.ts驗證過，
 * 大幅驚喜本身之後40日有溫和的正超額報酬，但「沒反應的會補漲」不成立（已經反應的反而表現
 * 更好，比較像動能延續）。這裡只呈現事實，UI說明會講清楚回測結論。
 */

/** 只算營收至少這麼大（千元）的公司，避免營收極小的公司隨便波動就上榜 */
const MIN_REVENUE_THOUSANDS = 100_000;
const LIST_SIZE = 15;

export interface RevenueSurpriseRow {
  ticker: string;
  companyName: string;
  month: string;
  revenue: number;
  expectedRevenue: number;
  surprisePct: number;
  yoyPct: number | null;
  allTimeHigh: boolean;
  /** 公布窗口（次月1日起）到目前/窗口結束的股價漲跌%，扣掉同期加權指數；資料不足是null */
  reactionExcessPct: number | null;
}

export interface RevenueSurpriseBoard {
  /** 這次比較的營收月份，YYYY-MM；資料庫還沒有任何營收時是null */
  month: string | null;
  /** 這個月已經公布營收、而且算得出驚喜的公司數 */
  reportedCount: number;
  beats: RevenueSurpriseRow[];
  misses: RevenueSurpriseRow[];
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function computeRevenueSurpriseBoard(): Promise<RevenueSurpriseBoard> {
  const latest = await prisma.twMonthlyRevenue.aggregate({ _max: { revenueMonth: true } });
  const latestMonth = latest._max.revenueMonth;
  if (!latestMonth) return { month: null, reportedCount: 0, beats: [], misses: [] };

  // 算預期營收最早要用到16個月前（去年同月的前3個月），多抓一點緩衝
  const from = new Date(latestMonth);
  from.setUTCMonth(from.getUTCMonth() - 27);
  const [stocks, revenueRows] = await Promise.all([
    prisma.stock.findMany({
      where: { market: "TW", isActive: true, ticker: { not: "TAIEX" }, NOT: { industry: { contains: "ETF" } } },
      select: { id: true, ticker: true, companyName: true },
    }),
    prisma.twMonthlyRevenue.findMany({
      where: { revenueMonth: { gte: from } },
      orderBy: [{ stockId: "asc" }, { revenueMonth: "asc" }],
      select: { stockId: true, revenueMonth: true, revenue: true },
    }),
  ]);
  const stockById = new Map(stocks.map((s) => [s.id, s]));
  const seriesByStock = new Map<number, { month: string; revenue: number }[]>();
  for (const r of revenueRows) {
    if (!stockById.has(r.stockId)) continue;
    const list = seriesByStock.get(r.stockId) ?? [];
    list.push({ month: toDateString(r.revenueMonth), revenue: Number(r.revenue) });
    seriesByStock.set(r.stockId, list);
  }

  const month = toDateString(latestMonth);
  const candidates: (Omit<RevenueSurpriseRow, "reactionExcessPct"> & { stockId: number })[] = [];
  for (const [stockId, series] of seriesByStock) {
    const m = computeRevenueMomentum(series).at(-1);
    if (!m || m.month !== month || m.surprisePct === null || m.expectedRevenue === null) continue;
    if (m.revenue < MIN_REVENUE_THOUSANDS) continue;
    const stock = stockById.get(stockId)!;
    candidates.push({
      stockId,
      ticker: stock.ticker,
      companyName: stock.companyName,
      month: month.slice(0, 7),
      revenue: m.revenue,
      expectedRevenue: Math.round(m.expectedRevenue),
      surprisePct: m.surprisePct,
      yoyPct: m.yoyPct,
      allTimeHigh: m.allTimeHigh,
    });
  }

  const sorted = [...candidates].sort((a, b) => b.surprisePct - a.surprisePct);
  const beats = sorted.slice(0, LIST_SIZE).filter((c) => c.surprisePct > 0);
  const misses = sorted.slice(-LIST_SIZE).reverse().filter((c) => c.surprisePct < 0);

  // 公布期間的股價反應（跟backtest-revenue-surprise.ts同一個窗口）：次月1日起第一個交易日開盤 →
  // 公布期限（次月11日）起第一個交易日收盤；窗口還沒走完就算到最新一個交易日
  const windowStart = new Date(latestMonth);
  windowStart.setUTCMonth(windowStart.getUTCMonth() + 1);
  const windowEnd = revenueAvailableFrom(month);
  const windowEndBuffer = new Date(windowEnd);
  windowEndBuffer.setUTCDate(windowEndBuffer.getUTCDate() + 7);
  const listed = [...beats, ...misses];
  const taiex = await prisma.stock.findUnique({ where: { market_ticker: { market: "TW", ticker: "TAIEX" } }, select: { id: true } });
  const priceRows = await prisma.twDailyPrice.findMany({
    where: {
      stockId: { in: [...listed.map((c) => c.stockId), ...(taiex ? [taiex.id] : [])] },
      tradeDate: { gte: windowStart, lte: windowEndBuffer },
    },
    orderBy: [{ stockId: "asc" }, { tradeDate: "asc" }],
    select: { stockId: true, tradeDate: true, open: true, close: true },
  });
  const windowMove = new Map<number, { open: number; close: number; closed: boolean }>();
  for (const p of priceRows) {
    const cur = windowMove.get(p.stockId);
    if (cur?.closed) continue;
    windowMove.set(p.stockId, { open: cur?.open ?? Number(p.open), close: Number(p.close), closed: toDateString(p.tradeDate) >= windowEnd });
  }
  const movePct = (stockId: number) => {
    const x = windowMove.get(stockId);
    return x && x.open > 0 ? ((x.close - x.open) / x.open) * 100 : null;
  };
  const taiexMove = taiex ? movePct(taiex.id) : null;
  const toRow = (c: (typeof candidates)[number]): RevenueSurpriseRow => {
    const move = movePct(c.stockId);
    return {
      ticker: c.ticker,
      companyName: c.companyName,
      month: c.month,
      revenue: c.revenue,
      expectedRevenue: c.expectedRevenue,
      surprisePct: c.surprisePct,
      yoyPct: c.yoyPct,
      allTimeHigh: c.allTimeHigh,
      reactionExcessPct: move !== null && taiexMove !== null ? Math.round((move - taiexMove) * 100) / 100 : null,
    };
  };

  return {
    month: month.slice(0, 7),
    reportedCount: candidates.length,
    beats: beats.map(toRow),
    misses: misses.map(toRow),
  };
}
