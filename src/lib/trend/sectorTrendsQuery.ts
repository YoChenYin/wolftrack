import { prisma } from "@/lib/prisma";
import type { TrendStatus, Market } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { findIndustryThemeByName, getAllThemedTickers, UNCATEGORIZED_THEME_CODE } from "@/lib/valuation/groupConfig";

/**
 * 三段式戰術面板顯示的狀態。刻意用明確列舉（不是 Exclude<TrendStatus, "limitMove"> 這種衍生型別）——
 * limitMove 是特殊狀態不算戰術分類，chipLeading（2026-07-09新增）是獨立的第四類「觀察名單」，
 * 用自己的排序邏輯（依 chipScore 而非 coreScore）和 UI 區塊呈現，不跟主要三欄混在一起，
 * 避免改 Prisma enum 時型別自動膨脹、影響到已經假設「只有三種」的 COLUMN_META 等地方。
 */
export type TacticalStatus = "reversal" | "pullback" | "bullish";

export const TREND_STATUSES: TacticalStatus[] = ["reversal", "pullback", "bullish"];
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;
/** 籌碼領先是觀察名單性質，給比主要三欄更寬的預設筆數 */
export const CHIP_LEADING_LIMIT = 20;

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
  /** 2026-07-11：最新一期月營收年增率(%)，TW限定，沒有資料是 null（見 monthlyRevenueClient.ts） */
  revenueYoyGrowthPct: number | null;
  /** 該筆月營收所屬月份，YYYY-MM，方便顯示「這是幾月的資料」 */
  revenueMonth: string | null;
}

export interface SectorTrendsGrouped {
  asOfDate: string | null;
  market: Market;
  sector: string;
  theme: string;
  groups: Record<TacticalStatus, SectorTrendItem[]>;
  /** 籌碼領先觀察名單（TW限定，見 calculateTwDailySignal.ts 的 isChipLeadingCandidate），依 chipScore 排序 */
  chipLeading: SectorTrendItem[];
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
    monthlyRevenues: { revenueMonth: Date; yoyGrowthPct: Prisma.Decimal | null }[];
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
  const latestRevenue = row.stock.monthlyRevenues[0];

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
    revenueYoyGrowthPct: latestRevenue?.yoyGrowthPct !== undefined && latestRevenue?.yoyGrowthPct !== null ? Number(latestRevenue.yoyGrowthPct) : null,
    revenueMonth: latestRevenue ? latestRevenue.revenueMonth.toISOString().slice(0, 7) : null,
  };
}

export function clampLimit(raw: number | string | null | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

/**
 * TW 版首頁「板塊」篩選 2026-07-09 改用 group_config.json 的 theme_name（比 TWSE 官方產業別更貼近
 * 使用者實際想篩的供應鏈/概念族群），sectorCode 參數這時候傳的其實是 theme_name（或特殊值
 * UNCATEGORIZED_THEME_CODE）。US 版沒有 group_config theme，維持原本用 sector_mapping 篩選。
 */
async function buildStockFilter(
  market: Market,
  sectorCode: string | null,
  themeCode: string | null
): Promise<Prisma.DailyTrendSignalWhereInput> {
  // isActive: true 排除掉軟移除的股票（例如 2026-07-09 收斂成科技+金融股後排除的傳統產業）——
  // 只有批次計算（runTwDailyBatch/runUsDailyBatch）會跳過非 active 股票，但這裡如果不篩，
  // 舊的、剛好還沒過期的 daily_trend_signal 歷史紀錄還是會被撈出來顯示，等於軟移除沒生效。
  const stockWhere: Prisma.StockWhereInput = { market, isActive: true };

  if (sectorCode && market === "TW") {
    if (sectorCode === UNCATEGORIZED_THEME_CODE) {
      const themed = getAllThemedTickers();
      stockWhere.ticker = { notIn: [...themed] };
    } else {
      const theme = findIndustryThemeByName(sectorCode);
      stockWhere.ticker = { in: theme?.members ?? [] };
    }
  } else if (sectorCode) {
    stockWhere.sector = { sectorCode };
  }

  if (themeCode) stockWhere.themes = { some: { theme: { themeCode } } };
  return { stock: stockWhere };
}

const SIGNAL_INCLUDE = {
  stock: {
    include: {
      sector: true,
      themes: { include: { theme: true } },
      monthlyRevenues: { orderBy: { revenueMonth: "desc" }, take: 1 },
    },
  },
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
 * TWSE 逐檔查詢天生就會有日期落差（同一批次裡不同股票「最新可查到的交易日」可能差 1-2 天，
 * 已經在 progress-status.md 記錄過好幾次），股票池擴到 300+ 檔後，只要有 1 檔股票日期比其他
 * 股票新，用「嚴格等於全域最新日期」篩選會讓其餘幾百檔全部消失（親眼在 production 看到：
 * 320 檔裡只有 1 檔日期對得上，整個面板幾乎全空）。改成「每檔股票自己最新一筆訊號」，
 * 只要求在 RECENCY_WINDOW_DAYS 天內（排除真的斷更很久、資料可能有問題的股票），
 * 不要求跟其他股票完全同一天。
 */
const RECENCY_WINDOW_DAYS = 7;

async function fetchLatestSignalPerStock(
  stockFilter: Prisma.DailyTrendSignalWhereInput,
  globalMaxDate: Date
): Promise<SignalRow[]> {
  const cutoff = new Date(globalMaxDate.getTime() - RECENCY_WINDOW_DAYS * 86_400_000);
  return prisma.dailyTrendSignal.findMany({
    where: { ...stockFilter, tradeDate: { gte: cutoff } },
    orderBy: [{ stockId: "asc" }, { tradeDate: "desc" }],
    distinct: ["stockId"],
    include: SIGNAL_INCLUDE,
  });
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

  const stockFilter = await buildStockFilter(market, sectorCode, themeCode);
  const asOfDate = await latestTradeDate(market, stockFilter);

  if (!asOfDate) {
    return {
      asOfDate: null,
      market,
      sector: sectorCode ?? "all",
      theme: themeCode ?? "all",
      groups: { reversal: [], pullback: [], bullish: [] },
      chipLeading: [],
    };
  }

  const latestPerStock = await fetchLatestSignalPerStock(stockFilter, asOfDate);
  const groups: Record<TacticalStatus, SignalRow[]> = { reversal: [], pullback: [], bullish: [] };
  const chipLeadingRows: SignalRow[] = [];
  for (const row of latestPerStock) {
    if (row.status === "reversal" || row.status === "pullback" || row.status === "bullish") {
      groups[row.status].push(row);
    } else if (row.status === "chipLeading") {
      chipLeadingRows.push(row);
    }
  }
  for (const status of TREND_STATUSES) {
    groups[status].sort((a, b) => Number(b.coreScore) - Number(a.coreScore));
    groups[status] = groups[status].slice(0, limit);
  }
  chipLeadingRows.sort((a, b) => Number(b.chipScore) - Number(a.chipScore));

  return {
    asOfDate: asOfDate.toISOString().slice(0, 10),
    market,
    sector: sectorCode ?? "all",
    theme: themeCode ?? "all",
    groups: {
      reversal: groups.reversal.map(toItem),
      pullback: groups.pullback.map(toItem),
      bullish: groups.bullish.map(toItem),
    },
    chipLeading: chipLeadingRows.slice(0, CHIP_LEADING_LIMIT).map(toItem),
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

  const stockFilter = await buildStockFilter(market, sectorCode, themeCode);
  const asOfDate = await latestTradeDate(market, stockFilter);
  if (!asOfDate) {
    return { asOfDate: null, market, sector: sectorCode ?? "all", theme: themeCode ?? "all", mode: options.mode, items: [] };
  }

  const latestPerStock = await fetchLatestSignalPerStock(stockFilter, asOfDate);
  const rows = latestPerStock
    .filter((row) => row.status === options.mode)
    .sort((a, b) => Number(b.coreScore) - Number(a.coreScore))
    .slice(0, limit);

  return {
    asOfDate: asOfDate.toISOString().slice(0, 10),
    market,
    sector: sectorCode ?? "all",
    theme: themeCode ?? "all",
    mode: options.mode,
    items: rows.map(toItem),
  };
}
