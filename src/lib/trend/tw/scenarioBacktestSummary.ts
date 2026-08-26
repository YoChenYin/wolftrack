import { prisma } from "@/lib/prisma";
import type { BacktestHorizon } from "./backtestWalkForward";
import { classifyMaArrangement, classifyChipBucket, type MaArrangement, type ChipConcentrationBucket } from "./backtestScenario";
import { calculateChipConcentration } from "./chipConcentration";
import { sma } from "@/lib/trend/indicators";

/** 樣本數低於這個門檻，統計噪音太大，UI上不呈現、fallback成「樣本數不足」——跟
 * backtestSummary.ts的MIN_SAMPLE_SIZE_FOR_UI同一套考量，這裡9個組合平分樣本，門檻降低一些 */
const MIN_SAMPLE_SIZE_FOR_UI = 100;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ScenarioHorizonStats {
  horizon: BacktestHorizon;
  sampleSize: number;
  winRatePct: number | null;
  avgReturnPct: number | null;
  avgTaiexReturnPct: number | null;
  excessReturnPct: number | null;
}

export interface ScenarioStats {
  maArrangement: MaArrangement;
  chipBucket: ChipConcentrationBucket;
  horizons: ScenarioHorizonStats[];
}

/**
 * 查單一組合（MA排列+籌碼分箱）的歷史統計，5個horizon都查——這是給股票頁「歷史相似情境
 * 統計」卡片用的，跟backtestSummary.ts的getBacktestBadgeStats()同一種SQL直接GROUP BY寫法
 * （不把全部事件撈進Node.js處理），只是這裡一次查5個horizon而不是只查20日單一數字，因為
 * 這張卡片本來就是要呈現完整持有期間分布，不是像戰術分類badge那樣只需要一個精簡數字。
 */
export async function getScenarioStats(
  maArrangement: MaArrangement,
  chipBucket: ChipConcentrationBucket,
  excludeEtf = true
): Promise<ScenarioStats> {
  const rows = await prisma.$queryRaw<
    {
      sample_size_5: bigint;
      win_rate_5: number | null;
      avg_return_5: number | null;
      avg_taiex_5: number | null;
      sample_size_10: bigint;
      win_rate_10: number | null;
      avg_return_10: number | null;
      avg_taiex_10: number | null;
      sample_size_20: bigint;
      win_rate_20: number | null;
      avg_return_20: number | null;
      avg_taiex_20: number | null;
      sample_size_40: bigint;
      win_rate_40: number | null;
      avg_return_40: number | null;
      avg_taiex_40: number | null;
      sample_size_60: bigint;
      win_rate_60: number | null;
      avg_return_60: number | null;
      avg_taiex_60: number | null;
    }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE e.return_5d IS NOT NULL) AS sample_size_5,
      (COUNT(*) FILTER (WHERE e.return_5d > 0))::float * 100.0 / NULLIF(COUNT(*) FILTER (WHERE e.return_5d IS NOT NULL), 0) AS win_rate_5,
      AVG(e.return_5d) AS avg_return_5,
      AVG(e.taiex_return_5d) AS avg_taiex_5,
      COUNT(*) FILTER (WHERE e.return_10d IS NOT NULL) AS sample_size_10,
      (COUNT(*) FILTER (WHERE e.return_10d > 0))::float * 100.0 / NULLIF(COUNT(*) FILTER (WHERE e.return_10d IS NOT NULL), 0) AS win_rate_10,
      AVG(e.return_10d) AS avg_return_10,
      AVG(e.taiex_return_10d) AS avg_taiex_10,
      COUNT(*) FILTER (WHERE e.return_20d IS NOT NULL) AS sample_size_20,
      (COUNT(*) FILTER (WHERE e.return_20d > 0))::float * 100.0 / NULLIF(COUNT(*) FILTER (WHERE e.return_20d IS NOT NULL), 0) AS win_rate_20,
      AVG(e.return_20d) AS avg_return_20,
      AVG(e.taiex_return_20d) AS avg_taiex_20,
      COUNT(*) FILTER (WHERE e.return_40d IS NOT NULL) AS sample_size_40,
      (COUNT(*) FILTER (WHERE e.return_40d > 0))::float * 100.0 / NULLIF(COUNT(*) FILTER (WHERE e.return_40d IS NOT NULL), 0) AS win_rate_40,
      AVG(e.return_40d) AS avg_return_40,
      AVG(e.taiex_return_40d) AS avg_taiex_40,
      COUNT(*) FILTER (WHERE e.return_60d IS NOT NULL) AS sample_size_60,
      (COUNT(*) FILTER (WHERE e.return_60d > 0))::float * 100.0 / NULLIF(COUNT(*) FILTER (WHERE e.return_60d IS NOT NULL), 0) AS win_rate_60,
      AVG(e.return_60d) AS avg_return_60,
      AVG(e.taiex_return_60d) AS avg_taiex_60
    FROM tw_scenario_backtest_events e
    JOIN stocks s ON s.id = e.stock_id
    WHERE e.ma_arrangement = ${maArrangement}::"MaArrangement"
      AND e.chip_bucket = ${chipBucket}::"ChipConcentrationBucket"
      AND (${!excludeEtf} OR s.industry IS DISTINCT FROM 'ETF')
  `;

  const row = rows[0];
  const build = (h: BacktestHorizon, sample: bigint, winRate: number | null, avgReturn: number | null, avgTaiex: number | null): ScenarioHorizonStats => {
    const sampleSize = Number(sample);
    if (sampleSize < MIN_SAMPLE_SIZE_FOR_UI || winRate === null || avgReturn === null) {
      return { horizon: h, sampleSize, winRatePct: null, avgReturnPct: null, avgTaiexReturnPct: null, excessReturnPct: null };
    }
    const avgReturnPct = round2(avgReturn);
    const avgTaiexReturnPct = avgTaiex !== null ? round2(avgTaiex) : null;
    return {
      horizon: h,
      sampleSize,
      winRatePct: round2(winRate),
      avgReturnPct,
      avgTaiexReturnPct,
      excessReturnPct: avgTaiexReturnPct !== null ? round2(avgReturnPct - avgTaiexReturnPct) : null,
    };
  };

  const horizons: ScenarioHorizonStats[] = [
    build(5, row.sample_size_5, row.win_rate_5, row.avg_return_5, row.avg_taiex_5),
    build(10, row.sample_size_10, row.win_rate_10, row.avg_return_10, row.avg_taiex_10),
    build(20, row.sample_size_20, row.win_rate_20, row.avg_return_20, row.avg_taiex_20),
    build(40, row.sample_size_40, row.win_rate_40, row.avg_return_40, row.avg_taiex_40),
    build(60, row.sample_size_60, row.win_rate_60, row.avg_return_60, row.avg_taiex_60),
  ];

  return { maArrangement, chipBucket, horizons };
}

export interface CurrentScenario {
  maArrangement: MaArrangement;
  chipBucket: ChipConcentrationBucket;
}

/**
 * 用股票目前的價格+法人歷史，算出「現在」屬於哪個MA排列+籌碼分箱組合——跟
 * walkForwardScenarioBacktest()裡逐日算的邏輯完全一致（同一組classify函式），只是這裡
 * 只需要算「最新一天」，不用整段歷史逐日回溯。
 */
export async function classifyCurrentScenario(stockId: number): Promise<CurrentScenario | null> {
  const priceRows = await prisma.twDailyPrice.findMany({
    where: { stockId },
    orderBy: { tradeDate: "desc" },
    take: 20,
    select: { close: true },
  });
  if (priceRows.length < 20) return null;
  const closesAsc = priceRows.map((r) => Number(r.close)).reverse();

  const ma5 = sma(closesAsc, 5).at(-1) ?? null;
  const ma10 = sma(closesAsc, 10).at(-1) ?? null;
  const ma20 = sma(closesAsc, 20).at(-1) ?? null;
  const maArrangement = classifyMaArrangement(ma5, ma10, ma20);
  if (maArrangement === null) return null;

  const institutionalRows = await prisma.twInstitutionalTrading.findMany({
    where: { stockId },
    orderBy: { tradeDate: "desc" },
    take: 20,
    select: { tradeDate: true, foreignNetBuyShares: true, investTrustNetBuyShares: true, dealerNetBuyShares: true, totalVolumeShares: true },
  });
  const institutionalDaysAsc = institutionalRows
    .map((r) => ({
      date: r.tradeDate.toISOString().slice(0, 10),
      foreignNetBuyShares: Number(r.foreignNetBuyShares),
      investTrustNetBuyShares: Number(r.investTrustNetBuyShares),
      dealerNetBuyShares: Number(r.dealerNetBuyShares),
      totalVolumeShares: Number(r.totalVolumeShares),
    }))
    .reverse();

  const chipBucket = classifyChipBucket(calculateChipConcentration(institutionalDaysAsc).concentration20);
  return { maArrangement, chipBucket };
}
