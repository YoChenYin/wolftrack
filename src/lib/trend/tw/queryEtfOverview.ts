import { prisma } from "@/lib/prisma";

/**
 * 結構型分類（主分類）——用股票代號後綴字母，這是TWSE/TPEx官方編碼慣例，不是行銷話術，
 * 直接反映風險機制（槓桿/反向/債券/主動式），比「高股息/高成長」這種基金名稱關鍵字判斷
 * 更可靠也更關鍵（一檔基金叫「高股息」不代表它不是槓桿商品，代號後綴才是結構性事實）。
 * 只認得到目前確定語意的後綴，其餘（含常見的無後綴股票型、少數不確定語意的字母如K）
 * 一律歸「一般型」，寧可保守也不要亂猜分類。
 */
export type EtfStructureType = "equity" | "bond" | "leveraged" | "inverse" | "commodity" | "active";

export const STRUCTURE_TYPE_LABEL: Record<EtfStructureType, string> = {
  equity: "一般型",
  bond: "債券型",
  leveraged: "槓桿型",
  inverse: "反向型",
  commodity: "期貨商品型",
  active: "主動式",
};

/** 依代號結尾字母判斷，越明確的類型（槓桿/反向/商品/主動/債券）優先比對，避免跟一般型混淆 */
function classifyStructureType(ticker: string): EtfStructureType {
  if (ticker.endsWith("L")) return "leveraged";
  if (ticker.endsWith("R")) return "inverse";
  if (ticker.endsWith("U")) return "commodity";
  if (ticker.endsWith("A")) return "active";
  if (ticker.endsWith("B")) return "bond";
  return "equity";
}

/** 次要標籤——基金名稱關鍵字比對，抓得到才標、抓不到就不強行分類，跟結構型分類不同層級
 * （結構型是代號事實，這個是行銷風格的粗略歸類，僅供參考） */
export type EtfStyleTag = "highDividend" | "growth" | "esg" | "smallMid" | null;

export const STYLE_TAG_LABEL: Record<Exclude<EtfStyleTag, null>, string> = {
  highDividend: "高股息",
  growth: "科技/成長",
  esg: "ESG/永續",
  smallMid: "中小型",
};

function classifyStyleTag(name: string): EtfStyleTag {
  if (/高股息|高息|高股利/.test(name)) return "highDividend";
  if (/ESG|永續|公司治理/.test(name)) return "esg";
  if (/中小|中型/.test(name)) return "smallMid";
  if (/科技|半導體|AI|人工智慧|雲端|動能|成長/.test(name)) return "growth";
  return null;
}

export interface EtfOverviewItem {
  ticker: string;
  name: string;
  structureType: EtfStructureType;
  styleTag: EtfStyleTag;
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
    select: { id: true, ticker: true, companyName: true },
    orderBy: { ticker: "asc" },
  });

  const stockIds = stocks.map((s) => s.id);
  const latestPriceRow = await prisma.twDailyPrice.findFirst({
    where: { stockId: { in: stockIds } },
    orderBy: { tradeDate: "desc" },
    select: { tradeDate: true },
  });

  const buildItem = (s: (typeof stocks)[number], latest?: { tradeDate: Date; close: number }, prev?: { tradeDate: Date; close: number }): EtfOverviewItem => ({
    ticker: s.ticker,
    name: s.companyName,
    structureType: classifyStructureType(s.ticker),
    styleTag: classifyStyleTag(s.companyName),
    latestClose: latest ? latest.close : null,
    latestTradeDate: latest ? latest.tradeDate.toISOString().slice(0, 10) : null,
    dayChangePct: latest && prev && prev.close !== 0 ? ((latest.close - prev.close) / prev.close) * 100 : null,
  });

  if (!latestPriceRow) return stocks.map((s) => buildItem(s));

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
    return buildItem(s, latest, prev);
  });
}

export interface LeadingTypeStat {
  structureType: EtfStructureType;
  sampleSize: number;
  avgChangePct: number;
}

/** 今日領漲類型——依結構型分類算平均日漲跌幅（只算有資料的），由高到低排序，讓使用者一眼
 * 看出今天是槓桿/主動式在衝、還是債券型在漲（風險偏好的訊號），不用逐檔看 */
export function computeLeadingTypes(items: EtfOverviewItem[]): LeadingTypeStat[] {
  const byType = new Map<EtfStructureType, number[]>();
  for (const item of items) {
    if (item.dayChangePct === null) continue;
    const list = byType.get(item.structureType) ?? [];
    list.push(item.dayChangePct);
    byType.set(item.structureType, list);
  }
  return Array.from(byType.entries())
    .map(([structureType, changes]) => ({
      structureType,
      sampleSize: changes.length,
      avgChangePct: changes.reduce((a, b) => a + b, 0) / changes.length,
    }))
    .sort((a, b) => b.avgChangePct - a.avgChangePct);
}
