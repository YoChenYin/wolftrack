import { prisma } from "@/lib/prisma";
import { getChain, getChainStagesWithThemes } from "./groupConfig";

export interface ChainStageSignal {
  stageKey: string;
  label: string;
  /** 這個階段涵蓋的不重複股票數（跨底下所有 theme 聯集） */
  memberCount: number;
  /** 有訊號（reversal/pullback/bullish/chipLeading 任一）的股票數 / memberCount */
  signalRate: number;
  /** 有訊號的股票裡，各狀態各幾檔 */
  statusBreakdown: Record<string, number>;
  /** 近5日族群平均報酬(%)，null=沒有足夠股價資料 */
  avgReturn5d: number | null;
  /** 綜合 signalRate 和 avgReturn5d 判斷的燈號：green=活躍、yellow=初動、gray=平靜 */
  light: "green" | "yellow" | "gray";
}

export interface ChainSignalResult {
  chainName: string;
  chainNameFull: string;
  stages: ChainStageSignal[];
}

const RECENCY_WINDOW_DAYS = 7;
const RETURN_LOOKBACK_TRADING_DAYS = 6; // 算5日報酬要6筆
const RETURN_LOOKBACK_CALENDAR_DAYS = 14;

function decideLight(signalRate: number, avgReturn5d: number | null): "green" | "yellow" | "gray" {
  if (signalRate >= 0.3 || (avgReturn5d !== null && avgReturn5d >= 3)) return "green";
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
        light: "gray",
      });
      continue;
    }

    const stocks = await prisma.stock.findMany({
      where: { market: "TW", ticker: { in: tickers } },
      select: { id: true, ticker: true },
    });
    const stockIds = stocks.map((s) => s.id);

    // 訊號比例：每檔股票取最新一筆（7天內），統計非 none 的比例
    const latestSignals = await prisma.dailyTrendSignal.findMany({
      where: {
        stockId: { in: stockIds },
        tradeDate: { gte: new Date(Date.now() - RECENCY_WINDOW_DAYS * 86_400_000) },
      },
      orderBy: [{ stockId: "asc" }, { tradeDate: "desc" }],
      distinct: ["stockId"],
      select: { status: true },
    });
    const statusBreakdown: Record<string, number> = {};
    for (const row of latestSignals) {
      statusBreakdown[row.status] = (statusBreakdown[row.status] ?? 0) + 1;
    }
    const signalRate = tickers.length > 0 ? latestSignals.length / tickers.length : 0;

    // 近5日族群平均報酬
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
    const returns: number[] = [];
    for (const closes of barsByStockId.values()) {
      if (closes.length <= 5 || closes[5] === 0) continue;
      returns.push(((closes[0] - closes[5]) / closes[5]) * 100);
    }
    const avgReturn5d = returns.length > 0 ? Math.round((returns.reduce((a, b) => a + b, 0) / returns.length) * 100) / 100 : null;

    stages.push({
      stageKey: stage.stageKey,
      label: stage.label,
      memberCount: tickers.length,
      signalRate: Math.round(signalRate * 1000) / 1000,
      statusBreakdown,
      avgReturn5d,
      light: decideLight(signalRate, avgReturn5d),
    });
  }

  return { chainName, chainNameFull: chain.chainNameFull, stages };
}
