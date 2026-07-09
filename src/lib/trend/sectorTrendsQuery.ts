import { prisma } from "@/lib/prisma";
import type { TrendStatus, Market } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

/** 三段式戰術面板顯示的狀態，不含 limitMove（漲跌停是特殊狀態，不算戰術分類的一種，不佔欄位） */
export type TacticalStatus = Exclude<TrendStatus, "limitMove">;

export const TREND_STATUSES: TacticalStatus[] = ["reversal", "pullback", "bullish"];
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;

export interface SectorTrendItem {
  ticker: string;
  companyName: string;
  sector: { code: string; name: string; nameZh: string | null };
  themes: { code: string; nameZh: string | null }[];
  status: TrendStatus;
  coreScore: number;
  /** TW 版才有值：技術面/籌碼面拆分分數 */
  technicalScore: number | null;
  chipScore: number | null;
  /** TW 版才有值：技術面 vs 籌碼面交叉驗證徽章 */
  chipBadge: "confirmed" | "divergence" | null;
  /** 反轉點：最近一次 MA20/50 交叉日期 */
  signalDate: string | null;
  /** 反轉點距今天數（日曆天） */
  daysSinceSignal: number | null;
  priceAtSignal: number | null;
  priceNow: number;
  /** 訊號後漲跌幅 = (priceNow - priceAtSignal) / priceAtSignal * 100 */
  changePctSinceSignal: number | null;
}

export interface SectorTrendsGrouped {
  asOfDate: string | null;
  market: Market;
  sector: string;
  theme: string;
  groups: Record<TacticalStatus, SectorTrendItem[]>;
}

type SignalRow = {
  coreScore: unknown;
  technicalScore: unknown;
  chipScore: unknown;
  chipBadge: "confirmed" | "divergence" | null;
  status: TrendStatus;
  reversalPointDate: Date | null;
  priceAtSignal: unknown;
  closePrice: unknown;
  tradeDate: Date;
  stock: {
    ticker: string;
    companyName: string;
    sector: { sectorCode: string; sectorName: string; sectorNameZh: string | null };
    themes: { theme: { themeCode: string; themeNameZh: string | null } }[];
  };
};

function toItem(row: SignalRow): SectorTrendItem {
  const coreScore = Number(row.coreScore);
  const priceAtSignal = row.priceAtSignal !== null ? Number(row.priceAtSignal) : null;
  const priceNow = Number(row.closePrice);
  const changePctSinceSignal =
    priceAtSignal !== null && priceAtSignal !== 0 ? ((priceNow - priceAtSignal) / priceAtSignal) * 100 : null;
  const daysSinceSignal = row.reversalPointDate
    ? Math.round((row.tradeDate.getTime() - row.reversalPointDate.getTime()) / 86_400_000)
    : null;

  return {
    ticker: row.stock.ticker,
    companyName: row.stock.companyName,
    sector: {
      code: row.stock.sector.sectorCode,
      name: row.stock.sector.sectorName,
      nameZh: row.stock.sector.sectorNameZh,
    },
    themes: row.stock.themes.map((t) => ({ code: t.theme.themeCode, nameZh: t.theme.themeNameZh })),
    status: row.status,
    coreScore,
    technicalScore: row.technicalScore !== null ? Number(row.technicalScore) : null,
    chipScore: row.chipScore !== null ? Number(row.chipScore) : null,
    chipBadge: row.chipBadge,
    signalDate: row.reversalPointDate ? row.reversalPointDate.toISOString().slice(0, 10) : null,
    daysSinceSignal,
    priceAtSignal,
    priceNow,
    changePctSinceSignal,
  };
}

export function clampLimit(raw: number | string | null | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function buildStockFilter(
  market: Market,
  sectorCode: string | null,
  themeCode: string | null
): Prisma.DailyTrendSignalWhereInput {
  // isActive: true 排除掉軟移除的股票（例如 2026-07-09 收斂成科技+金融股後排除的傳統產業）——
  // 只有批次計算（runTwDailyBatch/runUsDailyBatch）會跳過非 active 股票，但這裡如果不篩，
  // 舊的、剛好還沒過期的 daily_trend_signal 歷史紀錄還是會被撈出來顯示，等於軟移除沒生效。
  const stockWhere: Prisma.StockWhereInput = { market, isActive: true };
  if (sectorCode) stockWhere.sector = { sectorCode };
  if (themeCode) stockWhere.themes = { some: { theme: { themeCode } } };
  return { stock: stockWhere };
}

const SIGNAL_INCLUDE = {
  stock: { include: { sector: true, themes: { include: { theme: true } } } },
} satisfies Prisma.DailyTrendSignalInclude;

/** 該 market 底下「最新一個有資料的交易日」，US/TW 各自獨立（美股 ET 收盤、台股 09:00-13:30，資料日期不會同步） */
async function latestTradeDate(market: Market, stockFilter: Prisma.DailyTrendSignalWhereInput): Promise<Date | null> {
  const latest = await prisma.dailyTrendSignal.aggregate({
    where: stockFilter,
    _max: { tradeDate: true },
  });
  return latest._max.tradeDate;
}

/**
 * 依市場/板塊/題材/狀態撈「最新一個有資料的交易日」排行榜。
 * 給 API route（/api/sector-trends）和首頁 Server Component 首次渲染共用，避免邏輯重複。
 */
export async function fetchSectorTrendsGrouped(options: {
  market: Market;
  sectorCode?: string | null;
  themeCode?: string | null;
  limit?: number;
}): Promise<SectorTrendsGrouped> {
  const { market } = options;
  const sectorCode = options.sectorCode && options.sectorCode !== "all" ? options.sectorCode : null;
  const themeCode = options.themeCode && options.themeCode !== "all" ? options.themeCode : null;
  const limit = clampLimit(options.limit);

  const stockFilter = buildStockFilter(market, sectorCode, themeCode);
  const asOfDate = await latestTradeDate(market, stockFilter);

  if (!asOfDate) {
    return {
      asOfDate: null,
      market,
      sector: sectorCode ?? "all",
      theme: themeCode ?? "all",
      groups: { reversal: [], pullback: [], bullish: [] },
    };
  }

  const [reversal, pullback, bullish] = await Promise.all(
    TREND_STATUSES.map((status) =>
      prisma.dailyTrendSignal.findMany({
        where: { tradeDate: asOfDate, status, ...stockFilter },
        orderBy: { coreScore: "desc" },
        take: limit,
        include: SIGNAL_INCLUDE,
      })
    )
  );

  return {
    asOfDate: asOfDate.toISOString().slice(0, 10),
    market,
    sector: sectorCode ?? "all",
    theme: themeCode ?? "all",
    groups: {
      reversal: reversal.map(toItem),
      pullback: pullback.map(toItem),
      bullish: bullish.map(toItem),
    },
  };
}

export async function fetchSectorTrendsForMode(options: {
  market: Market;
  sectorCode?: string | null;
  themeCode?: string | null;
  mode: TacticalStatus;
  limit?: number;
}): Promise<{
  asOfDate: string | null;
  market: Market;
  sector: string;
  theme: string;
  mode: TacticalStatus;
  items: SectorTrendItem[];
}> {
  const { market } = options;
  const sectorCode = options.sectorCode && options.sectorCode !== "all" ? options.sectorCode : null;
  const themeCode = options.themeCode && options.themeCode !== "all" ? options.themeCode : null;
  const limit = clampLimit(options.limit);

  const stockFilter = buildStockFilter(market, sectorCode, themeCode);
  const asOfDate = await latestTradeDate(market, stockFilter);
  if (!asOfDate) {
    return { asOfDate: null, market, sector: sectorCode ?? "all", theme: themeCode ?? "all", mode: options.mode, items: [] };
  }

  const rows = await prisma.dailyTrendSignal.findMany({
    where: { tradeDate: asOfDate, status: options.mode, ...stockFilter },
    orderBy: { coreScore: "desc" },
    take: limit,
    include: SIGNAL_INCLUDE,
  });

  return {
    asOfDate: asOfDate.toISOString().slice(0, 10),
    market,
    sector: sectorCode ?? "all",
    theme: themeCode ?? "all",
    mode: options.mode,
    items: rows.map(toItem),
  };
}
