/**
 * 台灣期貨交易所（TAIFEX）公開 open API，免金鑰：https://openapi.taifex.com.tw
 * 用來抓台指期(TX)近月合約行情跟台指選擇權Put/Call比，給總經延伸的「台指期」頁面用。
 *
 * ⚠️這組API目前實測都只回傳「最新一天」的快照（PutCallRatio例外，見下方說明），沒有historical
 * range查詢參數，沒辦法像TWSE STOCK_DAY那樣一次回填過去幾年——只能每天排程呼叫、逐日累積歷史
 * （見 runTaifexDailyUpdate.ts）。
 */
const TAIFEX_BASE_URL = "https://openapi.taifex.com.tw/v1";

interface FuturesReportRow {
  Date: string; // YYYYMMDD
  Contract: string;
  "ContractMonth(Week)": string;
  Open: string;
  High: string;
  Low: string;
  Last: string;
  SettlementPrice: string;
  Volume: string;
  OpenInterest: string;
  TradingSession: string; // "一般" | "盤後"
}

export interface TaifexFuturesBar {
  date: string; // YYYY-MM-DD
  contractMonth: string;
  open: number;
  high: number;
  low: number;
  close: number;
  settlementPrice: number | null;
  volume: number;
  openInterest: number;
}

function rocToIso(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function parseNum(raw: string | undefined): number | null {
  if (raw === undefined || raw === "" || raw === "-" || raw === "NULL") return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * 台指期(TX)近月合約最新一天的一般盤行情（不含盤後盤）。ContractMonth(Week) 用字串排序取
 * 最小值＝離現在最近的月份合約，這是市場上「近月」的定義（原始資料本身已經是照這個順序排列，
 * 這裡额外排序一次是為了不依賴API回傳順序的隱性假設）。
 */
export async function fetchTaifexFrontMonthFutures(contract = "TX"): Promise<TaifexFuturesBar | null> {
  const res = await fetch(`${TAIFEX_BASE_URL}/DailyMarketReportFut`);
  if (!res.ok) {
    throw new Error(`[taifex] DailyMarketReportFut HTTP ${res.status}`);
  }
  const rows = (await res.json()) as FuturesReportRow[];
  const candidates = rows.filter((r) => r.Contract === contract && r.TradingSession === "一般");
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a["ContractMonth(Week)"].localeCompare(b["ContractMonth(Week)"]));
  const front = candidates[0];

  const open = parseNum(front.Open);
  const high = parseNum(front.High);
  const low = parseNum(front.Low);
  const close = parseNum(front.Last);
  const volume = parseNum(front.Volume);
  const openInterest = parseNum(front.OpenInterest);
  if (open === null || high === null || low === null || close === null || volume === null || openInterest === null) {
    return null;
  }

  return {
    date: rocToIso(front.Date),
    contractMonth: front["ContractMonth(Week)"],
    open,
    high,
    low,
    close,
    settlementPrice: parseNum(front.SettlementPrice),
    volume,
    openInterest,
  };
}

interface PutCallRatioRow {
  Date: string;
  PutVolume: string;
  CallVolume: string;
  "PutCallVolumeRatio%": string;
  PutOI: string;
  CallOI: string;
  "PutCallOIRatio%": string;
}

export interface TaifexPutCallRatioDay {
  date: string; // YYYY-MM-DD
  putVolume: number;
  callVolume: number;
  putCallVolumeRatioPct: number;
  putOpenInterest: number;
  callOpenInterest: number;
  putCallOiRatioPct: number;
}

/** 臺指選擇權 Put/Call 比：這支API本身就回傳約一個月的歷史範圍（不是只有今天），每天呼叫upsert會自然疊出更長歷史 */
export async function fetchTaifexPutCallRatio(): Promise<TaifexPutCallRatioDay[]> {
  const res = await fetch(`${TAIFEX_BASE_URL}/PutCallRatio`);
  if (!res.ok) {
    throw new Error(`[taifex] PutCallRatio HTTP ${res.status}`);
  }
  const rows = (await res.json()) as PutCallRatioRow[];

  return rows
    .map((row) => {
      const putVolume = parseNum(row.PutVolume);
      const callVolume = parseNum(row.CallVolume);
      const putCallVolumeRatioPct = parseNum(row["PutCallVolumeRatio%"]);
      const putOpenInterest = parseNum(row.PutOI);
      const callOpenInterest = parseNum(row.CallOI);
      const putCallOiRatioPct = parseNum(row["PutCallOIRatio%"]);
      if (
        putVolume === null ||
        callVolume === null ||
        putCallVolumeRatioPct === null ||
        putOpenInterest === null ||
        callOpenInterest === null ||
        putCallOiRatioPct === null
      ) {
        return null;
      }
      return {
        date: rocToIso(row.Date),
        putVolume,
        callVolume,
        putCallVolumeRatioPct,
        putOpenInterest,
        callOpenInterest,
        putCallOiRatioPct,
      };
    })
    .filter((row): row is TaifexPutCallRatioDay => row !== null);
}
