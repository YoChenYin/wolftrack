import { prisma } from "@/lib/prisma";
import { tacticalStatusesForMarket, type TacticalStatus } from "@/lib/trend/sectorTrendsQuery";
import { calculateSupportResistance } from "@/lib/trend/tw/supportResistance";
import { calculateInstitutionalCostBasis } from "@/lib/trend/tw/institutionalCostBasis";
import type { BottomPatternType, BottomPatternStage } from "@/generated/prisma/enums";

/** 跟supportResistance.ts/institutionalCostBasis.ts共用同一個60個交易日窗口，這裡多留一點
 * 緩衝（90個日曆天，跟sectorTrendsQuery.ts的VOLATILITY_LOOKBACK_DAYS一致）確保兩個窗口
 * （到今天/到昨天）都有足夠資料可以算 */
const LOOKBACK_CALENDAR_DAYS = 90;

const TW_TACTICAL_STATUSES = new Set<TacticalStatus>(tacticalStatusesForMarket("TW"));

/** 「已經連續N天都在同一個戰術分類」的動能標示（v2新增），低於這個天數不算「值得標註的動能」，
 * 跟classifyChipFlow.ts的MAX_STREAK_LOOKBACK_DAYS(90)是同一份90天回溯窗口，只是這裡的門檻
 * 是「至少要多長才顯示」而不是「最多回溯多遠」 */
const MIN_STREAK_DAYS_TO_SHOW = 5;

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

/** 底部反轉型態今天的階段變化（v2新增，見detectBottomPattern.ts），跟categoryTransitions
 * 是不同的分類來源，一檔股票可能同時有戰術分類轉換又有底部型態進展，兩者互不排擠 */
export interface BottomPatternTransitionEvent {
  ticker: string;
  name: string;
  patternType: BottomPatternType;
  /** null＝昨天型態還沒成形 */
  fromStage: BottomPatternStage | null;
  /** null＝今天型態已經消失（股價走勢不再符合，多半是拉回太深型態失效） */
  toStage: BottomPatternStage | null;
  description: string | null;
  price: number;
}

/** 目前仍在同一個戰術分類已經連續N天的個股（v2新增）——跟categoryTransitions互補：
 * transitions只看「今天有沒有變化」，這裡看「已經持續多久沒變化」，兩者一起才能回答
 * 「這檔股票的訊號是剛發生的還是已經醞釀一陣子了」 */
export interface CategoryStreak {
  ticker: string;
  name: string;
  category: TacticalStatus;
  /** 含今天在內，連續處於同一分類的交易日數 */
  streakDays: number;
}

export interface DailyMarketDiff {
  reportDate: string;
  prevTradeDate: string;
  taiex: { close: number; changePct: number } | null;
  categoryTransitions: CategoryTransition[];
  breakouts: BreakoutEvent[];
  costBasisCrossovers: CostBasisCrossoverEvent[];
  bottomPatternTransitions: BottomPatternTransitionEvent[];
  categoryStreaks: CategoryStreak[];
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

function computeBottomPatternTransitions(
  todaySignals: {
    stockId: number;
    bottomPatternType: BottomPatternType | null;
    bottomPatternStage: BottomPatternStage | null;
    bottomPatternDescription: string | null;
    closePrice: unknown;
    stock: { ticker: string; companyName: string };
  }[],
  yesterdayBottomByStock: Map<number, { type: BottomPatternType | null; stage: BottomPatternStage | null }>
): BottomPatternTransitionEvent[] {
  const transitions: BottomPatternTransitionEvent[] = [];
  for (const row of todaySignals) {
    const prev = yesterdayBottomByStock.get(row.stockId) ?? { type: null, stage: null };
    if (row.bottomPatternStage === prev.stage) continue; // 階段沒變化，不是「今天發生的變化」
    if (row.bottomPatternStage === null && prev.stage === null) continue;
    transitions.push({
      ticker: row.stock.ticker,
      name: row.stock.companyName,
      patternType: (row.bottomPatternStage !== null ? row.bottomPatternType : prev.type)!,
      fromStage: prev.stage,
      toStage: row.bottomPatternStage,
      description: row.bottomPatternStage !== null ? row.bottomPatternDescription : null,
      price: Number(row.closePrice),
    });
  }
  return transitions;
}

/** 目前仍在同一個戰術分類已經連續幾天——historyDescByStock是每檔股票「今天以前」由新到舊
 * 排序的status歷史（不含今天），今天本身算streak第1天，再從歷史往回數，數到status不同或
 * 資料用完為止 */
function computeCategoryStreaks(
  todaySignals: { stockId: number; status: string; stock: { ticker: string; companyName: string } }[],
  historyDescByStock: Map<number, string[]>
): CategoryStreak[] {
  const streaks: CategoryStreak[] = [];
  for (const row of todaySignals) {
    if (!TW_TACTICAL_STATUSES.has(row.status as TacticalStatus)) continue;
    const history = historyDescByStock.get(row.stockId) ?? [];
    let streakDays = 1; // 今天本身算第1天
    for (const status of history) {
      if (status !== row.status) break;
      streakDays++;
    }
    if (streakDays >= MIN_STREAK_DAYS_TO_SHOW) {
      streaks.push({ ticker: row.stock.ticker, name: row.stock.companyName, category: row.status as TacticalStatus, streakDays });
    }
  }
  return streaks.sort((a, b) => b.streakDays - a.streakDays);
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
        bottomPatternType: true,
        bottomPatternStage: true,
        bottomPatternDescription: true,
        stock: { select: { ticker: true, companyName: true } },
      },
    }),
    prisma.dailyTrendSignal.findMany({
      where: { tradeDate: prevTradeDate, stock: { market: "TW" } },
      select: { stockId: true, status: true, bottomPatternType: true, bottomPatternStage: true },
    }),
  ]);

  const yesterdayStatusByStock = new Map(yesterdaySignals.map((s) => [s.stockId, s.status]));
  const categoryTransitions = computeCategoryTransitions(todaySignals, yesterdayStatusByStock);

  const yesterdayBottomByStock = new Map(
    yesterdaySignals.map((s) => [s.stockId, { type: s.bottomPatternType, stage: s.bottomPatternStage }])
  );
  const bottomPatternTransitions = computeBottomPatternTransitions(todaySignals, yesterdayBottomByStock);

  const stockIds = todaySignals.map((s) => s.stockId);
  const nameByStock = new Map(todaySignals.map((s) => [s.stockId, s.stock]));
  const cutoff = new Date(reportDate.getTime() - LOOKBACK_CALENDAR_DAYS * 86_400_000);

  const [priceHistory, institutionalHistory, statusHistoryDesc] = await Promise.all([
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
    prisma.dailyTrendSignal.findMany({
      where: { stockId: { in: stockIds }, tradeDate: { gte: cutoff, lt: reportDate } },
      orderBy: [{ stockId: "asc" }, { tradeDate: "desc" }],
      select: { stockId: true, status: true },
    }),
  ]);

  const historyDescByStock = new Map<number, string[]>();
  for (const h of statusHistoryDesc) {
    const list = historyDescByStock.get(h.stockId) ?? [];
    list.push(h.status);
    historyDescByStock.set(h.stockId, list);
  }
  const categoryStreaks = computeCategoryStreaks(todaySignals, historyDescByStock);

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
    bottomPatternTransitions,
    categoryStreaks,
  };
}
