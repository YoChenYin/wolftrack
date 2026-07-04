import { prisma } from "../src/lib/prisma";
import { buildPhasedOhlcv } from "../src/lib/mock/scenarioOhlcv";
import { generateMockInstitutionalTrading } from "../src/lib/mock/generateMockInstitutionalTrading";
import { computeIndicatorSeries } from "../src/lib/trend/indicators";
import { calculateTwTrendSignalAtIndex } from "../src/lib/trend/tw/calculateTwDailySignal";
import { buildTwDailyTrendSignalRow } from "../src/lib/trend/tw/dailyTrendSignalRow";

/** 模擬近 N 個交易日的批次計算歷史 */
const HISTORY_WINDOW_DAYS = 30;
const BENCHMARK_SEED = "TAIEX-benchmark";

function mulberry32(seed: number): () => number {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
  }
  return hash;
}

interface TwStockScenario {
  startPrice: number;
  drift: number;
  vol: number;
  chipBias: number;
}

/**
 * 每檔股票的假走勢劇本，用 ticker 的 hash 決定性地衍生 drift/vol/chipBias/startPrice，
 * 不用每加一檔新股票就手動調參數。同樣的 ticker 永遠得到同樣的假資料。
 */
function deriveScenario(ticker: string): TwStockScenario {
  const random = mulberry32(hashSeed(`${ticker}-scenario`));
  return {
    startPrice: Math.round(30 + random() * 470), // 30 ~ 500
    drift: -0.03 + random() * 0.13, // -0.03% ~ +0.10% / 日
    vol: 0.9 + random() * 1.3, // 0.9% ~ 2.2% / 日
    chipBias: -0.6 + random() * 1.4, // -0.6 ~ +0.8
  };
}

export async function seedTwDailySignals() {
  const stocks = await prisma.stock.findMany({
    where: { market: "TW" },
    select: { id: true, ticker: true },
  });

  const benchmarkBars = buildPhasedOhlcv({
    seed: BENCHMARK_SEED,
    startPrice: 17000,
    phases: [{ days: 320, dailyDriftPct: 0.03, dailyVolPct: 0.9 }],
  });
  const benchmarkSeries = computeIndicatorSeries(benchmarkBars);

  let totalSignalRows = 0;
  let totalInstRows = 0;
  let skippedNone = 0;

  for (const stock of stocks) {
    const scenario = deriveScenario(stock.ticker);

    const rawBars = buildPhasedOhlcv({
      seed: `${stock.ticker}-tw`,
      startPrice: scenario.startPrice,
      phases: [{ days: 280, dailyDriftPct: scenario.drift, dailyVolPct: scenario.vol }],
    });
    const institutionalDays = generateMockInstitutionalTrading({
      seed: `${stock.ticker}-inst`,
      dates: rawBars.map((b) => b.date),
      bias: scenario.chipBias,
      baseVolumeShares: 3000,
    });

    const benchmarkOffset = benchmarkBars.length - rawBars.length;
    const startIndex = Math.max(0, rawBars.length - HISTORY_WINDOW_DAYS);

    for (let targetIndex = startIndex; targetIndex < rawBars.length; targetIndex++) {
      const instWindow = institutionalDays.slice(0, targetIndex + 1);
      const benchmarkTargetIndex = benchmarkOffset + targetIndex;

      const signal = calculateTwTrendSignalAtIndex(
        rawBars,
        [],
        targetIndex,
        instWindow,
        benchmarkSeries,
        benchmarkTargetIndex
      );

      const instDay = institutionalDays[targetIndex];
      await prisma.twInstitutionalTrading.upsert({
        where: { stockId_tradeDate: { stockId: stock.id, tradeDate: new Date(instDay.date) } },
        update: {
          foreignNetBuyShares: BigInt(instDay.foreignNetBuyShares),
          foreignNetBuyAmount: 0,
          investTrustNetBuyShares: BigInt(instDay.investTrustNetBuyShares),
          investTrustNetBuyAmount: 0,
          dealerNetBuyShares: BigInt(instDay.dealerNetBuyShares),
          dealerNetBuyAmount: 0,
          totalVolumeShares: BigInt(instDay.totalVolumeShares),
        },
        create: {
          stockId: stock.id,
          tradeDate: new Date(instDay.date),
          foreignNetBuyShares: BigInt(instDay.foreignNetBuyShares),
          investTrustNetBuyShares: BigInt(instDay.investTrustNetBuyShares),
          dealerNetBuyShares: BigInt(instDay.dealerNetBuyShares),
          totalVolumeShares: BigInt(instDay.totalVolumeShares),
        },
      });
      totalInstRows++;

      if (signal.status === "none") {
        skippedNone++;
        continue;
      }

      const row = buildTwDailyTrendSignalRow(signal);
      await prisma.dailyTrendSignal.upsert({
        where: { stockId_tradeDate: { stockId: stock.id, tradeDate: new Date(signal.tradeDate) } },
        update: row,
        create: { stockId: stock.id, tradeDate: new Date(signal.tradeDate), ...row },
      });
      totalSignalRows++;
    }
  }

  console.log(
    `Seeded ${totalInstRows} tw_institutional_trading rows and ${totalSignalRows} daily_trend_signals rows (skipped ${skippedNone} "none" days) across ${stocks.length} TW stocks.`
  );
}
