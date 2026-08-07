import { prisma } from "@/lib/prisma";
import { fetchFredSeries } from "./fredClient";

/**
 * Decision Lab（總經頁，見 docs/decision-lab-prd.html Module 1/3）全球市場 + 波動度參考序列。
 * 全部走 FRED（免金鑰），跟 SP500 用同一套模式——一次請求拿回整段可回溯歷史，upsert 進
 * tw_daily_price（沿用 TAIEX/TPEX/SPX 的合成股票模式，這幾檔也不是任何可交易商品）。
 *
 * FRED 只給每日單一收盤值，沒有OHLC，四個價格欄位都存同一個值、volume=0（跟 backfill-sp500-history.ts
 * 一致）。因為每次呼叫都拿完整歷史範圍，這支函式同時是「一次性回填」跟「每日更新」——不用分開兩支腳本。
 *
 * ⚠️GOLD 沒有列在這裡：FRED 的金價序列（GOLDAMGBD228NLBM/GOLDPMGBD228NLBM/WGOLDUSD）
 * 這次實測都已經停用（回傳HTML不是CSV），需要另尋資料源，見 docs/decision-lab-prd.html 第14節。
 */
export const GLOBAL_MACRO_SERIES: { ticker: string; fredSeriesId: string; label: string }[] = [
  { ticker: "SPX", fredSeriesId: "SP500", label: "S&P 500" },
  { ticker: "IXIC", fredSeriesId: "NASDAQCOM", label: "NASDAQ Composite" },
  { ticker: "DJI", fredSeriesId: "DJIA", label: "Dow Jones" },
  { ticker: "BTC", fredSeriesId: "CBBTCUSD", label: "Bitcoin" },
  { ticker: "WTI", fredSeriesId: "DCOILWTICO", label: "WTI原油" },
  { ticker: "DXY", fredSeriesId: "DTWEXBGS", label: "美元指數" },
  { ticker: "US10Y", fredSeriesId: "DGS10", label: "美債10年期殖利率" },
  { ticker: "US2Y", fredSeriesId: "DGS2", label: "美債2年期殖利率" },
  { ticker: "VIX", fredSeriesId: "VIXCLS", label: "VIX恐慌指數" },
];

export interface GlobalMacroSyncResult {
  ticker: string;
  written: number;
  error?: string;
}

/** 同步單一序列：抓 FRED 完整歷史 → upsert 進 tw_daily_price。單一序列失敗不影響其他序列（各自獨立try/catch）。 */
async function syncOneSeries(ticker: string, fredSeriesId: string): Promise<GlobalMacroSyncResult> {
  const stock = await prisma.stock.findUnique({ where: { market_ticker: { market: "US", ticker } } });
  if (!stock) return { ticker, written: 0, error: `找不到 ${ticker} 合成股票紀錄，先跑 prisma db seed` };

  try {
    const observations = await fetchFredSeries(fredSeriesId);
    let written = 0;
    for (const obs of observations) {
      await prisma.twDailyPrice.upsert({
        where: { stockId_tradeDate: { stockId: stock.id, tradeDate: new Date(obs.date) } },
        update: { open: obs.value, high: obs.value, low: obs.value, close: obs.value },
        create: {
          stockId: stock.id,
          tradeDate: new Date(obs.date),
          open: obs.value,
          high: obs.value,
          low: obs.value,
          close: obs.value,
          volume: BigInt(0),
        },
      });
      written++;
    }
    return { ticker, written };
  } catch (err) {
    return { ticker, written: 0, error: (err as Error).message };
  }
}

/** 同步 GLOBAL_MACRO_SERIES 裡所有序列，回填腳本跟每日排程都呼叫這支（見說明，兩者是同一支函式）。 */
export async function syncGlobalMacroSeries(): Promise<GlobalMacroSyncResult[]> {
  const results: GlobalMacroSyncResult[] = [];
  for (const series of GLOBAL_MACRO_SERIES) {
    results.push(await syncOneSeries(series.ticker, series.fredSeriesId));
  }
  return results;
}
