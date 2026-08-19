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
      if (!res.ok) throw new Error(`quarterly EPS API HTTP ${res.status}: ${url}`);
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        console.error(`[quarterlyEps] fetch failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying: ${url}`);
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

/** "出表日期"/"Date" 是民國年月日，例如 "1150818" = 民國115年08月18日 */
function rocDateToIso(rocDate: string): string {
  const digits = rocDate.trim();
  const rocYear = Number(digits.slice(0, digits.length - 4));
  const month = digits.slice(digits.length - 4, digits.length - 2);
  const day = digits.slice(digits.length - 2);
  return `${rocYear + 1911}-${month}-${day}`;
}

export interface QuarterlyEps {
  fiscalYear: number;
  fiscalQuarter: number;
  reportDate: string; // ISO date
  epsCumulative: number;
}

/** 上市（t187ap14_L）用全中文欄位，上櫃（mopsfin_t187ap14_O）中英文混用（"Date"/"Year"/"SecuritiesCompanyCode"
 * 是英文，"季別"/"基本每股盈餘"還是中文）——兩邊資料語意完全一樣，只是欄位命名不同，各自轉成同一個介面 */
interface TwseRow {
  出表日期: string;
  年度: string;
  季別: string;
  公司代號: string;
  "基本每股盈餘(元)": string;
}

interface TpexRow {
  Date: string;
  Year: string;
  季別: string;
  SecuritiesCompanyCode: string;
  基本每股盈餘: string;
}

function rowsToMap(rows: TwseRow[] | TpexRow[], source: "twse" | "tpex"): Map<string, QuarterlyEps> {
  const result = new Map<string, QuarterlyEps>();
  for (const row of rows) {
    const isTwse = source === "twse";
    const ticker = isTwse ? (row as TwseRow).公司代號 : (row as TpexRow).SecuritiesCompanyCode;
    const reportDateRaw = isTwse ? (row as TwseRow).出表日期 : (row as TpexRow).Date;
    const yearRaw = isTwse ? (row as TwseRow).年度 : (row as TpexRow).Year;
    const epsRaw = isTwse ? (row as TwseRow)["基本每股盈餘(元)"] : (row as TpexRow).基本每股盈餘;
    const eps = parseNumber(epsRaw);
    if (eps === null) continue; // 虧損公司也會有負值，只有真的缺資料（"--"）才跳過

    result.set(ticker, {
      fiscalYear: Number(yearRaw) + 1911,
      fiscalQuarter: Number(row.季別),
      reportDate: rocDateToIso(reportDateRaw),
      epsCumulative: eps,
    });
  }
  return result;
}

/**
 * TWSE 上市公司季別綜合損益表彙總表（t187ap14_L）+ TPEx 上櫃公司季別綜合損益表彙總表
 * （mopsfin_t187ap14_O），一次請求各拿全部公司「最新一期」資料（不能查歷史區間），
 * 兩邊回傳格式不同（見TwseRow/TpexRow），各自轉換後合併成一個 Map（key=股票代號）。
 */
export async function fetchAllQuarterlyEps(): Promise<Map<string, QuarterlyEps>> {
  const [twseRows, tpexRows] = await Promise.all([
    fetchJson<TwseRow[]>("https://openapi.twse.com.tw/v1/opendata/t187ap14_L"),
    fetchJson<TpexRow[]>("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap14_O"),
  ]);
  const merged = rowsToMap(twseRows, "twse");
  for (const [ticker, eps] of rowsToMap(tpexRows, "tpex")) {
    merged.set(ticker, eps);
  }
  return merged;
}
