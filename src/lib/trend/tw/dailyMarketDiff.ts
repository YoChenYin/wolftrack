import { prisma } from "@/lib/prisma";
import { tacticalStatusesForMarket, type TacticalStatus } from "@/lib/trend/sectorTrendsQuery";
import { calculateSupportResistance } from "@/lib/trend/tw/supportResistance";
import { calculateInstitutionalCostBasis } from "@/lib/trend/tw/institutionalCostBasis";

/** 跟supportResistance.ts/institutionalCostBasis.ts共用同一個60個交易日窗口，這裡多留一點
 * 緩衝（90個日曆天，跟sectorTrendsQuery.ts的VOLATILITY_LOOKBACK_DAYS一致）確保兩個窗口
 * （到今天/到昨天）都有足夠資料可以算 */
const LOOKBACK_CALENDAR_DAYS = 90;

const TW_TACTICAL_STATUSES = new Set<TacticalStatus>(tacticalStatusesForMarket("TW"));

export interface CategoryTransition {
  ticker: string;
  name: string;
  /** null＝昨天不在任何戰術分類（今天是新進） */
  fromCategory: TacticalStatus | null;
  /** null＝今天不在任何戰術分類（今天是移出） */
  toCategory: TacticalStatus | null;
  /** 今天分類器算出的觸發原因（見classifyChipFlow.ts），toCategory為null時沒有值 */
  triggerReason: string | null;
  /** 2026-08-21新增：今天收盤價——之前只有支撐壓力突破/法人成本翻轉兩類事件會顯示價格，
   * 戰術分類轉換（投信轉買/投信外資合買等）的描述完全沒有價格，使用者反映看不到收盤價 */
  price: number;
}

export interface BreakoutEvent {
  ticker: string;
  name: string;
  direction: "aboveResistance" | "belowSupport";
  price: number;
  level: number;
}

export interface CostBasisCrossoverEvent {
  ticker: string;
  name: string;
  who: "foreign" | "trust";
  /** 股價從成本價之上跌破到之下，或從之下站上到之上 */
  direction: "priceBelowCost" | "priceAboveCost";
  price: number;
  costBasis: number;
}

export interface DailyMarketDiff {
  reportDate: string;
  prevTradeDate: string;
  taiex: { close: number; changePct: number } | null;
  categoryTransitions: CategoryTransition[];
  breakouts: BreakoutEvent[];
  costBasisCrossovers: CostBasisCrossoverEvent[];
}

/** 找daily_trend_signals裡最新的兩個不同交易日（TW市場）。資料不足兩天回傳null。
 * 允許呼叫端明確指定日期（測試/補跑用，跳過本機dev DB資料很舊時「自動抓最新」抓不到有料
 * 的日期這個限制），預設才是「自動抓最新兩天」。 */
async function resolveDiffDates(
  explicitDates?: { reportDate: string; prevTradeDate: string }
): Promise<{ reportDate: Date; prevTradeDate: Date } | null> {
  if (explicitDates) {
    return { reportDate: new Date(explicitDates.reportDate), prevTradeDate: new Date(explicitDates.prevTradeDate) };
  }
  const dates = await prisma.dailyTrendSignal.findMany({
    where: { stock: { market: "TW" } },
    distinct: ["tradeDate"],
    orderBy: { tradeDate: "desc" },
    take: 2,
    select: { tradeDate: true },
  });
  if (dates.length < 2) return null;
  return { reportDate: dates[0].tradeDate, prevTradeDate: dates[1].tradeDate };
}

async function computeTaiex(reportDate: Date, prevTradeDate: Date): Promise<DailyMarketDiff["taiex"]> {
  const taiexStock = await prisma.stock.findFirst({ where: { market: "TW", ticker: "TAIEX" } });
  if (!taiexStock) return null;
  const prices = await prisma.twDailyPrice.findMany({
    where: { stockId: taiexStock.id, tradeDate: { in: [reportDate, prevTradeDate] } },
    orderBy: { tradeDate: "asc" },
    select: { tradeDate: true, close: true },
  });
  if (prices.length !== 2) return null;
  const [prev, curr] = prices;
  const prevClose = Number(prev.close);
  const currClose = Number(curr.close);
  if (prevClose === 0) return null;
  return {
    close: currClose,
    changePct: Math.round(((currClose - prevClose) / prevClose) * 10000) / 100,
  };
}

function computeCategoryTransitions(
  todaySignals: {
    stockId: number;
    status: string;
    triggerReason: string | null;
    closePrice: unknown;
    stock: { ticker: string; companyName: string };
  }[],
  yesterdayStatusByStock: Map<number, string>
): CategoryTransition[] {
  const transitions: CategoryTransition[] = [];
  for (const row of todaySignals) {
    const prevStatus = (yesterdayStatusByStock.get(row.stockId) ?? null) as TacticalStatus | null;
    const isTacticalToday = TW_TACTICAL_STATUSES.has(row.status as TacticalStatus);
    const isTacticalYesterday = prevStatus !== null && TW_TACTICAL_STATUSES.has(prevStatus);
    if (!isTacticalToday && !isTacticalYesterday) continue;
    if (row.status === prevStatus) continue; // 同一個戰術分類連續多天，不是「今天發生的變化」
    transitions.push({
      ticker: row.stock.ticker,
      name: row.stock.companyName,
      fromCategory: isTacticalYesterday ? prevStatus : null,
      toCategory: isTacticalToday ? (row.status as TacticalStatus) : null,
      triggerReason: isTacticalToday ? row.triggerReason : null,
      price: Number(row.closePrice),
    });
  }
  return transitions;
}

/**
 * 台股每日異動報告v1的核心：算「今天 vs 上一個交易日」的客觀狀態變化。純資料計算，
 * 不寫DB（見generateDailyReport.ts）、不生成文案（見describeDailyDiff.ts）。
 */
export async function computeDailyMarketDiff(explicitDates?: {
  reportDate: string;
  prevTradeDate: string;
}): Promise<DailyMarketDiff | null> {
  const dates = await resolveDiffDates(explicitDates);
  if (!dates) return null;
  const { reportDate, prevTradeDate } = dates;

  const [taiex, todaySignals, yesterdaySignals] = await Promise.all([
    computeTaiex(reportDate, prevTradeDate),
    prisma.dailyTrendSignal.findMany({
      where: { tradeDate: reportDate, stock: { market: "TW" } },
      select: {
        stockId: true,
        status: true,
        triggerReason: true,
        closePrice: true,
        stock: { select: { ticker: true, companyName: true } },
      },
    }),
    prisma.dailyTrendSignal.findMany({
      where: { tradeDate: prevTradeDate, stock: { market: "TW" } },
      select: { stockId: true, status: true },
    }),
  ]);

  const yesterdayStatusByStock = new Map(yesterdaySignals.map((s) => [s.stockId, s.status]));
  const categoryTransitions = computeCategoryTransitions(todaySignals, yesterdayStatusByStock);

  const stockIds = todaySignals.map((s) => s.stockId);
  const nameByStock = new Map(todaySignals.map((s) => [s.stockId, s.stock]));
  const cutoff = new Date(reportDate.getTime() - LOOKBACK_CALENDAR_DAYS * 86_400_000);

  const [priceHistory, institutionalHistory] = await Promise.all([
    prisma.twDailyPrice.findMany({
      where: { stockId: { in: stockIds }, tradeDate: { gte: cutoff, lte: reportDate } },
      orderBy: [{ stockId: "asc" }, { tradeDate: "asc" }],
      select: { stockId: true, tradeDate: true, close: true },
    }),
    prisma.twInstitutionalTrading.findMany({
      where: { stockId: { in: stockIds }, tradeDate: { gte: cutoff, lte: reportDate } },
      orderBy: [{ stockId: "asc" }, { tradeDate: "asc" }],
      select: { stockId: true, tradeDate: true, foreignNetBuyShares: true, investTrustNetBuyShares: true },
    }),
  ]);

  const priceByStock = new Map<number, { tradeDate: Date; close: number }[]>();
  for (const p of priceHistory) {
    const list = priceByStock.get(p.stockId) ?? [];
    list.push({ tradeDate: p.tradeDate, close: Number(p.close) });
    priceByStock.set(p.stockId, list);
  }
  const institutionalByStock = new Map<number, { tradeDate: Date; foreignNetBuyShares: number; investTrustNetBuyShares: number }[]>();
  for (const h of institutionalHistory) {
    const list = institutionalByStock.get(h.stockId) ?? [];
    list.push({
      tradeDate: h.tradeDate,
      foreignNetBuyShares: Number(h.foreignNetBuyShares),
      investTrustNetBuyShares: Number(h.investTrustNetBuyShares),
    });
    institutionalByStock.set(h.stockId, list);
  }

  const breakouts: BreakoutEvent[] = [];
  const costBasisCrossovers: CostBasisCrossoverEvent[] = [];

  for (const stockId of stockIds) {
    const series = priceByStock.get(stockId);
    if (!series || series.length === 0) continue;
    const stockInfo = nameByStock.get(stockId);
    if (!stockInfo) continue;

    const seriesUpToYesterday = series.filter((s) => s.tradeDate.getTime() <= prevTradeDate.getTime());
    const closesToday = series.map((s) => s.close);
    const closesYesterday = seriesUpToYesterday.map((s) => s.close);

    const srToday = calculateSupportResistance(closesToday);
    const srYesterday = calculateSupportResistance(closesYesterday);
    if (srToday && srYesterday && srYesterday.priceStatus === "withinRange" && srToday.priceStatus !== "withinRange") {
      breakouts.push({
        ticker: stockInfo.ticker,
        name: stockInfo.companyName,
        direction: srToday.priceStatus,
        price: closesToday[closesToday.length - 1],
        level: srToday.priceStatus === "aboveResistance" ? srToday.resistance : srToday.support,
      });
    }

    const instSeries = institutionalByStock.get(stockId) ?? [];
    const priceToday = closesToday[closesToday.length - 1];
    const priceYesterday = closesYesterday.length > 0 ? closesYesterday[closesYesterday.length - 1] : null;
    const closeByDateKey = new Map(series.map((s) => [s.tradeDate.getTime(), s.close]));

    for (const who of ["foreign", "trust"] as const) {
      const toCostBasisDays = (days: typeof instSeries) =>
        days
          .map((d) => {
            const closePrice = closeByDateKey.get(d.tradeDate.getTime());
            const netBuyShares = who === "foreign" ? d.foreignNetBuyShares : d.investTrustNetBuyShares;
            return closePrice === undefined ? null : { closePrice, netBuyShares };
          })
          .filter((d): d is { closePrice: number; netBuyShares: number } => d !== null);

      const instUpToYesterday = instSeries.filter((d) => d.tradeDate.getTime() <= prevTradeDate.getTime());
      const costToday = calculateInstitutionalCostBasis(toCostBasisDays(instSeries)).costBasis;
      const costYesterday = calculateInstitutionalCostBasis(toCostBasisDays(instUpToYesterday)).costBasis;

      if (costToday === null || costYesterday === null || priceYesterday === null) continue;
      const sideYesterday = priceYesterday > costYesterday ? "above" : priceYesterday < costYesterday ? "below" : null;
      const sideToday = priceToday > costToday ? "above" : priceToday < costToday ? "below" : null;
      if (sideYesterday === null || sideToday === null || sideYesterday === sideToday) continue;

      costBasisCrossovers.push({
        ticker: stockInfo.ticker,
        name: stockInfo.companyName,
        who,
        direction: sideToday === "below" ? "priceBelowCost" : "priceAboveCost",
        price: priceToday,
        costBasis: costToday,
      });
    }
  }

  return {
    reportDate: reportDate.toISOString().slice(0, 10),
    prevTradeDate: prevTradeDate.toISOString().slice(0, 10),
    taiex,
    categoryTransitions,
    breakouts,
    costBasisCrossovers,
  };
}
