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

/** 營收接近0的公司，毛利率等比率算出來會是幾千%甚至負幾萬%這種除以極小分母的雜訊
 * （實測過，不是假設），不是真實的獲利能力數字，直接當缺資料處理，不要存進DB
 * （DECIMAL(6,2)欄位本身也存不下這種離群值，但真正的理由是這種數字沒有business意義） */
const MAX_SANE_MARGIN_PCT = 1000;

function parseMarginPct(raw: unknown): number | null {
  const n = parseNumber(raw);
  if (n === null || Math.abs(n) > MAX_SANE_MARGIN_PCT) return null;
  return n;
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
  /** 毛利率/營業利益率/稅前純益率/稅後純益率(%)，來源另一個端點（t187ap17系列），
   * 涵蓋率不如EPS端點，查無資料的公司/期別維持undefined */
  grossMarginPct?: number;
  operatingMarginPct?: number;
  pretaxMarginPct?: number;
  netMarginPct?: number;
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

/** 毛利率等比率端點（t187ap17系列）：上市全中文欄位，上櫃中英文混用，跟EPS端點同樣的
 * 命名風格差異，但欄位語意各自獨立命名（不是"公司代號"/"SecuritiesCompanyCode"這種
 * 對應關係），分開宣告介面 */
interface TwseMarginRow {
  公司代號: string;
  "毛利率(%)(營業毛利)/(營業收入)": string;
  "營業利益率(%)(營業利益)/(營業收入)": string;
  "稅前純益率(%)(稅前純益)/(營業收入)": string;
  "稅後純益率(%)(稅後純益)/(營業收入)": string;
}

interface TpexMarginRow {
  SecuritiesCompanyCode: string;
  毛利率: string;
  營業利益率: string;
  稅前純益率: string;
  稅後純益率: string;
}

interface MarginRatios {
  grossMarginPct: number | null;
  operatingMarginPct: number | null;
  pretaxMarginPct: number | null;
  netMarginPct: number | null;
}

function marginRowsToMap(rows: TwseMarginRow[] | TpexMarginRow[], source: "twse" | "tpex"): Map<string, MarginRatios> {
  const result = new Map<string, MarginRatios>();
  for (const row of rows) {
    const isTwse = source === "twse";
    const ticker = isTwse ? (row as TwseMarginRow).公司代號 : (row as TpexMarginRow).SecuritiesCompanyCode;
    result.set(ticker, isTwse
      ? {
          grossMarginPct: parseMarginPct((row as TwseMarginRow)["毛利率(%)(營業毛利)/(營業收入)"]),
          operatingMarginPct: parseMarginPct((row as TwseMarginRow)["營業利益率(%)(營業利益)/(營業收入)"]),
          pretaxMarginPct: parseMarginPct((row as TwseMarginRow)["稅前純益率(%)(稅前純益)/(營業收入)"]),
          netMarginPct: parseMarginPct((row as TwseMarginRow)["稅後純益率(%)(稅後純益)/(營業收入)"]),
        }
      : {
          grossMarginPct: parseMarginPct((row as TpexMarginRow).毛利率),
          operatingMarginPct: parseMarginPct((row as TpexMarginRow).營業利益率),
          pretaxMarginPct: parseMarginPct((row as TpexMarginRow).稅前純益率),
          netMarginPct: parseMarginPct((row as TpexMarginRow).稅後純益率),
        });
  }
  return result;
}

/**
 * TWSE 上市公司季別綜合損益表彙總表（t187ap14_L + t187ap17_L）+ TPEx 上櫃公司季別彙總表
 * （mopsfin_t187ap14_O + mopsfin_187ap17_O），一次請求各拿全部公司「最新一期」資料
 * （不能查歷史區間），四個端點各自轉換後以股票代號合併成一個 Map。EPS跟毛利率是MOPS的
 * 兩份不同報表（涵蓋率不完全一樣），毛利率查無資料時對應欄位維持undefined，不影響EPS本身。
 */
export async function fetchAllQuarterlyEps(): Promise<Map<string, QuarterlyEps>> {
  const [twseRows, tpexRows, twseMarginRows, tpexMarginRows] = await Promise.all([
    fetchJson<TwseRow[]>("https://openapi.twse.com.tw/v1/opendata/t187ap14_L"),
    fetchJson<TpexRow[]>("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap14_O"),
    fetchJson<TwseMarginRow[]>("https://openapi.twse.com.tw/v1/opendata/t187ap17_L"),
    fetchJson<TpexMarginRow[]>("https://www.tpex.org.tw/openapi/v1/mopsfin_187ap17_O"),
  ]);

  const merged = rowsToMap(twseRows, "twse");
  for (const [ticker, eps] of rowsToMap(tpexRows, "tpex")) {
    merged.set(ticker, eps);
  }

  const marginByTicker = marginRowsToMap(twseMarginRows, "twse");
  for (const [ticker, margin] of marginRowsToMap(tpexMarginRows, "tpex")) {
    marginByTicker.set(ticker, margin);
  }
  for (const [ticker, eps] of merged) {
    const margin = marginByTicker.get(ticker);
    if (!margin) continue;
    if (margin.grossMarginPct !== null) eps.grossMarginPct = margin.grossMarginPct;
    if (margin.operatingMarginPct !== null) eps.operatingMarginPct = margin.operatingMarginPct;
    if (margin.pretaxMarginPct !== null) eps.pretaxMarginPct = margin.pretaxMarginPct;
    if (margin.netMarginPct !== null) eps.netMarginPct = margin.netMarginPct;
  }

  return merged;
}
