import type { OhlcvBar } from "@/lib/trend/types";

/**
 * FinMind（開源金融資料 API，https://finmindtrade.com）：TWSE 官方 API 沒有涵蓋上櫃（TPEx）
 * 個股歷史資料，TPEx 自己的 OpenAPI 也只有「當日快照」沒有日期區間查詢能力（見
 * scripts/tw-backfill.ts 的說明）。FinMind 的 TaiwanStockPrice / TaiwanStockInstitutionalInvestorsBuySell
 * 資料集同時涵蓋上市+上櫃+興櫃，且支援「一檔股票、任意日期區間」單次請求（不像 TWSE STOCK_DAY
 * 要逐月請求），只用來補上櫃股這塊缺口，不動現有 TWSE 上市股的抓取邏輯。
 * 免費不需 token：300 次/小時；官網說明註冊後可提升到 600 次/小時。
 */
const FINMIND_BASE_URL = "https://api.finmindtrade.com/api/v4/data";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

interface FinMindResponse<T> {
  msg: string;
  status: number;
  data: T[];
}

interface FinMindStockPriceRow {
  date: string;
  stock_id: string;
  Trading_Volume: number;
  Trading_money: number;
  open: number;
  max: number;
  min: number;
  close: number;
  spread: number;
  Trading_turnover: number;
}

interface FinMindInstitutionalRow {
  date: string;
  stock_id: string;
  buy: number;
  sell: number;
  name: "Foreign_Investor" | "Foreign_Dealer_Self" | "Dealer_self" | "Dealer_Hedging" | "Investment_Trust";
}

export interface FinMindInstitutionalNet {
  /** 三大法人買賣超（張），跟 twseClient.ts 的 T86 解析單位一致（原始股數 ÷ 1000） */
  foreignNetBuyShares: number;
  investTrustNetBuyShares: number;
  dealerNetBuyShares: number;
}

async function fetchWithRetry(url: string): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      lastErr = err as Error;
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * attempt;
        console.error(`[finmind] fetch failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms: ${url}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastErr ?? new Error("[finmind] fetch failed with no error captured");
}

/**
 * 抓一檔股票的歷史日線 OHLCV（涵蓋上市/上櫃/興櫃），一次請求就是整個日期區間，
 * 不像 TWSE STOCK_DAY 要逐月請求。
 */
export async function fetchFinMindStockPrice(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<OhlcvBar[]> {
  const url = `${FINMIND_BASE_URL}?dataset=TaiwanStockPrice&data_id=${encodeURIComponent(ticker)}&start_date=${startDate}&end_date=${endDate}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`[finmind] TaiwanStockPrice HTTP ${res.status} for ${ticker}`);
  }
  const body = (await res.json()) as FinMindResponse<FinMindStockPriceRow>;
  if (body.status !== 200) {
    throw new Error(`[finmind] TaiwanStockPrice error for ${ticker}: ${body.msg}`);
  }
  return body.data.map((row) => ({
    date: row.date,
    open: row.open,
    high: row.max,
    low: row.min,
    close: row.close,
    volume: row.Trading_Volume,
  }));
}

/**
 * 抓一檔股票的三大法人買賣超歷史（一次請求整個日期區間）。FinMind 回傳的是原始股數的
 * buy/sell 分項（Foreign_Investor + Foreign_Dealer_Self 算外資、Dealer_self + Dealer_Hedging
 * 算自營商），跟 twseClient.ts 的 T86 解析邏輯對齊，換算成張（÷1000）存進同一張表。
 */
export async function fetchFinMindInstitutionalTrading(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<Map<string, FinMindInstitutionalNet>> {
  const url = `${FINMIND_BASE_URL}?dataset=TaiwanStockInstitutionalInvestorsBuySell&data_id=${encodeURIComponent(ticker)}&start_date=${startDate}&end_date=${endDate}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`[finmind] TaiwanStockInstitutionalInvestorsBuySell HTTP ${res.status} for ${ticker}`);
  }
  const body = (await res.json()) as FinMindResponse<FinMindInstitutionalRow>;
  if (body.status !== 200) {
    throw new Error(`[finmind] TaiwanStockInstitutionalInvestorsBuySell error for ${ticker}: ${body.msg}`);
  }

  const byDate = new Map<string, { foreign: number; investTrust: number; dealer: number }>();
  for (const row of body.data) {
    const entry = byDate.get(row.date) ?? { foreign: 0, investTrust: 0, dealer: 0 };
    const net = row.buy - row.sell;
    if (row.name === "Foreign_Investor" || row.name === "Foreign_Dealer_Self") {
      entry.foreign += net;
    } else if (row.name === "Dealer_self" || row.name === "Dealer_Hedging") {
      entry.dealer += net;
    } else if (row.name === "Investment_Trust") {
      entry.investTrust += net;
    }
    byDate.set(row.date, entry);
  }

  const result = new Map<string, FinMindInstitutionalNet>();
  for (const [date, entry] of byDate) {
    result.set(date, {
      foreignNetBuyShares: Math.round(entry.foreign / 1000),
      investTrustNetBuyShares: Math.round(entry.investTrust / 1000),
      dealerNetBuyShares: Math.round(entry.dealer / 1000),
    });
  }
  return result;
}

interface FinMindPerRow {
  date: string;
  stock_id: string;
  dividend_yield: number;
  PER: number;
  PBR: number;
}

export interface FinMindValuation {
  date: string;
  pe: number;
  pb: number;
  dividendYield: number;
}

/**
 * TWSE 官方 `BWIBBU_ALL`（見 twseClient.ts）沒有上櫃股，只用來補上櫃股 PE/PB 這塊缺口，
 * 只抓最近幾天取最新一筆即可（不像回填需要整段歷史）。
 */
export async function fetchFinMindLatestValuation(ticker: string): Promise<FinMindValuation | null> {
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const url = `${FINMIND_BASE_URL}?dataset=TaiwanStockPER&data_id=${encodeURIComponent(ticker)}&start_date=${startDate}&end_date=${endDate}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`[finmind] TaiwanStockPER HTTP ${res.status} for ${ticker}`);
  }
  const body = (await res.json()) as FinMindResponse<FinMindPerRow>;
  if (body.status !== 200) {
    throw new Error(`[finmind] TaiwanStockPER error for ${ticker}: ${body.msg}`);
  }
  const latest = body.data[body.data.length - 1];
  if (!latest) return null;
  return { date: latest.date, pe: latest.PER, pb: latest.PBR, dividendYield: latest.dividend_yield };
}
