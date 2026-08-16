import { prisma } from "@/lib/prisma";
import { getChain, getChainStagesWithThemes } from "./groupConfig";
import { calculateChipConcentration } from "@/lib/trend/tw/chipConcentration";
import type { InstitutionalDay } from "@/lib/trend/tw/chipScore";

export interface ChainRotationStageSeries {
  stageKey: string;
  label: string;
  /** 跟 dates 一一對應，這個階段的族群平均累積報酬指數（起點=100），算法跟computeThemeFlow
   * 的category級別一致，差別是這裡是「單一產業鏈裡的上中下游」而不是「跨鏈的14大分類」 */
  values: (number | null)[];
  /** 最新一天的族群平均籌碼集中度(5日，投信+外資買超佔量能比例)，null=沒有籌碼資料。
   * 只取最新一天不是整段時間序列——這裡要回答的是「現在」哪個階段動能+籌碼同步轉強，
   * 不是籌碼集中度本身的歷史走勢（那是ThemeHeatmap在做的事） */
  latestConcentration5d: number | null;
}

export interface ChainRotationResult {
  chainName: string;
  chainNameFull: string;
  dates: string[];
  stages: ChainRotationStageSeries[];
}

/** 6個月抓寬鬆一點，比computeThemeFlow的25個月短很多——這裡要看的是「最近的輪動」，
 * 不是長期歷史，時間軸太長反而看不出「這幾週資金往哪個階段移動」的輪動軌跡 */
const LOOKBACK_TRADING_DAYS = 120;
const LOOKBACK_CALENDAR_DAYS = 6 * 31 + 10;

/**
 * 產業鏈資金輪動（2026-08-16）：把computeThemeFlow「族群平均累積報酬時間序列」的算法，
 * 套用到「單一產業鏈的上中下游階段」而不是「跨鏈的14大分類」——這是ChainSignalLights
 * （單點snapshot）、ThemeFlowChart（跨鏈但不分階段）、ThemeHeatmap（單點snapshot表格）
 * 三個現有元件都做不到的視角：同一條鏈的上游/中游/下游資金這幾個月怎麼輪動。
 * 疊加最新籌碼集中度，讓「動能轉強」跟「籌碼同步轉強」能一起看。
 */
export async function computeChainRotation(chainName: string): Promise<ChainRotationResult | null> {
  const chain = getChain(chainName);
  const stagesWithThemes = getChainStagesWithThemes(chainName);
  if (!chain || !stagesWithThemes) return null;

  const stageTickerLists = stagesWithThemes.map((s) => ({
    stageKey: s.stageKey,
    label: s.label,
    tickers: [...new Set(s.themes.flatMap((t) => t.members))],
  }));
  const allTickers = [...new Set(stageTickerLists.flatMap((s) => s.tickers))];

  const stocks = await prisma.stock.findMany({
    where: { market: "TW", ticker: { in: allTickers } },
    select: { id: true, ticker: true },
  });
  const stockIdByTicker = new Map(stocks.map((s) => [s.ticker, s.id]));
  const stockIds = stocks.map((s) => s.id);

  const cutoff = new Date(Date.now() - LOOKBACK_CALENDAR_DAYS * 86_400_000);
  const priceRows = await prisma.twDailyPrice.findMany({
    where: { stockId: { in: stockIds }, tradeDate: { gte: cutoff } },
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
    if (list.length > LOOKBACK_TRADING_DAYS + 1) list.splice(0, list.length - (LOOKBACK_TRADING_DAYS + 1));
  }

  let dates: string[] = [];
  for (const list of barsByStockId.values()) {
    if (list.length > dates.length) dates = list.map((b) => b.date);
  }

  const institutionalRows = await prisma.twInstitutionalTrading.findMany({
    where: { stockId: { in: stockIds }, tradeDate: { gte: cutoff } },
    orderBy: [{ stockId: "asc" }, { tradeDate: "asc" }],
    select: {
      stockId: true,
      tradeDate: true,
      foreignNetBuyShares: true,
      investTrustNetBuyShares: true,
      dealerNetBuyShares: true,
      totalVolumeShares: true,
    },
  });
  const institutionalDaysByStockId = new Map<number, InstitutionalDay[]>();
  for (const row of institutionalRows) {
    const list = institutionalDaysByStockId.get(row.stockId) ?? [];
    list.push({
      date: row.tradeDate.toISOString().slice(0, 10),
      foreignNetBuyShares: Number(row.foreignNetBuyShares),
      investTrustNetBuyShares: Number(row.investTrustNetBuyShares),
      dealerNetBuyShares: Number(row.dealerNetBuyShares),
      totalVolumeShares: Number(row.totalVolumeShares),
    });
    institutionalDaysByStockId.set(row.stockId, list);
  }

  const stages: ChainRotationStageSeries[] = stageTickerLists.map(({ stageKey, label, tickers }) => {
    const tickerStockIds = tickers.map((t) => stockIdByTicker.get(t)).filter((id): id is number => id !== undefined);

    const values: (number | null)[] = dates.map((date) => {
      const ratios: number[] = [];
      for (const stockId of tickerStockIds) {
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

    const concentrations = tickerStockIds
      .map((id) => institutionalDaysByStockId.get(id))
      .filter((days): days is InstitutionalDay[] => days !== undefined && days.length > 0)
      .map((days) => calculateChipConcentration(days).concentration5);
    const latestConcentration5d =
      concentrations.length > 0 ? Math.round((concentrations.reduce((a, b) => a + b, 0) / concentrations.length) * 100) / 100 : null;

    return { stageKey, label, values, latestConcentration5d };
  });

  return { chainName, chainNameFull: chain.chainNameFull, dates, stages };
}
