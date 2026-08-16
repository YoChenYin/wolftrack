import { prisma } from "@/lib/prisma";
import { getGroupConfig } from "./groupConfig";

const SECOND_TIER_PER_THEME = 3;
const VOLUME_LOOKBACK_DAYS = 30;

/**
 * 龍頭 + 二軍：每個theme的leader，加上非leader成員裡近20個交易日均量排名前
 * SECOND_TIER_PER_THEME名的「二軍」——2026-08-16使用者要求法說會分析從只掃龍頭
 * 擴大到「每個產業的龍頭和二軍」，不是全部~800檔（成本/時間上不划算，見PRD討論）。
 *
 * 二軍排名故意用 tw_daily_price 的成交量算均量，不是 daily_trend_signals 上現成的
 * avgVolume20d 欄位——後者只在該股票當天status不是none時才會寫一筆，是稀疏資料
 * （見 sectorTrendsQuery.ts 2026-08-16 的說明），拿來排名會系統性漏掉「本身交易量大、
 * 但剛好沒有觸發任何戰術訊號」的股票，跟「二軍」想抓的「有分量」意思不符。
 */
export async function getLeaderAndSecondTierTickers(): Promise<string[]> {
  const config = getGroupConfig();
  const leaderSet = new Set<string>();
  const nonLeaderByTheme: string[][] = [];

  for (const themes of Object.values(config.industry_concepts)) {
    for (const theme of themes) {
      if (theme.leader.length === 0) continue; // 沒有leader的theme沒有「二軍」概念可言
      for (const t of theme.leader) leaderSet.add(t);
      const nonLeader = theme.members.filter((m) => !theme.leader.includes(m));
      if (nonLeader.length > 0) nonLeaderByTheme.push(nonLeader);
    }
  }

  const allNonLeaderTickers = [...new Set(nonLeaderByTheme.flat())];
  const stocks = await prisma.stock.findMany({
    where: { market: "TW", ticker: { in: allNonLeaderTickers } },
    select: { id: true, ticker: true },
  });
  const stockIdByTicker = new Map(stocks.map((s) => [s.ticker, s.id]));

  const cutoff = new Date(Date.now() - VOLUME_LOOKBACK_DAYS * 86_400_000);
  const prices = await prisma.twDailyPrice.findMany({
    where: { stockId: { in: stocks.map((s) => s.id) }, tradeDate: { gte: cutoff } },
    select: { stockId: true, volume: true },
  });
  const volumesByStockId = new Map<number, number[]>();
  for (const p of prices) {
    const list = volumesByStockId.get(p.stockId) ?? [];
    list.push(Number(p.volume));
    volumesByStockId.set(p.stockId, list);
  }
  const avgVolumeByTicker = new Map<string, number>();
  for (const [ticker, stockId] of stockIdByTicker) {
    const vols = volumesByStockId.get(stockId);
    if (vols && vols.length > 0) avgVolumeByTicker.set(ticker, vols.reduce((a, b) => a + b, 0) / vols.length);
  }

  const secondTierSet = new Set<string>();
  for (const nonLeader of nonLeaderByTheme) {
    const ranked = [...nonLeader]
      .filter((t) => avgVolumeByTicker.has(t))
      .sort((a, b) => (avgVolumeByTicker.get(b) ?? 0) - (avgVolumeByTicker.get(a) ?? 0));
    for (const t of ranked.slice(0, SECOND_TIER_PER_THEME)) secondTierSet.add(t);
  }

  return [...new Set([...leaderSet, ...secondTierSet])];
}
