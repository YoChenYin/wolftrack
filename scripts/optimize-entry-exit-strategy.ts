/**
 * 2026-08-16：進出場策略參數優化——目標是找出「相對TAIEX有穩健、通得過樣本外驗證的正超額
 * 報酬」的參數組合，不是隨便調到全樣本(in-sample)數字最好看就好（那是overfitting，樣本外
 * 通常會現形）。方法論：
 *
 * 1. 用BASE_OPTS跑一次全樣本交易，取進場日期的第70百分位當train/test切點（不是固定日期，
 *    因為個股資料起訖不一，用實際交易分布切才有意義）。
 * 2. 分兩組獨立網格搜尋，不做entry×buyDip的完整交叉（會變成160組），原因：
 *    a) checkMainEntry不吃buyDip的參數，buyDip只在`!isMain`時才檢查——buyDip參數本來就
 *       不影響main訊號分類，交叉沒有意義。
 *    b) 交叉會把要比較的組數從42組灌到160組，等於把multiple comparisons的風險放大快4倍，
 *       同樣的資料量下更容易「湊出」一組樣本內表現亮眼、樣本外打回原形的假best config。
 *    entry ablation：一次拿掉一個進場條件（5組，含all-on）× K轉弱出場開關(2) = 10組。
 *    buyDip：帶寬%×集中度門檻網格(4×4=16) × K轉弱出場開關(2) = 32組。
 * 3. 每組都用train set的t值排名（不是只看均值——一個只有5筆交易但均值很高的組合，t值通常
 *    很低，代表那個均值不可信，排名時就會被比它樣本大、比較穩的組合比下去）。
 * 4. 排名前3名的每一組，同時印出train/test兩邊的表現——只有train贏、test賠錢（或方向相反）
 *    的組合就是overfitting，不能採用；train/test都同方向、且test也有正報酬的才算通過樣本外
 *    驗證，才有資格說「這個參數組合看起來有穩健alpha」。
 *
 * 用法：npx tsx scripts/optimize-entry-exit-strategy.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import type { OhlcvBar } from "../src/lib/trend/types";
import {
  MIN_BARS_REQUIRED,
  BASE_OPTS,
  loadPriceBars,
  loadInstitutionalDays,
  loadRevenueRows,
  runStrategy,
  type StrategyOptions,
  type Trade,
} from "./lib/strategyBacktestEngine";

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
function mean(values: number[]): number {
  return values.length === 0 ? NaN : sum(values) / values.length;
}
function stdev(values: number[]): number {
  const m = mean(values);
  return Math.sqrt(sum(values.map((v) => (v - m) ** 2)) / (values.length - 1));
}
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}
function tStat(values: number[]): number {
  if (values.length < 2) return NaN;
  const se = stdev(values) / Math.sqrt(values.length);
  return se === 0 ? NaN : mean(values) / se;
}

interface Stats {
  n: number;
  winRate: number;
  meanExcess: number;
  medianExcess: number;
  t: number;
}

function computeStats(trades: Trade[]): Stats {
  const excess = trades.filter((t) => t.marketReturnPct !== null).map((t) => t.returnPct - (t.marketReturnPct as number));
  return {
    n: excess.length,
    winRate: excess.length > 0 ? (excess.filter((r) => r > 0).length / excess.length) * 100 : NaN,
    meanExcess: mean(excess),
    medianExcess: percentile([...excess].sort((a, b) => a - b), 0.5),
    t: tStat(excess),
  };
}

function formatStats(s: Stats): string {
  if (s.n === 0) return "n=0";
  return `n=${s.n} 勝率${s.winRate.toFixed(0)}% 均超額${s.meanExcess >= 0 ? "+" : ""}${s.meanExcess.toFixed(2)}% 中位超額${s.medianExcess >= 0 ? "+" : ""}${s.medianExcess.toFixed(2)}%${Number.isFinite(s.t) ? ` t≈${s.t.toFixed(2)}` : ""}`;
}

interface StockData {
  ticker: string;
  bars: OhlcvBar[];
  institutionalDays: Awaited<ReturnType<typeof loadInstitutionalDays>>;
  revenueRows: Awaited<ReturnType<typeof loadRevenueRows>>;
}

function runAll(
  perStockData: StockData[],
  benchmarkBars: OhlcvBar[],
  benchmarkDateIndex: Map<string, number>,
  opts: StrategyOptions
): Trade[] {
  const trades: Trade[] = [];
  for (const { ticker, bars, institutionalDays, revenueRows } of perStockData) {
    trades.push(...runStrategy(ticker, bars, institutionalDays, revenueRows, benchmarkBars, benchmarkDateIndex, opts));
  }
  return trades;
}

interface Candidate {
  label: string;
  opts: StrategyOptions;
  triggerType: "main" | "buyDip";
  train: Stats;
  test: Stats;
}

/** train set排名用的分數：t值排第一位，t值算不出來(n<2)時退回均值排名，避免小樣本因為算不出t值而整組被忽略 */
function rankScore(s: Stats): number {
  if (s.n < 5) return -Infinity; // 樣本太小的組合直接墊底，不讓極端運氣的小樣本擠進前段班
  return Number.isFinite(s.t) ? s.t : s.meanExcess;
}

function printCandidates(title: string, candidates: Candidate[], baselineLabel?: string) {
  console.log(`\n${"=".repeat(90)}\n${title}\n${"=".repeat(90)}`);
  const ranked = [...candidates].sort((a, b) => rankScore(b.train) - rankScore(a.train));
  ranked.slice(0, 3).forEach((c, i) => {
    console.log(`\n#${i + 1} ${c.label}`);
    console.log(`  train（樣本內）：${formatStats(c.train)}`);
    console.log(`  test（樣本外）　：${formatStats(c.test)}`);
    const trainPositive = c.train.meanExcess > 0 && c.train.medianExcess > 0;
    const testPositive = c.test.meanExcess > 0 && c.test.medianExcess > 0;
    const samesign = Math.sign(c.train.meanExcess) === Math.sign(c.test.meanExcess);
    if (trainPositive && testPositive && samesign) {
      console.log("  → 樣本內外都是正超額報酬、方向一致，通過樣本外驗證，值得繼續追蹤");
    } else if (!samesign) {
      console.log("  → ⚠️ train/test方向相反，典型overfitting訊號，不能採用");
    } else {
      console.log("  → 沒有同時滿足train+test都是穩健正超額報酬，先不採用");
    }
  });

  if (baselineLabel) {
    const baselineIdx = ranked.findIndex((c) => c.label === baselineLabel);
    const baseline = ranked[baselineIdx];
    if (baseline) {
      console.log(`\n（對照）目前production參數「${baselineLabel}」在這${ranked.length}組裡排名第${baselineIdx + 1}名：`);
      console.log(`  train（樣本內）：${formatStats(baseline.train)}`);
      console.log(`  test（樣本外）　：${formatStats(baseline.test)}`);
    }
  }
}

async function main() {
  const taiexStock = await prisma.stock.findUnique({ where: { market_ticker: { market: "TW", ticker: "TAIEX" } } });
  if (!taiexStock) throw new Error("找不到 TAIEX");
  const benchmarkBars = await loadPriceBars(taiexStock.id);
  const benchmarkDateIndex = new Map(benchmarkBars.map((b, i) => [b.date, i]));

  const stocks = await prisma.stock.findMany({
    where: { market: "TW", isActive: true, ticker: { not: "TAIEX" } },
    select: { id: true, ticker: true },
  });

  const perStockData: StockData[] = [];
  let processed = 0;
  for (const stock of stocks) {
    const bars = await loadPriceBars(stock.id);
    if (bars.length < MIN_BARS_REQUIRED + 5) continue;
    const institutionalDays = await loadInstitutionalDays(stock.id);
    const revenueRows = await loadRevenueRows(stock.id);
    perStockData.push({ ticker: stock.ticker, bars, institutionalDays, revenueRows });
    processed++;
    if (processed % 100 === 0) console.log(`  已載入 ${processed}/${stocks.length} 檔...`);
  }
  console.log(`共載入 ${processed} 檔股票`);

  // Step 1：用BASE_OPTS的全樣本交易決定train/test切點（進場日期第70百分位）
  const referenceTrades = runAll(perStockData, benchmarkBars, benchmarkDateIndex, BASE_OPTS);
  const sortedDates = referenceTrades.map((t) => t.entryDate).sort();
  const cutoff = sortedDates[Math.floor(sortedDates.length * 0.7)];
  console.log(`\nTrain/Test切點（進場日期第70百分位）：${cutoff}（共${sortedDates.length}筆參考交易，train約${Math.floor(sortedDates.length * 0.7)}筆／test約${sortedDates.length - Math.floor(sortedDates.length * 0.7)}筆）`);

  function splitStats(trades: Trade[], triggerType: "main" | "buyDip"): { train: Stats; test: Stats } {
    const subset = trades.filter((t) => t.entryTrigger === triggerType);
    return {
      train: computeStats(subset.filter((t) => t.entryDate < cutoff)),
      test: computeStats(subset.filter((t) => t.entryDate >= cutoff)),
    };
  }

  // Step 2a：主要進場——one-at-a-time拿掉每個進場條件 × K轉弱出場開關
  const ENTRY_ABLATIONS: { label: string; overrides: Partial<StrategyOptions> }[] = [
    { label: "全部條件(all-on)", overrides: {} },
    { label: "拿掉「投信外資3個月合計買超」", overrides: { requireInstitutional3moPositive: false } },
    { label: "拿掉「買超力道加速」", overrides: { requireBuyAccelerating: false } },
    { label: "拿掉「籌碼集中度轉強」", overrides: { requireConcentrationMomentum: false } },
    { label: "拿掉「K持續走強」", overrides: { requireKdRising: false } },
  ];

  const mainCandidates: Candidate[] = [];
  for (const ablation of ENTRY_ABLATIONS) {
    for (const includeKWeakeningExit of [true, false]) {
      const opts: StrategyOptions = { ...BASE_OPTS, ...ablation.overrides, includeKWeakeningExit };
      const trades = runAll(perStockData, benchmarkBars, benchmarkDateIndex, opts);
      const { train, test } = splitStats(trades, "main");
      mainCandidates.push({
        label: `${ablation.label}｜${includeKWeakeningExit ? "含K轉弱出場" : "拿掉K轉弱出場"}`,
        opts,
        triggerType: "main",
        train,
        test,
      });
    }
  }
  printCandidates("主要進場策略優化（entry ablation × exit variant，共10組，依train t值排名前3）", mainCandidates);

  // Step 2b：逢低買進——帶寬%×集中度門檻網格 × K轉弱出場開關
  const BAND_PCTS = [1.0, 1.5, 2.0, 2.5];
  const CONCENTRATION_THRESHOLDS = [10, 15, 20, 25];

  const buyDipCandidates: Candidate[] = [];
  for (const buyDipBandPct of BAND_PCTS) {
    for (const buyDipConcentrationThreshold of CONCENTRATION_THRESHOLDS) {
      for (const includeKWeakeningExit of [true, false]) {
        const opts: StrategyOptions = { ...BASE_OPTS, buyDipBandPct, buyDipConcentrationThreshold, includeKWeakeningExit };
        const trades = runAll(perStockData, benchmarkBars, benchmarkDateIndex, opts);
        const { train, test } = splitStats(trades, "buyDip");
        buyDipCandidates.push({
          label: `帶寬±${buyDipBandPct}%／集中度≥${buyDipConcentrationThreshold}%｜${includeKWeakeningExit ? "含K轉弱出場" : "拿掉K轉弱出場"}`,
          opts,
          triggerType: "buyDip",
          train,
          test,
        });
      }
    }
  }
  printCandidates(
    "逢低買進策略優化（帶寬%×集中度門檻網格×exit variant，共32組，依train t值排名前3）",
    buyDipCandidates,
    "帶寬±1.5%／集中度≥15%｜含K轉弱出場"
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
