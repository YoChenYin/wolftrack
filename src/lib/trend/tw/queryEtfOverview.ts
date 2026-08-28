import { prisma } from "@/lib/prisma";

/** 對應backfill-tw-etfs.ts收錄的三種FinMind industry_category分類 */
export type EtfCategory = "listed" | "otc" | "otcBond";

const CATEGORY_BY_INDUSTRY: Record<string, EtfCategory> = {
  ETF: "listed",
  上櫃ETF: "otc",
  "上櫃指數股票型基金(ETF)": "otcBond",
};

export const ETF_CATEGORY_LABEL: Record<EtfCategory, string> = {
  listed: "上市ETF",
  otc: "上櫃ETF",
  otcBond: "上櫃債券ETF",
};

export interface EtfOverviewItem {
  ticker: string;
  name: string;
  category: EtfCategory;
  latestClose: number | null;
  latestTradeDate: string | null;
  dayChangePct: number | null;
}

/** 只抓近30個日曆天的價格，不管單一ETF背後有沒有回填多年歷史——這裡只需要最新2筆算日漲跌，
 * 撈全部歷史再篩會很浪費（部分ETF共用跟一般股票一樣的回補管線，可能已經有好幾年資料）。
 * 視窗以「這批ETF實際最新的一筆資料日期」為基準，不是wall-clock now()——本機dev DB資料
 * 常常停留在幾週前（batch排程沒有每天跑），用now()當基準會把所有資料都篩掉，見resolveDiffDates
 * 同樣的處理方式（dailyMarketDiff.ts）。 */
const RECENT_LOOKBACK_DAYS = 30;

export async function queryEtfOverview(): Promise<EtfOverviewItem[]> {
  const stocks = await prisma.stock.findMany({
    where: { market: "TW", isActive: true, industry: { contains: "ETF" } },
    select: { id: true, ticker: true, companyName: true, industry: true },
    orderBy: { ticker: "asc" },
  });

  const stockIds = stocks.map((s) => s.id);
  const latestPriceRow = await prisma.twDailyPrice.findFirst({
    where: { stockId: { in: stockIds } },
    orderBy: { tradeDate: "desc" },
    select: { tradeDate: true },
  });
  if (!latestPriceRow) {
    return stocks.map((s) => ({
      ticker: s.ticker,
      name: s.companyName,
      category: CATEGORY_BY_INDUSTRY[s.industry ?? ""] ?? "listed",
      latestClose: null,
      latestTradeDate: null,
      dayChangePct: null,
    }));
  }

  const cutoff = new Date(latestPriceRow.tradeDate.getTime() - RECENT_LOOKBACK_DAYS * 86_400_000);
  const recentPrices = await prisma.twDailyPrice.findMany({
    where: { stockId: { in: stockIds }, tradeDate: { gte: cutoff } },
    orderBy: [{ stockId: "asc" }, { tradeDate: "desc" }],
    select: { stockId: true, tradeDate: true, close: true },
  });

  const latestTwoByStock = new Map<number, { tradeDate: Date; close: number }[]>();
  for (const p of recentPrices) {
    const list = latestTwoByStock.get(p.stockId) ?? [];
    if (list.length < 2) list.push({ tradeDate: p.tradeDate, close: Number(p.close) });
    latestTwoByStock.set(p.stockId, list);
  }

  return stocks.map((s) => {
    const [latest, prev] = latestTwoByStock.get(s.id) ?? [];
    const dayChangePct = latest && prev && prev.close !== 0 ? ((latest.close - prev.close) / prev.close) * 100 : null;
    return {
      ticker: s.ticker,
      name: s.companyName,
      category: CATEGORY_BY_INDUSTRY[s.industry ?? ""] ?? "listed",
      latestClose: latest ? latest.close : null,
      latestTradeDate: latest ? latest.tradeDate.toISOString().slice(0, 10) : null,
      dayChangePct,
    };
  });
}
