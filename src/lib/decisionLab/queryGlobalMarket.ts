import { prisma } from "@/lib/prisma";
import type { OhlcvBar } from "@/lib/trend/types";
import { GLOBAL_MACRO_SERIES } from "@/lib/marketData/globalMacroSeries";
import type { GlobalMarketEntry } from "./types";

export interface GlobalMarketData {
  entries: GlobalMarketEntry[];
  spxBars: OhlcvBar[];
  vixCloses: number[];
}

/** 取每個序列最近300筆(asc排序)，today entry算日漲跌%（FRED只有單一值，沒有真正的開盤跳空，gapPct留null） */
export async function queryGlobalMarketData(): Promise<GlobalMarketData> {
  const entries: GlobalMarketEntry[] = [];
  let spxBars: OhlcvBar[] = [];
  let vixCloses: number[] = [];

  for (const series of GLOBAL_MACRO_SERIES) {
    const stock = await prisma.stock.findUnique({ where: { market_ticker: { market: "US", ticker: series.ticker } } });
    if (!stock) continue;

    const rows = await prisma.twDailyPrice.findMany({
      where: { stockId: stock.id },
      orderBy: { tradeDate: "asc" },
      take: -300,
    });
    if (rows.length === 0) continue;

    const closes = rows.map((r) => Number(r.close));
    const last = closes.length - 1;
    const changePct = last >= 1 ? ((closes[last] - closes[last - 1]) / closes[last - 1]) * 100 : null;

    entries.push({ ticker: series.ticker, label: series.label, close: closes[last], changePct, gapPct: null });

    if (series.ticker === "SPX") {
      spxBars = rows.map((r) => ({
        date: r.tradeDate.toISOString().slice(0, 10),
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        volume: Number(r.volume),
      }));
    }
    if (series.ticker === "VIX") {
      vixCloses = closes;
    }
  }

  return { entries, spxBars, vixCloses };
}
