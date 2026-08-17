import { prisma } from "@/lib/prisma";
import type { TrendStatus, Market } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { findIndustryThemeByName, getAllThemedTickers, UNCATEGORIZED_THEME_CODE } from "@/lib/valuation/groupConfig";
import { bollingerBands, sma } from "@/lib/trend/indicators";

/**
 * 戰術面板顯示的狀態。刻意用明確列舉（不是 Exclude<TrendStatus, "limitMove"> 這種衍生型別）——
 * limitMove 是特殊狀態不算戰術分類，chipLeading/entry/exit 是舊版台股邏輯留下的歷史狀態，
 * 改版後不再產生新資料。
 *
 * 2026-08-17：美股維持三段式（reversal/pullback/bullish），台股改成多空五段式
 * （trustTurnBuy/combinedBuy/buyDip 多方，trustTurnSell/combinedSell 空方，見
 * src/lib/trend/types.ts 的 TrendStatus 說明）。UI（SectorTrendsBoard.tsx）用多方/空方
 * tab切換要顯示哪幾欄，這裡的型別跟 tacticalStatusesForMarket() 只負責「這個market
 * 合法的狀態有哪些」，不管tab怎麼分組。
 */
export type TacticalStatus =
  | "reversal"
  | "pullback"
  | "bullish"
  | "trustTurnBuy"
  | "combinedBuy"
  | "buyDip"
  | "trustTurnSell"
  | "combinedSell";

const US_TACTICAL_STATUSES: TacticalStatus[] = ["reversal", "pullback", "bullish"];
const TW_TACTICAL_STATUSES: TacticalStatus[] = ["trustTurnBuy", "combinedBuy", "buyDip", "trustTurnSell", "combinedSell"];
/** 兩個市場實際用的詞彙不同（見上方TacticalStatus說明），依market選對應那一組 */
export function tacticalStatusesForMarket(market: Market): TacticalStatus[] {
  return market === "TW" ? TW_TACTICAL_STATUSES : US_TACTICAL_STATUSES;
}

/** 2026-08-19：從10調到30——改成表格版之後單頁能舒服顯示更多列，且實測單一分類（如投信轉買）
 * 常態就有30+檔符合條件，原本的10很容易讓使用者誤以為「符合條件的股票變少了」，其實只是被
 * 這個上限擋掉沒顯示 */
export const DEFAULT_LIMIT = 30;
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
  /** 為什麼今天還被分類進這個狀態，用當下實際數值描述，TW限定，見 classifyChipFlow.ts */
  triggerReason: string | null;
  /** 反轉點距今天數（日曆天） */
  daysSinceSignal: number | null;
  priceAtSignal: number | null;
  priceNow: number;
  /** 訊號後漲跌幅 = (priceNow - priceAtSignal) / priceAtSignal * 100 */
  changePctSinceSignal: number | null;
  /** 當天(最新交易日)漲跌幅 = (今天收盤 - 前一天收盤) / 前一天收盤 * 100，只有1筆歷史資料時是null */
  todayChangePct: number | null;
  /** 訊號後波動率：從訊號日(reversalPointDate)到今天，每日漲跌幅的標準差(%)。
   * 沒有reversalPointDate就用能查到的全部歷史，資料不足3天時是null */
  volatilitySinceSignal: number | null;
  /** 2026-07-11：最新一期月營收年增率(%)，TW限定，沒有資料是 null（見 monthlyRevenueClient.ts） */
  revenueYoyGrowthPct: number | null;
  /** 該筆月營收所屬月份，YYYY-MM，方便顯示「這是幾月的資料」 */
  revenueMonth: string | null;
  /** 近20個交易日收盤價，給表格內的迷你走勢圖用；沿用computeVolatilityStats已經抓好的90日歷史，不多打一次查詢 */
  sparkline: number[] | null;
  /** 布林通道位置判斷：high=貼近上軌(%b≥0.8)、low=貼近下軌(%b≤0.2)、squeeze=帶寬<20日均帶寬的一半(即將起漲/起跌但方向未定)、normal=通道中段。資料不足20+20根K棒時是null。 */
  bollingerStatus: "high" | "low" | "squeeze" | "normal" | null;
  /** 布林狀態的實際數值，UI hover顯示用，例如 "%b=0.92，帶寬2.1%（20日均3.4%）" */
  bollingerDetail: string | null;
  /** 當天(最新交易日)漲跌金額 = 今天收盤 - 前一天收盤，TW表格版要顯示金額不只是% */
  todayChangeAmount: number | null;
  /** MA5>MA10>MA20 是否成立（多頭排列），資料不足時是null，TW表格版用 */
  maAligned: boolean | null;
  /** 2026-08-18新增：當天外資+投信合計買賣超金額，單位百萬元（張數×1000股/張×收盤價÷1,000,000）。
   * 沒有當天籌碼資料時是null，跟chipConcentration5/10/20一樣是TW限定的表格欄位 */
  netBuySellAmountMillions: number | null;
  /** 當天外資+投信合計買賣超張數（原始單位，netBuySellAmountMillions是換算成金額後的版本），
   * 新鮮度門檻跟netBuySellAmountMillions一致 */
  netBuySellLots: number | null;
  /** 2026-08-19新增：投信單獨（不含外資）的當日買賣超張數——投信轉買/轉賣是純投信訊號，
   * 原本的買賣超張數/百萬是外資+投信合計，容易誤會成「外資投信一起在買」，這裡拆出投信
   * 自己的數字，跟netBuySellLots新鮮度門檻一致 */
  trustNetBuyLots: number | null;
  /** 目前這個狀態連續成立幾個「交易日」（不是daysSinceSignal的日曆天，會被週末灌水）——
   * 例如「投信外資合買」連續3個交易日，這裡就是3。單日型訊號（轉買/轉賣定義上只會成立1天）
   * 這欄通常是1。用signalPointDate對照series裡的交易日直接數，跟classifyChipFlow.ts
   * 內部算「第幾天」用的是同一個概念，只是這裡在查詢層重算一次给表格用，不用改觸發文字的格式 */
  signalStreakTradingDays: number | null;
  /** 最新一筆籌碼集中度(5/10/20日，投信+外資買超佔量能比例)，直接來自daily_trend_signals
   * 既有欄位（每天批次都會算），不用額外查詢 */
  chipConcentration5: number | null;
  chipConcentration10: number | null;
  chipConcentration20: number | null;
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
  stockId: number;
  coreScore: unknown;
  technicalScore: unknown;
  chipScore: unknown;
  chipBadge: "confirmed" | "divergence" | null;
  status: TrendStatus;
  reversalPointDate: Date | null;
  priceAtSignal: unknown;
  triggerReason: string | null;
  closePrice: unknown;
  tradeDate: Date;
  /** TW限定，已經是daily_trend_signals的既有欄位（每天批次都會算），美股版永遠是null */
  chipConcentration5: unknown;
  chipConcentration10: unknown;
  chipConcentration20: unknown;
  stock: {
    ticker: string;
    companyName: string;
    sector: { sectorCode: string; sectorName: string; sectorNameZh: string | null };
    themes: { theme: { themeCode: string; themeNameZh: string | null } }[];
    monthlyRevenues: { revenueMonth: Date; yoyGrowthPct: Prisma.Decimal | null }[];
  };
};

const SPARKLINE_POINTS = 20;

interface VolatilityStats {
  todayChangePct: number | null;
  todayChangeAmount: number | null;
  volatilitySinceSignal: number | null;
  sparkline: number[] | null;
  bollingerStatus: "high" | "low" | "squeeze" | "normal" | null;
  bollingerDetail: string | null;
  maAligned: boolean | null;
  netBuySellAmountMillions: number | null;
  netBuySellLots: number | null;
  trustNetBuyLots: number | null;
  signalStreakTradingDays: number | null;
}

/** 20期布林通道 + 20日均帶寬（判斷squeeze用），沿用 scoreL6Technical.ts 的 %b/帶寬門檻邏輯，
 * 差別是這裡只需要單一分類結果給列表用，不用回傳完整分數。 */
function classifyBollinger(closes: number[]): { status: VolatilityStats["bollingerStatus"]; detail: string | null } {
  if (closes.length < 40) return { status: null, detail: null };
  const bb = bollingerBands(closes);
  const last = closes.length - 1;
  const percentB = bb.percentB[last];
  const bandwidth = bb.bandwidth[last];
  if (percentB === null || bandwidth === null) return { status: null, detail: null };

  const recentBandwidths = bb.bandwidth.slice(last - 19, last + 1).filter((b): b is number => b !== null);
  const bandwidthAvg20 = recentBandwidths.length > 0 ? recentBandwidths.reduce((a, b) => a + b, 0) / recentBandwidths.length : null;
  const squeeze = bandwidthAvg20 !== null && bandwidth < bandwidthAvg20 * 0.5;

  const detail = `%b=${percentB.toFixed(2)}，帶寬${(bandwidth * 100).toFixed(1)}%${bandwidthAvg20 !== null ? `（20日均${(bandwidthAvg20 * 100).toFixed(1)}%）` : ""}`;

  const status: VolatilityStats["bollingerStatus"] = squeeze
    ? "squeeze"
    : percentB >= 0.8
      ? "high"
      : percentB <= 0.2
        ? "low"
        : "normal";
  return { status, detail };
}

function toItem(row: SignalRow, stats?: VolatilityStats): SectorTrendItem {
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
    triggerReason: row.triggerReason,
    daysSinceSignal,
    priceAtSignal,
    priceNow,
    changePctSinceSignal,
    todayChangePct: stats?.todayChangePct ?? null,
    volatilitySinceSignal: stats?.volatilitySinceSignal ?? null,
    bollingerStatus: stats?.bollingerStatus ?? null,
    bollingerDetail: stats?.bollingerDetail ?? null,
    todayChangeAmount: stats?.todayChangeAmount ?? null,
    maAligned: stats?.maAligned ?? null,
    netBuySellAmountMillions: stats?.netBuySellAmountMillions ?? null,
    netBuySellLots: stats?.netBuySellLots ?? null,
    trustNetBuyLots: stats?.trustNetBuyLots ?? null,
    signalStreakTradingDays: stats?.signalStreakTradingDays ?? null,
    chipConcentration5: row.chipConcentration5 !== null && row.chipConcentration5 !== undefined ? Number(row.chipConcentration5) : null,
    chipConcentration10: row.chipConcentration10 !== null && row.chipConcentration10 !== undefined ? Number(row.chipConcentration10) : null,
    chipConcentration20: row.chipConcentration20 !== null && row.chipConcentration20 !== undefined ? Number(row.chipConcentration20) : null,
    revenueYoyGrowthPct: latestRevenue?.yoyGrowthPct !== undefined && latestRevenue?.yoyGrowthPct !== null ? Number(latestRevenue.yoyGrowthPct) : null,
    revenueMonth: latestRevenue ? latestRevenue.revenueMonth.toISOString().slice(0, 7) : null,
    sparkline: stats?.sparkline ?? null,
  };
}

/** 抓寬鬆一點的歷史窗口，涵蓋大多數reversalPointDate的情況（沒有訊號日的就用能查到的全部） */
const VOLATILITY_LOOKBACK_DAYS = 90;

/** 買賣超金額只需要最新一天的三大法人資料，跟找「昨天」的turn訊號用同一套新鮮度概念——
 * 太舊的資料就不顯示金額，不要拿舊資料湊數字誤導使用者（見classifyChipFlow.ts的
 * MAX_INSTITUTIONAL_DATA_GAP_DAYS說明，這裡沿用同樣的5天門檻但獨立宣告避免跨模組耦合） */
const MAX_INSTITUTIONAL_DATA_GAP_DAYS = 5;

/**
 * 批次算「當天漲跌幅/金額」+「訊號後波動率」+「布林通道位置」+「MA5>10>20排列」+
 * 「當天外資投信合計買賣超金額」，只對最終要顯示的那一小批(已經slice過limit)股票查詢，
 * 不對整個板塊全部股票算——這幾個指標都需要額外抓每檔股票的歷史序列，對還沒篩選過的
 * 全板塊（可能300+檔）逐一算會是不必要的查詢量。
 *
 * ⚠️2026-08-16修正：原本這裡查 daily_trend_signals 當「歷史收盤序列」，但那張表只有「當天status
 * 不是none」才會寫一筆（見 runTwDailyBatch.ts），是稀疏的訊號事件記錄，不是連續交易日序列——
 * 例如2330最近查到的紀錄是7/8跳到8/4，中間缺了快一個月的交易日。拿這個當波動率/迷你走勢圖/
 * 布林通道的資料源，等於用有缺口的資料算「逐日報酬率」，缺口那幾天會被誤算成單日暴漲暴跌。
 * 改查 tw_daily_price，那張表才是每個交易日都會有一筆的連續OHLCV歷史。
 */
async function computeVolatilityStats(rows: SignalRow[]): Promise<Map<number, VolatilityStats>> {
  if (rows.length === 0) return new Map();

  const stockIds = [...new Set(rows.map((r) => r.stockId))];
  const cutoff = new Date(Date.now() - VOLATILITY_LOOKBACK_DAYS * 86_400_000);
  const [history, institutionalHistory] = await Promise.all([
    prisma.twDailyPrice.findMany({
      where: { stockId: { in: stockIds }, tradeDate: { gte: cutoff } },
      orderBy: [{ stockId: "asc" }, { tradeDate: "asc" }],
      select: { stockId: true, tradeDate: true, close: true },
    }),
    prisma.twInstitutionalTrading.findMany({
      where: { stockId: { in: stockIds }, tradeDate: { gte: cutoff } },
      orderBy: [{ stockId: "asc" }, { tradeDate: "desc" }],
      distinct: ["stockId"],
      select: { stockId: true, tradeDate: true, foreignNetBuyShares: true, investTrustNetBuyShares: true },
    }),
  ]);

  const seriesByStock = new Map<number, { tradeDate: Date; close: number }[]>();
  for (const h of history) {
    const list = seriesByStock.get(h.stockId) ?? [];
    list.push({ tradeDate: h.tradeDate, close: Number(h.close) });
    seriesByStock.set(h.stockId, list);
  }
  const latestInstitutionalByStock = new Map(institutionalHistory.map((h) => [h.stockId, h]));
  const reversalDateByStock = new Map(rows.map((r) => [r.stockId, r.reversalPointDate]));

  const result = new Map<number, VolatilityStats>();
  for (const [stockId, series] of seriesByStock) {
    let todayChangePct: number | null = null;
    let todayChangeAmount: number | null = null;
    if (series.length >= 2) {
      const prev = series[series.length - 2].close;
      const curr = series[series.length - 1].close;
      if (prev !== 0) todayChangePct = Math.round(((curr - prev) / prev) * 10000) / 100;
      todayChangeAmount = Math.round((curr - prev) * 100) / 100;
    }

    const reversalDate = reversalDateByStock.get(stockId);
    const sinceSignalSeries = reversalDate
      ? series.filter((s) => s.tradeDate.getTime() >= reversalDate.getTime())
      : series;

    let volatilitySinceSignal: number | null = null;
    if (sinceSignalSeries.length >= 3) {
      const dailyReturns: number[] = [];
      for (let i = 1; i < sinceSignalSeries.length; i++) {
        const prev = sinceSignalSeries[i - 1].close;
        const curr = sinceSignalSeries[i].close;
        if (prev !== 0) dailyReturns.push(((curr - prev) / prev) * 100);
      }
      if (dailyReturns.length >= 2) {
        const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
        const variance = dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyReturns.length;
        volatilitySinceSignal = Math.round(Math.sqrt(variance) * 100) / 100;
      }
    }

    const closes = series.map((s) => s.close);
    const sparkline = series.length >= 2 ? closes.slice(-SPARKLINE_POINTS) : null;
    const { status: bollingerStatus, detail: bollingerDetail } = classifyBollinger(closes);

    let maAligned: boolean | null = null;
    if (closes.length >= 20) {
      const ma5 = sma(closes, 5);
      const ma10 = sma(closes, 10);
      const ma20 = sma(closes, 20);
      const last = closes.length - 1;
      const m5 = ma5[last];
      const m10 = ma10[last];
      const m20 = ma20[last];
      if (m5 !== null && m10 !== null && m20 !== null) maAligned = m5 > m10 && m10 > m20;
    }

    let netBuySellAmountMillions: number | null = null;
    let netBuySellLots: number | null = null;
    let trustNetBuyLots: number | null = null;
    const latestInstitutional = latestInstitutionalByStock.get(stockId);
    const latestClose = series.length > 0 ? series[series.length - 1].close : null;
    if (latestInstitutional && latestClose !== null) {
      const daysStale = Math.abs(Date.now() - latestInstitutional.tradeDate.getTime()) / 86_400_000;
      if (daysStale <= MAX_INSTITUTIONAL_DATA_GAP_DAYS) {
        trustNetBuyLots = Number(latestInstitutional.investTrustNetBuyShares);
        netBuySellLots = Number(latestInstitutional.foreignNetBuyShares) + trustNetBuyLots;
        netBuySellAmountMillions = Math.round(((netBuySellLots * latestClose) / 1000) * 100) / 100;
      }
    }

    // sinceSignalSeries已經是「reversalPointDate(含)到今天」的交易日序列，長度就是這個狀態
    // 連續成立的交易日數——跟classifyChipFlow.ts內部算「合買/合賣第幾天」是同一個概念
    const signalStreakTradingDays = reversalDate ? sinceSignalSeries.length : null;

    result.set(stockId, {
      todayChangePct,
      todayChangeAmount,
      volatilitySinceSignal,
      sparkline,
      bollingerStatus,
      bollingerDetail,
      maAligned,
      netBuySellAmountMillions,
      netBuySellLots,
      trustNetBuyLots,
      signalStreakTradingDays,
    });
  }
  return result;
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

  const emptyGroups: Record<TacticalStatus, SectorTrendItem[]> = {
    reversal: [],
    pullback: [],
    bullish: [],
    trustTurnBuy: [],
    combinedBuy: [],
    buyDip: [],
    trustTurnSell: [],
    combinedSell: [],
  };

  if (!asOfDate) {
    return {
      asOfDate: null,
      market,
      sector: sectorCode ?? "all",
      theme: themeCode ?? "all",
      groups: emptyGroups,
      chipLeading: [],
    };
  }

  const marketStatuses = tacticalStatusesForMarket(market);
  const latestPerStock = await fetchLatestSignalPerStock(stockFilter, asOfDate);
  const groups: Record<TacticalStatus, SignalRow[]> = {
    reversal: [],
    pullback: [],
    bullish: [],
    trustTurnBuy: [],
    combinedBuy: [],
    buyDip: [],
    trustTurnSell: [],
    combinedSell: [],
  };
  const chipLeadingRows: SignalRow[] = [];
  for (const row of latestPerStock) {
    if (marketStatuses.includes(row.status as TacticalStatus)) {
      groups[row.status as TacticalStatus].push(row);
    } else if (row.status === "chipLeading") {
      chipLeadingRows.push(row);
    }
  }
  for (const status of marketStatuses) {
    groups[status].sort((a, b) => Number(b.coreScore) - Number(a.coreScore));
    groups[status] = groups[status].slice(0, limit);
  }
  chipLeadingRows.sort((a, b) => Number(b.chipScore) - Number(a.chipScore));
  const slicedChipLeading = chipLeadingRows.slice(0, CHIP_LEADING_LIMIT);

  const statsByStockId = await computeVolatilityStats([
    ...marketStatuses.flatMap((status) => groups[status]),
    ...slicedChipLeading,
  ]);

  const populatedGroups = { ...emptyGroups };
  for (const status of marketStatuses) {
    populatedGroups[status] = groups[status].map((r) => toItem(r, statsByStockId.get(r.stockId)));
  }

  return {
    asOfDate: asOfDate.toISOString().slice(0, 10),
    market,
    sector: sectorCode ?? "all",
    theme: themeCode ?? "all",
    groups: populatedGroups,
    chipLeading: slicedChipLeading.map((r) => toItem(r, statsByStockId.get(r.stockId))),
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

  const statsByStockId = await computeVolatilityStats(rows);

  return {
    asOfDate: asOfDate.toISOString().slice(0, 10),
    market,
    sector: sectorCode ?? "all",
    theme: themeCode ?? "all",
    mode: options.mode,
    items: rows.map((r) => toItem(r, statsByStockId.get(r.stockId))),
  };
}
