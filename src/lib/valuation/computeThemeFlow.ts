import { prisma } from "@/lib/prisma";
import { getGroupConfig } from "./groupConfig";

export interface ThemeFlowSeries {
  category: string;
  /** 跟 dates 一一對應，累積報酬指數（第一天=100，之後每天是相對第一天的漲跌幅換算），null=當天沒有足夠成員資料 */
  values: (number | null)[];
}

export interface ThemeFlowResult {
  dates: string[];
  series: ThemeFlowSeries[];
}

/// 2026-07-16改版：原本固定只看20個交易日，改成顯示資料庫實際能撐到的最長時間——
/// 上限抓25個月（跟tw-backfill.ts的BACKFILL_MONTHS預設值一致，回填歷史最多就這麼長，
/// 抓更長也沒有意義），不再武斷地砍成20天。
const MAX_LOOKBACK_TRADING_DAYS = 600;
const MAX_LOOKBACK_CALENDAR_DAYS = 25 * 31; // 25個月，抓寬鬆一點的日曆天數涵蓋週末假日

/**
 * 「資金流動」折線圖用：以 group_config.json 的大分類（14個，比43個 theme 少很多，畫成折線圖才看得清楚）
 * 為單位，算每天的族群平均累積報酬指數（第一天=100），拿來看不同板塊這段期間誰漲得快、誰在退燒——
 * 板塊熱圖（computeThemeHeatmap.ts）是「現在」的單點快照，這個是「這段期間」的時間序列。
 */
export async function computeThemeFlow(): Promise<ThemeFlowResult> {
  const config = getGroupConfig();

  const tickerToCategories = new Map<string, Set<string>>();
  for (const [category, themes] of Object.entries(config.industry_concepts)) {
    for (const theme of themes) {
      for (const ticker of theme.members) {
        const set = tickerToCategories.get(ticker) ?? new Set<string>();
        set.add(category);
        tickerToCategories.set(ticker, set);
      }
    }
  }
  const allTickers = [...tickerToCategories.keys()];

  const stocks = await prisma.stock.findMany({
    where: { market: "TW", ticker: { in: allTickers } },
    select: { id: true, ticker: true },
  });
  const categoriesByStockId = new Map(stocks.map((s) => [s.id, tickerToCategories.get(s.ticker) ?? new Set<string>()]));

  const cutoff = new Date(Date.now() - MAX_LOOKBACK_CALENDAR_DAYS * 86_400_000);
  const priceRows = await prisma.twDailyPrice.findMany({
    where: { stockId: { in: stocks.map((s) => s.id) }, tradeDate: { gte: cutoff } },
    orderBy: [{ stockId: "asc" }, { tradeDate: "asc" }],
    select: { stockId: true, tradeDate: true, close: true },
  });

  const barsByStockId = new Map<number, { date: string; close: number }[]>();
  for (const row of priceRows) {
    const list = barsByStockId.get(row.stockId) ?? [];
    list.push({ date: row.tradeDate.toISOString().slice(0, 10), close: Number(row.close) });
    barsByStockId.set(row.stockId, list);
  }
  for (const list of barsByStockId.values()) {
    if (list.length > MAX_LOOKBACK_TRADING_DAYS + 1) list.splice(0, list.length - (MAX_LOOKBACK_TRADING_DAYS + 1));
  }

  // 用最長的那一檔股票的交易日當作 x 軸日期骨架（TWSE 全市場共用同一套交易日曆，理論上都一樣長）
  let dates: string[] = [];
  for (const list of barsByStockId.values()) {
    if (list.length > dates.length) dates = list.map((b) => b.date);
  }

  const categories = Object.keys(config.industry_concepts);
  const series: ThemeFlowSeries[] = categories.map((category) => {
    const values: (number | null)[] = dates.map((date) => {
      const ratios: number[] = [];
      for (const [stockId, cats] of categoriesByStockId) {
        if (!cats.has(category)) continue;
        const bars = barsByStockId.get(stockId);
        if (!bars || bars.length === 0) continue;
        const base = bars[0].close;
        const bar = bars.find((b) => b.date === date);
        if (!bar || base === 0) continue;
        ratios.push((bar.close / base) * 100);
      }
      if (ratios.length === 0) return null;
      return Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100) / 100;
    });
    return { category, values };
  });

  return { dates, series };
}
