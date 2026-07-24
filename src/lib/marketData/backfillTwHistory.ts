import { prisma } from "@/lib/prisma";
import { fetchFinMindStockPrice, fetchFinMindInstitutionalTrading, fetchFinMindMonthlyRevenue } from "./finmindClient";

/**
 * 2026-07-25：把台股價格/籌碼/營收回補到10年歷史（目標2016-01-01起），透過
 * /api/cron/tw-history-backfill 分批觸發，每次呼叫只消耗一小批FinMind API額度
 * （MAX_API_CALLS_PER_INVOCATION），故意設計成能被GitHub Actions排程反覆連續呼叫
 * （中間插sleep控制整體速率），而不是在單一次呼叫裡跑好幾小時——2026-07-21修復YouTube
 * LLM解析fire-and-forget問題時得到的教訓：長時間佔用單一個Zeabur request不可靠
 * （container重啟/自動部署會直接砍斷還沒跑完的工作），小批次+外部驅動的重複呼叫才穩定。
 *
 * TwHistoryBackfillStatus 追蹤每檔股票每種資料是否已經回補到頭（isFullyBackfilled=true），
 * 避免每次呼叫都要重新對已經確認「FinMind沒有更早資料了」的股票再浪費一次API額度去確認。
 */
export const TARGET_START_DATE = "2016-01-01";
const MAX_API_CALLS_PER_INVOCATION = 15;
const CANDIDATE_SCAN_LIMIT = 60;

type Dataset = "price" | "institutional" | "revenue";
const DATASETS: Dataset[] = ["price", "institutional", "revenue"];

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getEarliestDate(stockId: number, dataset: Dataset): Promise<string | null> {
  if (dataset === "price") {
    const row = await prisma.twDailyPrice.aggregate({ where: { stockId }, _min: { tradeDate: true } });
    return row._min.tradeDate ? row._min.tradeDate.toISOString().slice(0, 10) : null;
  }
  if (dataset === "institutional") {
    const row = await prisma.twInstitutionalTrading.aggregate({ where: { stockId }, _min: { tradeDate: true } });
    return row._min.tradeDate ? row._min.tradeDate.toISOString().slice(0, 10) : null;
  }
  const row = await prisma.twMonthlyRevenue.aggregate({ where: { stockId }, _min: { revenueMonth: true } });
  return row._min.revenueMonth ? row._min.revenueMonth.toISOString().slice(0, 10) : null;
}

async function markFullyBackfilled(stockId: number, dataset: Dataset, earliestDate: string | null): Promise<void> {
  await prisma.twHistoryBackfillStatus.upsert({
    where: { stockId_dataset: { stockId, dataset } },
    update: { isFullyBackfilled: true, earliestDateFetched: earliestDate ? new Date(earliestDate) : null },
    create: {
      stockId,
      dataset,
      isFullyBackfilled: true,
      earliestDateFetched: earliestDate ? new Date(earliestDate) : null,
    },
  });
}

async function recordProgress(stockId: number, dataset: Dataset, earliestDate: string): Promise<void> {
  await prisma.twHistoryBackfillStatus.upsert({
    where: { stockId_dataset: { stockId, dataset } },
    update: { earliestDateFetched: new Date(earliestDate) },
    create: { stockId, dataset, earliestDateFetched: new Date(earliestDate), isFullyBackfilled: false },
  });
}

/** YoY/MoM 是 FinMind 沒有直接給的欄位，呼叫端自己拿相鄰月份的revenue去算 */
function computeGrowthPct(current: number, prior: number | null): number | null {
  if (prior === null || prior === 0) return null;
  return Math.round(((current - prior) / prior) * 10000) / 100;
}

async function backfillPrice(stockId: number, ticker: string, earliestExisting: string | null): Promise<boolean> {
  const endDate = earliestExisting ? addDays(earliestExisting, -1) : todayIso();
  if (endDate < TARGET_START_DATE) return true; // 已經到頭了，不用打API

  const bars = await fetchFinMindStockPrice(ticker, TARGET_START_DATE, endDate);
  if (bars.length === 0) return true; // FinMind沒有更早資料，代表已經回補到頭

  await prisma.$transaction(
    bars.map((bar) =>
      prisma.twDailyPrice.upsert({
        where: { stockId_tradeDate: { stockId, tradeDate: new Date(bar.date) } },
        update: { open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: BigInt(Math.round(bar.volume)) },
        create: {
          stockId,
          tradeDate: new Date(bar.date),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: BigInt(Math.round(bar.volume)),
        },
      })
    )
  );
  await recordProgress(stockId, "price", bars[0].date);
  return false;
}

async function backfillInstitutional(stockId: number, ticker: string, earliestExisting: string | null): Promise<boolean> {
  const endDate = earliestExisting ? addDays(earliestExisting, -1) : todayIso();
  if (endDate < TARGET_START_DATE) return true;

  const byDate = await fetchFinMindInstitutionalTrading(ticker, TARGET_START_DATE, endDate);
  if (byDate.size === 0) return true;

  const dates = [...byDate.keys()].sort();
  await prisma.$transaction(
    dates.map((date) => {
      const net = byDate.get(date)!;
      return prisma.twInstitutionalTrading.upsert({
        where: { stockId_tradeDate: { stockId, tradeDate: new Date(date) } },
        update: {
          foreignNetBuyShares: BigInt(net.foreignNetBuyShares),
          investTrustNetBuyShares: BigInt(net.investTrustNetBuyShares),
          dealerNetBuyShares: BigInt(net.dealerNetBuyShares),
        },
        create: {
          stockId,
          tradeDate: new Date(date),
          foreignNetBuyShares: BigInt(net.foreignNetBuyShares),
          investTrustNetBuyShares: BigInt(net.investTrustNetBuyShares),
          dealerNetBuyShares: BigInt(net.dealerNetBuyShares),
        },
      });
    })
  );
  await recordProgress(stockId, "institutional", dates[0]);
  return false;
}

async function backfillRevenue(stockId: number, ticker: string, earliestExisting: string | null): Promise<boolean> {
  const endDate = earliestExisting ? addDays(earliestExisting, -1) : todayIso();
  if (endDate < TARGET_START_DATE) return true;

  const rows = await fetchFinMindMonthlyRevenue(ticker, TARGET_START_DATE, endDate);
  if (rows.length === 0) return true; // ETF等沒有營收資料的標的，這裡自然結束，不會一直重試

  // 算年增率/月增率要相鄰月份，所以連同已有資料一起抓出來排序後算
  const existing = await prisma.twMonthlyRevenue.findMany({ where: { stockId }, orderBy: { revenueMonth: "asc" } });
  const merged = new Map<string, number>();
  for (const r of existing) merged.set(r.revenueMonth.toISOString().slice(0, 10), Number(r.revenue));
  for (const r of rows) merged.set(r.revenueMonth, r.revenue);
  const sortedMonths = [...merged.keys()].sort();

  const toWrite = rows.map((r) => {
    const idx = sortedMonths.indexOf(r.revenueMonth);
    const priorMonth = idx > 0 ? merged.get(sortedMonths[idx - 1])! : null;
    const yearAgoDate = addDays(r.revenueMonth, -365).slice(0, 7) + "-01";
    const closestYearAgo = sortedMonths.find((m) => m.slice(0, 7) === yearAgoDate.slice(0, 7));
    const priorYear = closestYearAgo ? merged.get(closestYearAgo)! : null;
    return {
      revenueMonth: r.revenueMonth,
      revenue: r.revenue,
      revenuePriorMonth: priorMonth,
      revenueSameMonthLastYear: priorYear,
      momGrowthPct: computeGrowthPct(r.revenue, priorMonth),
      yoyGrowthPct: computeGrowthPct(r.revenue, priorYear),
    };
  });

  await prisma.$transaction(
    toWrite.map((r) =>
      prisma.twMonthlyRevenue.upsert({
        where: { stockId_revenueMonth: { stockId, revenueMonth: new Date(r.revenueMonth) } },
        update: {
          revenue: BigInt(r.revenue),
          revenuePriorMonth: r.revenuePriorMonth !== null ? BigInt(r.revenuePriorMonth) : null,
          revenueSameMonthLastYear: r.revenueSameMonthLastYear !== null ? BigInt(r.revenueSameMonthLastYear) : null,
          momGrowthPct: r.momGrowthPct,
          yoyGrowthPct: r.yoyGrowthPct,
        },
        create: {
          stockId,
          revenueMonth: new Date(r.revenueMonth),
          revenue: BigInt(r.revenue),
          revenuePriorMonth: r.revenuePriorMonth !== null ? BigInt(r.revenuePriorMonth) : null,
          revenueSameMonthLastYear: r.revenueSameMonthLastYear !== null ? BigInt(r.revenueSameMonthLastYear) : null,
          momGrowthPct: r.momGrowthPct,
          yoyGrowthPct: r.yoyGrowthPct,
        },
      })
    )
  );
  await recordProgress(stockId, "revenue", rows.map((r) => r.revenueMonth).sort()[0]);
  return false;
}

export interface BackfillBatchResult {
  callsUsed: number;
  touched: { ticker: string; dataset: Dataset; outcome: "backfilled" | "fully_complete" | "error" }[];
  candidatesRemaining: number;
}

/** 每次呼叫只消耗一小批API額度就回傳，由外部（GitHub Actions loop）反覆呼叫來達成長時間、可控速率的回補 */
export async function runTwHistoryBackfillBatch(): Promise<BackfillBatchResult> {
  const stocks = await prisma.stock.findMany({
    where: { market: "TW", isActive: true },
    orderBy: { ticker: "asc" },
    select: { id: true, ticker: true },
  });

  const statuses = await prisma.twHistoryBackfillStatus.findMany({
    where: { stockId: { in: stocks.map((s) => s.id) } },
  });
  const statusByKey = new Map(statuses.map((s) => [`${s.stockId}:${s.dataset}`, s]));

  const candidates: { stockId: number; ticker: string; dataset: Dataset }[] = [];
  for (const stock of stocks) {
    for (const dataset of DATASETS) {
      const status = statusByKey.get(`${stock.id}:${dataset}`);
      if (status?.isFullyBackfilled) continue;
      candidates.push({ stockId: stock.id, ticker: stock.ticker, dataset });
      if (candidates.length >= CANDIDATE_SCAN_LIMIT) break;
    }
    if (candidates.length >= CANDIDATE_SCAN_LIMIT) break;
  }

  const touched: BackfillBatchResult["touched"] = [];
  let callsUsed = 0;

  for (const candidate of candidates) {
    if (callsUsed >= MAX_API_CALLS_PER_INVOCATION) break;

    const earliest = await getEarliestDate(candidate.stockId, candidate.dataset);
    if (earliest !== null && earliest <= TARGET_START_DATE) {
      await markFullyBackfilled(candidate.stockId, candidate.dataset, earliest);
      touched.push({ ticker: candidate.ticker, dataset: candidate.dataset, outcome: "fully_complete" });
      continue;
    }

    try {
      let alreadyAtLimit: boolean;
      if (candidate.dataset === "price") {
        alreadyAtLimit = await backfillPrice(candidate.stockId, candidate.ticker, earliest);
      } else if (candidate.dataset === "institutional") {
        alreadyAtLimit = await backfillInstitutional(candidate.stockId, candidate.ticker, earliest);
      } else {
        alreadyAtLimit = await backfillRevenue(candidate.stockId, candidate.ticker, earliest);
      }
      callsUsed++;
      if (alreadyAtLimit) {
        await markFullyBackfilled(candidate.stockId, candidate.dataset, earliest);
        touched.push({ ticker: candidate.ticker, dataset: candidate.dataset, outcome: "fully_complete" });
      } else {
        touched.push({ ticker: candidate.ticker, dataset: candidate.dataset, outcome: "backfilled" });
      }
    } catch (err) {
      callsUsed++;
      console.error(`[backfillTwHistory] ${candidate.ticker}/${candidate.dataset} failed:`, err);
      touched.push({ ticker: candidate.ticker, dataset: candidate.dataset, outcome: "error" });
    }
  }

  return { callsUsed, touched, candidatesRemaining: candidates.length - touched.length };
}
