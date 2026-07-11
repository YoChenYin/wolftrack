const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { headers: { "User-Agent": BROWSER_USER_AGENT }, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`monthly revenue API HTTP ${res.status}: ${url}`);
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        console.error(`[monthlyRevenue] fetch failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying: ${url}`);
        await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
      }
    }
  }
  throw lastErr;
}

function parseNumber(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const cleaned = String(raw).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "--") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** "資料年月" 是民國年月無日，例如 "11505" = 民國115年05月 = 2026-05，回傳當月第一天 */
function rocYearMonthToIso(rocYearMonth: string): string {
  const digits = rocYearMonth.trim();
  const rocYear = Number(digits.slice(0, digits.length - 2));
  const month = digits.slice(digits.length - 2);
  const year = rocYear + 1911;
  return `${year}-${month}-01`;
}

interface MonthlyRevenueRow {
  資料年月: string;
  公司代號: string;
  "營業收入-當月營收": string;
  "營業收入-上月營收": string;
  "營業收入-去年當月營收": string;
  "營業收入-上月比較增減(%)": string;
  "營業收入-去年同月增減(%)": string;
  "累計營業收入-當月累計營收": string;
  "累計營業收入-去年累計營收": string;
  "累計營業收入-前期比較增減(%)": string;
}

export interface MonthlyRevenue {
  revenueMonth: string; // ISO date, 該月第一天
  revenue: number;
  revenuePriorMonth: number | null;
  revenueSameMonthLastYear: number | null;
  momGrowthPct: number | null;
  yoyGrowthPct: number | null;
  cumulativeRevenue: number | null;
  cumulativeRevenueLastYear: number | null;
  cumulativeYoyGrowthPct: number | null;
}

function rowsToMap(rows: MonthlyRevenueRow[]): Map<string, MonthlyRevenue> {
  const result = new Map<string, MonthlyRevenue>();
  for (const row of rows) {
    const revenue = parseNumber(row["營業收入-當月營收"]);
    if (revenue === null) continue; // 沒有當月營收的列（例如剛掛牌不久）跳過
    result.set(row.公司代號, {
      revenueMonth: rocYearMonthToIso(row.資料年月),
      revenue,
      revenuePriorMonth: parseNumber(row["營業收入-上月營收"]),
      revenueSameMonthLastYear: parseNumber(row["營業收入-去年當月營收"]),
      momGrowthPct: parseNumber(row["營業收入-上月比較增減(%)"]),
      yoyGrowthPct: parseNumber(row["營業收入-去年同月增減(%)"]),
      cumulativeRevenue: parseNumber(row["累計營業收入-當月累計營收"]),
      cumulativeRevenueLastYear: parseNumber(row["累計營業收入-去年累計營收"]),
      cumulativeYoyGrowthPct: parseNumber(row["累計營業收入-前期比較增減(%)"]),
    });
  }
  return result;
}

/**
 * TWSE 上市公司每月營業收入彙總表（t187ap05_L）+ TPEx 上櫃公司每月營業收入彙總表
 * （mopsfin_t187ap05_O），一次請求各拿全部公司「最新一期」資料（不能查歷史區間），
 * 兩邊回傳格式完全一樣，合併成一個 Map（key=股票代號）。
 */
export async function fetchAllMonthlyRevenue(): Promise<Map<string, MonthlyRevenue>> {
  const [twseRows, tpexRows] = await Promise.all([
    fetchJson<MonthlyRevenueRow[]>("https://openapi.twse.com.tw/v1/opendata/t187ap05_L"),
    fetchJson<MonthlyRevenueRow[]>("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O"),
  ]);
  const merged = rowsToMap(twseRows);
  for (const [ticker, revenue] of rowsToMap(tpexRows)) {
    merged.set(ticker, revenue);
  }
  return merged;
}
