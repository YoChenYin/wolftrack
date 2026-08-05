import { prisma } from "@/lib/prisma";
import type { Market } from "@/generated/prisma/enums";

export interface MonthlyReturnCell {
  year: number;
  month: number; // 1-12
  returnPct: number;
}

export interface MonthlySeasonalitySummary {
  month: number; // 1-12
  avgReturnPct: number | null;
  medianReturnPct: number | null;
  winRatePct: number | null; // 正報酬年數佔比
  sampleYears: number;
  /** 從1月累加到這個月的平均報酬，畫「一年中漲跌週期」曲線用（1月=當月平均，12月=全年平均總和） */
  cumulativeAvgReturnPct: number | null;
}

export interface MonthlySeasonalityResult {
  ticker: string;
  label: string;
  cells: MonthlyReturnCell[];
  summary: MonthlySeasonalitySummary[]; // 固定12筆，依月份1-12排序
  years: number[]; // 有算出至少一筆報酬的年份，由小到大
  dataFrom: string | null;
  dataTo: string | null;
}

function emptyResult(ticker: string, label: string): MonthlySeasonalityResult {
  return { ticker, label, cells: [], summary: [], years: [], dataFrom: null, dataTo: null };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** 四條參考序列回填深度不一（TAIEX/TPEX/2330 都比 SPX 的10年長），統一裁成近10年樣本，跨序列比較才公平 */
const LOOKBACK_YEARS = 10;

/**
 * 歷年月份表現：給定一檔（合成或真實）股票，算每個月的報酬率 = 月底收盤 vs 上個月月底收盤，
 * 依日曆月分組後看每個月份（1-12月）橫跨多年的平均/中位數/勝率/累加週期，抓「歷史上哪個月份比較容易漲/跌」
 * 的季節性。可以是大盤指數（TAIEX/TPEX/SPX)也可以是個股（例如權值股 2330），market 預設 TW，
 * 加 SPX(S&P 500) 當美股對照組時傳 "US"——三者共用同一套算法才能互相對照。
 */
export async function computeMonthlySeasonality(ticker: string, label: string, market: Market = "TW"): Promise<MonthlySeasonalityResult> {
  const stock = await prisma.stock.findUnique({
    where: { market_ticker: { market, ticker } },
  });
  if (!stock) return emptyResult(ticker, label);

  // 樣本視窗起點（近10年），多抓一個月當緩衝，讓視窗第一個月也能算出對上個月底的報酬
  const windowStart = new Date();
  windowStart.setFullYear(windowStart.getFullYear() - LOOKBACK_YEARS);
  const windowStartKey = windowStart.toISOString().slice(0, 7);
  const fetchCutoff = new Date(windowStart);
  fetchCutoff.setMonth(fetchCutoff.getMonth() - 1);

  const bars = await prisma.twDailyPrice.findMany({
    where: { stockId: stock.id, tradeDate: { gte: fetchCutoff } },
    orderBy: { tradeDate: "asc" },
    select: { tradeDate: true, close: true },
  });
  if (bars.length === 0) return emptyResult(ticker, label);

  // 同一個月只留「最後一個交易日」的收盤價當月底收盤——bars 是 asc 排序，同月份後面的值會覆蓋前面
  const monthEndClose = new Map<string, number>(); // key = "YYYY-MM"
  for (const bar of bars) {
    monthEndClose.set(bar.tradeDate.toISOString().slice(0, 7), Number(bar.close));
  }

  // 本月還沒收月，排除掉，不然會把「月中到現在」的部分報酬誤當成整月報酬
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const sortedKeys = [...monthEndClose.keys()].sort().filter((k) => k !== currentMonthKey);

  const cells: MonthlyReturnCell[] = [];
  for (let i = 1; i < sortedKeys.length; i++) {
    const prevKey = sortedKeys[i - 1];
    const key = sortedKeys[i];
    if (key < windowStartKey) continue; // 緩衝月只借來算報酬用，本身不計入近10年樣本
    const [prevYear, prevMonth] = prevKey.split("-").map(Number);
    const [year, month] = key.split("-").map(Number);

    // 資料庫可能有缺月（API抓不到/漏抓），前後兩筆不是相鄰月份就跳過，避免跨缺口算出誤導性的報酬率
    const isAdjacent = (prevYear === year && prevMonth === month - 1) || (month === 1 && prevMonth === 12 && year === prevYear + 1);
    if (!isAdjacent) continue;

    const prevClose = monthEndClose.get(prevKey)!;
    const close = monthEndClose.get(key)!;
    if (prevClose <= 0) continue;

    cells.push({ year, month, returnPct: Math.round(((close - prevClose) / prevClose) * 10000) / 100 });
  }

  const byMonth = new Map<number, number[]>();
  for (const cell of cells) {
    const list = byMonth.get(cell.month) ?? [];
    list.push(cell.returnPct);
    byMonth.set(cell.month, list);
  }

  let cumulative = 0;
  const summary: MonthlySeasonalitySummary[] = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const values = byMonth.get(month) ?? [];
    if (values.length === 0) {
      return { month, avgReturnPct: null, medianReturnPct: null, winRatePct: null, sampleYears: 0, cumulativeAvgReturnPct: null };
    }
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    cumulative += avg;
    return {
      month,
      avgReturnPct: Math.round(avg * 100) / 100,
      medianReturnPct: Math.round(median(values) * 100) / 100,
      winRatePct: Math.round((values.filter((v) => v > 0).length / values.length) * 1000) / 10,
      sampleYears: values.length,
      cumulativeAvgReturnPct: Math.round(cumulative * 100) / 100,
    };
  });

  const years = [...new Set(cells.map((c) => c.year))].sort((a, b) => a - b);
  const windowedKeys = sortedKeys.filter((k) => k >= windowStartKey);

  return {
    ticker,
    label,
    cells,
    summary,
    years,
    dataFrom: windowedKeys[0] ?? null,
    dataTo: windowedKeys[windowedKeys.length - 1] ?? null,
  };
}
