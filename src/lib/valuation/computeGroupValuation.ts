import { prisma } from "@/lib/prisma";
import { calculateValuationPercentile } from "./calculateValuationPercentile";
import { screenLaggingStocks, type LaggingStockResult } from "./screenLaggingStocks";
import type { GroupTheme, ThemeChainStage } from "./groupConfig";

export interface GroupValuationMember {
  ticker: string;
  companyName: string | null;
  isLeader: boolean;
  pe: number | null;
  pb: number | null;
  pePercentile: number | null;
  pbPercentile: number | null;
  /** 近20日報酬率(%)，沒有足夠股價歷史（例如上櫃股尚無真實資料）就是 null */
  return20d: number | null;
  /** 是否為「供應鏈落後股」 */
  isLagging: boolean;
}

export interface GroupValuationResult {
  themeName: string;
  groupAvgReturn20d: number | null;
  marketAvgReturn20d: number | null;
  members: GroupValuationMember[];
  laggingStocks: LaggingStockResult[];
  /** 2026-07-10：這個 theme 在產業鏈裡的上中下游位置，見 groupConfig.ts ThemeChainStage */
  chainStages: ThemeChainStage[];
}

/** 近20日報酬率 = (今天收盤 - 20個交易日前收盤) / 20個交易日前收盤 * 100 */
async function calculateReturn20d(stockId: number): Promise<number | null> {
  const rows = await prisma.twDailyPrice.findMany({
    where: { stockId },
    orderBy: { tradeDate: "desc" },
    take: 21,
  });
  if (rows.length < 21) return null;
  const latest = Number(rows[0].close);
  const twentyDaysAgo = Number(rows[20].close);
  if (twentyDaysAgo === 0) return null;
  return Math.round(((latest - twentyDaysAgo) / twentyDaysAgo) * 10000) / 100;
}

/**
 * 算某個產業概念族群的估值比較：每個成員的 PE/PB 百分位 + 近20日報酬率，
 * 並跑落後股篩選（docs/wolftrack-tw-spec.md 4.2）。
 * 只用 TWSE 真實資料（tw_daily_price + tw_stock_fundamentals），沒有資料的成員
 * （例如上櫃股、還沒回填的股票）percentile/return20d 會是 null，不會被排進落後股名單。
 */
export async function computeGroupValuation(theme: GroupTheme): Promise<GroupValuationResult> {
  const stocks = await prisma.stock.findMany({
    where: { market: "TW", ticker: { in: theme.members } },
    select: { id: true, ticker: true, companyName: true },
  });
  const stockByTicker = new Map(stocks.map((s) => [s.ticker, s]));

  const taiex = await prisma.stock.findUnique({ where: { market_ticker: { market: "TW", ticker: "TAIEX" } } });
  const marketAvgReturn20d = taiex ? await calculateReturn20d(taiex.id) : null;

  const rawMembers = await Promise.all(
    theme.members.map(async (ticker) => {
      const stock = stockByTicker.get(ticker);
      if (!stock) {
        return { ticker, companyName: null, pe: null, pb: null, return20d: null };
      }
      const fundamentals = await prisma.twStockFundamentals.findFirst({
        where: { stockId: stock.id },
        orderBy: { tradeDate: "desc" },
      });
      const return20d = await calculateReturn20d(stock.id);
      return {
        ticker,
        companyName: stock.companyName,
        pe: fundamentals?.pe !== undefined && fundamentals?.pe !== null ? Number(fundamentals.pe) : null,
        pb: fundamentals?.pb !== undefined && fundamentals?.pb !== null ? Number(fundamentals.pb) : null,
        return20d,
      };
    })
  );

  const percentiles = calculateValuationPercentile(rawMembers.map((m) => ({ ticker: m.ticker, pe: m.pe, pb: m.pb })));
  const percentileByTicker = new Map(percentiles.map((p) => [p.ticker, p]));

  const validReturns = rawMembers.map((m) => m.return20d).filter((r): r is number => r !== null);
  const groupAvgReturn20d =
    validReturns.length > 0 ? Math.round((validReturns.reduce((a, b) => a + b, 0) / validReturns.length) * 100) / 100 : null;

  let laggingStocks: LaggingStockResult[] = [];
  if (groupAvgReturn20d !== null && marketAvgReturn20d !== null) {
    const candidates = rawMembers
      .filter((m): m is typeof m & { return20d: number } => m.return20d !== null)
      .map((m) => {
        const p = percentileByTicker.get(m.ticker);
        return { ticker: m.ticker, pePercentile: p?.pePercentile ?? null, pbPercentile: p?.pbPercentile ?? null, return20d: m.return20d };
      });
    laggingStocks = screenLaggingStocks({
      groupName: theme.theme_name,
      members: candidates,
      groupAvgReturn20d,
      marketAvgReturn20d,
    });
  }
  const laggingTickers = new Set(laggingStocks.map((l) => l.ticker));

  const members: GroupValuationMember[] = rawMembers.map((m) => {
    const p = percentileByTicker.get(m.ticker);
    return {
      ticker: m.ticker,
      companyName: m.companyName,
      isLeader: theme.leader.includes(m.ticker),
      pe: m.pe,
      pb: m.pb,
      pePercentile: p?.pePercentile ?? null,
      pbPercentile: p?.pbPercentile ?? null,
      return20d: m.return20d,
      isLagging: laggingTickers.has(m.ticker),
    };
  });

  return {
    themeName: theme.theme_name,
    groupAvgReturn20d,
    marketAvgReturn20d,
    members,
    laggingStocks,
    chainStages: theme.chainStages ?? [],
  };
}
