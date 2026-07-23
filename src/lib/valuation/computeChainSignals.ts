import { prisma } from "@/lib/prisma";
import { getChain, getChainStagesWithThemes } from "./groupConfig";

/** 點開階段燈號後要看的個別成員股票明細 */
export interface ChainStageMember {
  ticker: string;
  companyName: string;
  /** 最新一筆（7天內）戰術狀態，null=目前沒有訊號 */
  status: string | null;
  /** 近5日報酬(%)，null=沒有足夠股價資料 */
  return5d: number | null;
}

export interface ChainStageSignal {
  stageKey: string;
  label: string;
  /** 這個階段涵蓋的不重複股票數（跨底下所有 theme 聯集） */
  memberCount: number;
  /** 有訊號（daily_trend_signals裡任何status，"none"永遠不會寫入DB）的股票數 / memberCount */
  signalRate: number;
  /** 有訊號的股票裡，各狀態各幾檔 */
  statusBreakdown: Record<string, number>;
  /** 近5日族群平均報酬(%)，null=沒有足夠股價資料 */
  avgReturn5d: number | null;
  /** 有股價資料的成員裡，近5日上漲/下跌的檔數——直接反映族群漲跌分布，不像avgReturn5d
   * 被少數幾檔大漲/大跌拉走平均，也不像signalRate只看技術面設定、不看實際漲跌方向 */
  risingCount: number;
  fallingCount: number;
  /** 燈號：green=活躍上漲、yellow=初動/多空不明、gray=平靜無資料、declining=族群明顯走弱。
   * declining一定優先於其他判斷——不會因為signalRate高就蓋掉「族群其實在跌」這件事
   * （2026-07-17修正：被動元件全部個股下跌但因為signalRate夠高被判成綠燈的bug）。 */
  light: "green" | "yellow" | "gray" | "declining";
  /** 點開燈號要看的個別成員股票，依報酬率由高到低排序 */
  members: ChainStageMember[];
}

export interface ChainSignalResult {
  chainName: string;
  chainNameFull: string;
  stages: ChainStageSignal[];
}

const RECENCY_WINDOW_DAYS = 7;
const RETURN_LOOKBACK_TRADING_DAYS = 6; // 算5日報酬要6筆
const RETURN_LOOKBACK_CALENDAR_DAYS = 14;

/** declining永遠優先判斷：族群平均報酬明顯是負的，不管signalRate多高都不該是green/活躍
 * （舊版bug：技術面訊號本身就常伴隨近期價格走弱，signalRate高不代表現在在漲，兩者混在一起
 * 用OR判斷會讓「全部下跌」的族群顯示成綠燈）。 */
function decideLight(signalRate: number, avgReturn5d: number | null): "green" | "yellow" | "gray" | "declining" {
  if (avgReturn5d !== null && avgReturn5d < -1) return "declining";
  if (avgReturn5d !== null && avgReturn5d >= 3) return "green";
  if (signalRate >= 0.3 && (avgReturn5d === null || avgReturn5d >= 0)) return "green";
  if (signalRate > 0 || (avgReturn5d !== null && avgReturn5d > 0)) return "yellow";
  return "gray";
}

/**
 * 產業鏈訊號燈號（2026-07-12）：每個階段（上游/中游/下游/支援層）目前「有多少比例的成員股票
 * 觸發戰術訊號」+「近5日族群平均報酬」，用紅黃綠燈號呈現「這條鏈現在誰噴誰還沒動」。
 * 跟板塊熱圖（computeThemeHeatmap.ts）不同：熱圖是純報酬率，這裡疊加了戰術分類訊號比例，
 * 更貼近「訊號」這個詞本身的意思，不是只看價格。
 */
export async function computeChainSignals(chainName: string): Promise<ChainSignalResult | null> {
  const chain = getChain(chainName);
  const stagesWithThemes = getChainStagesWithThemes(chainName);
  if (!chain || !stagesWithThemes) return null;

  const stages: ChainStageSignal[] = [];

  for (const stage of stagesWithThemes) {
    const tickers = [...new Set(stage.themes.flatMap((t) => t.members))];
    if (tickers.length === 0) {
      stages.push({
        stageKey: stage.stageKey,
        label: stage.label,
        memberCount: 0,
        signalRate: 0,
        statusBreakdown: {},
        avgReturn5d: null,
        risingCount: 0,
        fallingCount: 0,
        light: "gray",
        members: [],
      });
      continue;
    }

    const stocks = await prisma.stock.findMany({
      where: { market: "TW", ticker: { in: tickers } },
      select: { id: true, ticker: true, companyName: true },
    });
    const stockIds = stocks.map((s) => s.id);

    // 訊號比例：每檔股票取最新一筆（7天內），統計非 none 的比例；順便建stockId->status
    // 對照表，點開燈號時每檔股票要顯示自己目前的狀態
    const latestSignals = await prisma.dailyTrendSignal.findMany({
      where: {
        stockId: { in: stockIds },
        tradeDate: { gte: new Date(Date.now() - RECENCY_WINDOW_DAYS * 86_400_000) },
      },
      orderBy: [{ stockId: "asc" }, { tradeDate: "desc" }],
      distinct: ["stockId"],
      select: { stockId: true, status: true },
    });
    const statusByStockId = new Map(latestSignals.map((row) => [row.stockId, row.status as string]));
    const statusBreakdown: Record<string, number> = {};
    for (const row of latestSignals) {
      statusBreakdown[row.status] = (statusBreakdown[row.status] ?? 0) + 1;
    }
    const signalRate = tickers.length > 0 ? latestSignals.length / tickers.length : 0;

    // 近5日報酬：先算每檔股票自己的，再平均成族群數字
    const cutoff = new Date(Date.now() - RETURN_LOOKBACK_CALENDAR_DAYS * 86_400_000);
    const priceRows = await prisma.twDailyPrice.findMany({
      where: { stockId: { in: stockIds }, tradeDate: { gte: cutoff } },
      orderBy: [{ stockId: "asc" }, { tradeDate: "desc" }],
      select: { stockId: true, close: true },
    });
    const barsByStockId = new Map<number, number[]>();
    for (const row of priceRows) {
      const list = barsByStockId.get(row.stockId) ?? [];
      if (list.length < RETURN_LOOKBACK_TRADING_DAYS) list.push(Number(row.close));
      barsByStockId.set(row.stockId, list);
    }
    const return5dByStockId = new Map<number, number>();
    for (const [stockId, closes] of barsByStockId) {
      if (closes.length <= 5 || closes[5] === 0) continue;
      return5dByStockId.set(stockId, Math.round(((closes[0] - closes[5]) / closes[5]) * 10000) / 100);
    }
    const returns = [...return5dByStockId.values()];
    const avgReturn5d = returns.length > 0 ? Math.round((returns.reduce((a, b) => a + b, 0) / returns.length) * 100) / 100 : null;
    const risingCount = returns.filter((r) => r > 0).length;
    const fallingCount = returns.filter((r) => r < 0).length;

    const members: ChainStageMember[] = stocks
      .map((s) => ({
        ticker: s.ticker,
        companyName: s.companyName,
        status: statusByStockId.get(s.id) ?? null,
        return5d: return5dByStockId.get(s.id) ?? null,
      }))
      .sort((a, b) => (b.return5d ?? -Infinity) - (a.return5d ?? -Infinity));

    stages.push({
      stageKey: stage.stageKey,
      label: stage.label,
      memberCount: tickers.length,
      signalRate: Math.round(signalRate * 1000) / 1000,
      statusBreakdown,
      avgReturn5d,
      risingCount,
      fallingCount,
      light: decideLight(signalRate, avgReturn5d),
      members,
    });
  }

  return { chainName, chainNameFull: chain.chainNameFull, stages };
}
