import type { OhlcvBar } from "@/lib/trend/types";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export class TwseApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TwseApiError";
  }
}

/** 民國年月日字串（"115/07/02" 或 "1150702"）轉西元 YYYY-MM-DD */
function rocDateToIso(roc: string): string {
  const digits = roc.replace(/\//g, "");
  const rocYear = Number(digits.slice(0, digits.length - 4));
  const month = digits.slice(digits.length - 4, digits.length - 2);
  const day = digits.slice(digits.length - 2);
  const year = rocYear + 1911;
  return `${year}-${month}-${day}`;
}

/**
 * TWSE 數字欄位常帶千分位逗號、有時是空字串、null 或 "--"，
 * 偶爾同一個 API 在不同日期回傳的型別不一致（字串 vs 數字），這裡一律轉字串後再解析，防禦處理。
 */
function parseTwseNumber(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const cleaned = String(raw).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "--" || cleaned === "X0.00") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 政府網站偶爾會斷線/reset（ECONNRESET），單次失敗不該讓整支回填腳本直接崩潰，
 * 這裡對暫時性網路錯誤做指數退避重試；4xx/5xx HTTP 錯誤（非網路層錯誤）不重試，直接拋出。
 */
async function fetchJson<T>(url: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": BROWSER_USER_AGENT } });
      if (!res.ok) {
        throw new TwseApiError(`TWSE API HTTP ${res.status}: ${url}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (err instanceof TwseApiError || attempt === MAX_RETRIES) break;
      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
      console.warn(`  [twse] fetch failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms: ${url}`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

interface StockDayResponse {
  stat: string;
  data?: string[][];
}

/**
 * 個股單月日線（TWSE 上市股票專用，上櫃股票要用 TPEx 資料源，目前沒有歷史 API 可用）。
 * yyyymm 格式如 "202606"，會回傳當月所有交易日。
 */
export async function fetchStockDayMonth(stockNo: string, yyyymm: string): Promise<OhlcvBar[]> {
  const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${yyyymm}01&stockNo=${encodeURIComponent(stockNo)}`;
  const body = await fetchJson<StockDayResponse>(url);

  if (body.stat !== "OK" || !body.data) return [];

  return body.data
    .map((row) => {
      const [dateRaw, volumeRaw, , openRaw, highRaw, lowRaw, closeRaw] = row;
      const open = parseTwseNumber(openRaw);
      const high = parseTwseNumber(highRaw);
      const low = parseTwseNumber(lowRaw);
      const close = parseTwseNumber(closeRaw);
      const volume = parseTwseNumber(volumeRaw);
      if (open === null || high === null || low === null || close === null) return null;
      return {
        date: rocDateToIso(dateRaw),
        open,
        high,
        low,
        close,
        volume: volume ?? 0,
      } satisfies OhlcvBar;
    })
    .filter((bar): bar is OhlcvBar => bar !== null);
}

/**
 * 回填某檔上市股票最近 N 個月的日線（逐月呼叫 fetchStockDayMonth 並串接）。
 * 呼叫端要自己控制節流（TWSE 沒有公開明確 rate limit，但避免短時間內大量請求）。
 */
export async function fetchStockDayHistory(
  stockNo: string,
  months: number,
  throttle: () => Promise<void>,
  onProgress?: (monthIndex: number, totalMonths: number) => void
): Promise<OhlcvBar[]> {
  const now = new Date();
  const bars: OhlcvBar[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const yyyymm = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    await throttle();
    const monthBars = await fetchStockDayMonth(stockNo, yyyymm);
    bars.push(...monthBars);
    onProgress?.(months - i, months);
  }

  return bars.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

interface StockDayAllRow {
  Date: string;
  Code: string;
  OpeningPrice: string;
  HighestPrice: string;
  LowestPrice: string;
  ClosingPrice: string;
  TradeVolume: string;
}

/**
 * 當日全部上市股票行情快照（一次請求拿全部，用來做「今天」的每日增量更新，不用逐檔請求）。
 * 日期用 API 回傳的 `Date` 欄位（民國年），不能用系統當下時間貼標——假日/資料延遲時系統時間會跟
 * TWSE 實際交易日期對不上。
 */
export async function fetchAllStocksToday(): Promise<Map<string, OhlcvBar>> {
  const rows = await fetchJson<StockDayAllRow[]>("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL");
  const result = new Map<string, OhlcvBar>();

  for (const row of rows) {
    const open = parseTwseNumber(row.OpeningPrice);
    const high = parseTwseNumber(row.HighestPrice);
    const low = parseTwseNumber(row.LowestPrice);
    const close = parseTwseNumber(row.ClosingPrice);
    const volume = parseTwseNumber(row.TradeVolume);
    if (open === null || high === null || low === null || close === null) continue;
    result.set(row.Code, { date: rocDateToIso(row.Date), open, high, low, close, volume: volume ?? 0 });
  }
  return result;
}

export interface InstitutionalNetBuy {
  /** 外資+外資自營商合計買賣超（張，已從股數換算：1張=1000股） */
  foreignNetBuyShares: number;
  /** 投信買賣超（張） */
  investTrustNetBuyShares: number;
  /** 自營商買賣超（張，自行買賣+避險合計） */
  dealerNetBuyShares: number;
}

interface T86Response {
  stat: string;
  data?: string[][];
}

/**
 * 三大法人各股買賣超日報（T86），一次請求拿當天全部上市股票，用 Map 依代號查找。
 * dateStr 格式 "YYYYMMDD"（西元）。單位原始為股，這裡已換算成張（÷1000，四捨五入），
 * 對齊 spec 3.6「✅已確認：計算單位為張數」。
 */
export async function fetchInstitutionalTradingByDate(dateStr: string): Promise<Map<string, InstitutionalNetBuy>> {
  const url = `https://www.twse.com.tw/fund/T86?response=json&date=${dateStr}&selectType=ALL`;
  const body = await fetchJson<T86Response>(url);
  const result = new Map<string, InstitutionalNetBuy>();
  if (body.stat !== "OK" || !body.data) return result;

  for (const row of body.data) {
    // fields: 證券代號,證券名稱,外陸資買進,賣出,買賣超,外資自營商買進,賣出,買賣超,投信買進,賣出,買賣超,自營商買賣超合計,...
    const code = row[0]?.trim();
    if (!code) continue;
    const foreignNet = parseTwseNumber(row[4]) ?? 0;
    const foreignDealerNet = parseTwseNumber(row[7]) ?? 0;
    const investTrustNet = parseTwseNumber(row[10]) ?? 0;
    const dealerNet = parseTwseNumber(row[11]) ?? 0;

    result.set(code, {
      foreignNetBuyShares: Math.round((foreignNet + foreignDealerNet) / 1000),
      investTrustNetBuyShares: Math.round(investTrustNet / 1000),
      dealerNetBuyShares: Math.round(dealerNet / 1000),
    });
  }
  return result;
}

interface TaiexHistResponse {
  stat: string;
  data?: string[][];
}

/** 加權指數（TAIEX）單月歷史，欄位跟個股不同（沒有成交量），只取收盤指數當 ROC 計算用 */
async function fetchTaiexMonth(yyyymm: string): Promise<OhlcvBar[]> {
  const url = `https://www.twse.com.tw/indicesReport/MI_5MINS_HIST?response=json&date=${yyyymm}01`;
  const body = await fetchJson<TaiexHistResponse>(url);
  if (body.stat !== "OK" || !body.data) return [];

  return body.data
    .map((row) => {
      const [dateRaw, openRaw, highRaw, lowRaw, closeRaw] = row;
      const open = parseTwseNumber(openRaw);
      const high = parseTwseNumber(highRaw);
      const low = parseTwseNumber(lowRaw);
      const close = parseTwseNumber(closeRaw);
      if (open === null || high === null || low === null || close === null) return null;
      return { date: rocDateToIso(dateRaw), open, high, low, close, volume: 0 } satisfies OhlcvBar;
    })
    .filter((bar): bar is OhlcvBar => bar !== null);
}

/** 加權指數（TAIEX）最近 N 個月歷史，用法跟 fetchStockDayHistory 一樣 */
export async function fetchTaiexHistory(
  months: number,
  throttle: () => Promise<void>,
  onProgress?: (monthIndex: number, totalMonths: number) => void
): Promise<OhlcvBar[]> {
  const now = new Date();
  const bars: OhlcvBar[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const yyyymm = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    await throttle();
    const monthBars = await fetchTaiexMonth(yyyymm);
    bars.push(...monthBars);
    onProgress?.(months - i, months);
  }

  return bars.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

interface BwibbuRow {
  Date: string;
  Code: string;
  PEratio: string;
  DividendYield: string;
  PBratio: string;
}

export interface StockValuation {
  date: string;
  pe: number | null;
  pb: number | null;
  dividendYield: number | null;
}

/** 當日全部上市股票本益比/殖利率/股價淨值比快照，供應鏈估值比較（Module C）的 PE/PB 資料源 */
export async function fetchValuationAllToday(): Promise<Map<string, StockValuation>> {
  const rows = await fetchJson<BwibbuRow[]>("https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL");
  const result = new Map<string, StockValuation>();
  for (const row of rows) {
    result.set(row.Code, {
      date: rocDateToIso(row.Date),
      pe: parseTwseNumber(row.PEratio),
      pb: parseTwseNumber(row.PBratio),
      dividendYield: parseTwseNumber(row.DividendYield),
    });
  }
  return result;
}
