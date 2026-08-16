/**
 * 2026-07-22：回測使用者提供的自訂籌碼+技術面策略（不是 classify.ts 的三段式雷達，是完全獨立
 * 的規則組合），方法論比照 backtest.ts：只用訊號當天(含)以前的資料、超額報酬扣掉同期大盤。
 *
 * 跟既有 backtest.ts/backtest-compare.ts 最大的不同：這裡的出場是「規則觸發」不是固定N日
 * 持有期，所以要做逐日模擬——進場後每天檢查一次出場規則，觸發哪條就用哪條，直到出場或
 * 撐到 MAX_HOLDING_DAYS 強制平倉為止。
 *
 * ⚠️資料缺口與簡化（使用者已確認的處理方式）：
 * - 「毛利率>50%」完全沒有資料來源（DB沒有任何毛利率欄位），逢低買進規則直接跳過這條。
 * - 「獲利連續成長/減少」DB沒有真正的獲利/淨利數字，只有月營收年增率(yoyGrowthPct)，改用
 *   這個當代理指標。
 * - 月營收資料只從2026-05開始累積（每月固定upsert最新一期，不是一次回填的歷史資料），
 *   最多只有2個不同月份的快照，「連續3個月」數學上不可能檢查，降級成「連續2個月」。
 *   即使降級，能實際檢查到「連續2個月都有資料」的時間點也只落在約2026-07中旬以後
 *   （月營收通常次月10號左右公布，這裡用revenueMonth+40天當「揭露後才看得到」的保守估計，
 *   避免look-ahead bias），所以完整規則（含營收）能跑出的樣本數會非常少，是資料本身的限制，
 *   不是程式邏輯問題。腳本同時輸出「完整規則」跟「拿掉營收條件」兩組結果，後者可以用完整
 *   2017年至今的歷史回測，統計上才有意義。
 *
 * 2026-08-16：核心模擬邏輯（資料載入/進出場規則判斷/逐日模擬）抽到
 * scripts/lib/strategyBacktestEngine.ts，跟 scripts/optimize-entry-exit-strategy.ts 共用，
 * 這支只保留「跑固定幾組變體、印報表」的部分。
 *
 * 用法：npx tsx scripts/backtest-custom-strategy.ts [ticker1,ticker2,...]
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import type { OhlcvBar } from "../src/lib/trend/types";
import {
  MIN_BARS_REQUIRED,
  BASE_OPTS,
  BEST_BUYDIP_OPTS,
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

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

function mean(values: number[]): number {
  return sum(values) / values.length;
}

function stdev(values: number[]): number {
  const m = mean(values);
  return Math.sqrt(sum(values.map((v) => (v - m) ** 2)) / (values.length - 1));
}

/**
 * 2026-08-10：n=56的「主要進場」樣本單看全樣本平均值看不出這個接近0的超額報酬是真的沒有
 * edge、還是樣本數太小純粹雜訊蓋過去了——加兩個檢查：①用進場日期切前後兩半，看接近0的
 * 結論在兩個時期是不是穩定的（不是被單一時期的極端值撐出來的平均）②算標準誤跟t值，
 * 讓「均超額-0.04%」有個「這個數字跟真正的0能不能分得開」的量化依據，不是憑肉眼判斷。
 */
function printSignificance(label: string, excessReturns: number[]) {
  if (excessReturns.length < 2) return;
  const m = mean(excessReturns);
  const se = stdev(excessReturns) / Math.sqrt(excessReturns.length);
  const t = m / se;
  console.log(
    `  ${label}顯著性：均值${m >= 0 ? "+" : ""}${m.toFixed(2)}% ± ${se.toFixed(2)}%（標準誤，n=${excessReturns.length}）　t≈${t.toFixed(2)}${Math.abs(t) < 2 ? "（|t|<2，跟0沒有統計上可分辨的差異——不能說有效，但也不能說一定沒用，就是樣本不夠看不出來）" : ""}`
  );
}

/** 按進場日期切前後兩半，各自印一次超額報酬統計——確認「接近打平」是不是兩個時期都成立，
 * 不是被某一段特別好或特別差的時期平均掉、真實情況其實忽多忽空。 */
function printTemporalSplit(trades: Trade[]) {
  const sorted = [...trades].sort((a, b) => a.entryDate.localeCompare(b.entryDate));
  const mid = Math.floor(sorted.length / 2);
  const halves: [string, Trade[]][] = [
    ["前半段", sorted.slice(0, mid)],
    ["後半段", sorted.slice(mid)],
  ];
  for (const [label, half] of halves) {
    const withMarket = half.filter((t) => t.marketReturnPct !== null);
    const excess = withMarket.map((t) => t.returnPct - (t.marketReturnPct as number));
    if (excess.length === 0) {
      console.log(`  ${label}（${half[0]?.entryDate ?? "-"}~${half[half.length - 1]?.entryDate ?? "-"}）：無樣本`);
      continue;
    }
    const winRate = (excess.filter((r) => r > 0).length / excess.length) * 100;
    console.log(
      `  ${label}（${half[0].entryDate}~${half[half.length - 1].entryDate}，n=${excess.length}）：勝率${winRate.toFixed(0)}% 均超額${mean(excess) >= 0 ? "+" : ""}${mean(excess).toFixed(2)}% 中位超額${percentile([...excess].sort((a, b) => a - b), 0.5) >= 0 ? "+" : ""}${percentile([...excess].sort((a, b) => a - b), 0.5).toFixed(2)}%`
    );
  }
}

function printReport(label: string, trades: Trade[], only: ("main" | "buyDip")[] = ["main", "buyDip"]) {
  console.log("\n" + "#".repeat(100));
  console.log(`# ${label}`);
  console.log("#".repeat(100));

  if (trades.length === 0) {
    console.log("（沒有任何交易樣本）");
    return;
  }

  for (const triggerType of only) {
    const subset = trades.filter((t) => t.entryTrigger === triggerType);
    console.log(`\n進場方式：${triggerType === "main" ? "主要進場訊號" : "逢低買進"}　樣本數：${subset.length}`);
    if (subset.length === 0) continue;

    const withMarket = subset.filter((t) => t.marketReturnPct !== null);
    const rawReturns = subset.map((t) => t.returnPct);
    const excessReturns = withMarket.map((t) => t.returnPct - (t.marketReturnPct as number));
    const avgHold = sum(subset.map((t) => t.holdingDays)) / subset.length;

    const rawWinRate = (rawReturns.filter((r) => r > 0).length / rawReturns.length) * 100;
    const rawAvg = sum(rawReturns) / rawReturns.length;
    const rawMedian = percentile([...rawReturns].sort((a, b) => a - b), 0.5);

    console.log(
      `  原始報酬：勝率${rawWinRate.toFixed(1)}% 均報酬${rawAvg >= 0 ? "+" : ""}${rawAvg.toFixed(2)}% 中位數${rawMedian >= 0 ? "+" : ""}${rawMedian.toFixed(2)}%　平均持有${avgHold.toFixed(1)}天`
    );

    if (excessReturns.length > 0) {
      const excessWinRate = (excessReturns.filter((r) => r > 0).length / excessReturns.length) * 100;
      const excessAvg = sum(excessReturns) / excessReturns.length;
      const excessMedian = percentile([...excessReturns].sort((a, b) => a - b), 0.5);
      console.log(
        `  超額報酬：勝率${excessWinRate.toFixed(1)}% 均超額${excessAvg >= 0 ? "+" : ""}${excessAvg.toFixed(2)}% 中位超額${excessMedian >= 0 ? "+" : ""}${excessMedian.toFixed(2)}%`
      );
      if (triggerType === "main") {
        printSignificance("主要進場超額報酬", excessReturns);
        printTemporalSplit(withMarket);
      }
    }

    const byReason = new Map<string, number>();
    for (const t of subset) byReason.set(t.exitReason, (byReason.get(t.exitReason) ?? 0) + 1);
    console.log(
      "  出場原因分布：" +
        [...byReason.entries()].map(([reason, count]) => `${reason}=${count}`).join("  ")
    );
  }
}

interface Variant {
  label: string;
  opts: StrategyOptions;
  only: ("main" | "buyDip")[];
}

const VARIANTS: Variant[] = [
  { label: "主要進場: 含K轉弱出場（原本設定）", opts: { ...BASE_OPTS }, only: ["main"] },
  {
    label: "主要進場: 拿掉K轉弱出場（只靠MA死叉+投信外資賣超加速+停利規則）",
    opts: { ...BASE_OPTS, includeKWeakeningExit: false },
    only: ["main"],
  },
  { label: "逢低買進(最佳參數): 含K轉弱出場（原本設定）", opts: { ...BEST_BUYDIP_OPTS }, only: ["buyDip"] },
  {
    label: "逢低買進(最佳參數): 拿掉K轉弱出場",
    opts: { ...BEST_BUYDIP_OPTS, includeKWeakeningExit: false },
    only: ["buyDip"],
  },
];

async function main() {
  const tickerFilter = process.argv[2] ? process.argv[2].split(",").map((t) => t.trim()) : null;

  const taiexStock = await prisma.stock.findUnique({ where: { market_ticker: { market: "TW", ticker: "TAIEX" } } });
  if (!taiexStock) throw new Error("找不到 TAIEX");
  const benchmarkBars = await loadPriceBars(taiexStock.id);
  const benchmarkDateIndex = new Map(benchmarkBars.map((b, i) => [b.date, i]));

  const stocks = await prisma.stock.findMany({
    where: { market: "TW", isActive: true, ticker: { not: "TAIEX" }, ...(tickerFilter ? { ticker: { in: tickerFilter } } : {}) },
    select: { id: true, ticker: true },
  });

  // 每檔股票的資料只load一次，跟production DB來回一次，所有變體共用同一份快取
  const perStockData: { ticker: string; bars: OhlcvBar[]; institutionalDays: Awaited<ReturnType<typeof loadInstitutionalDays>>; revenueRows: Awaited<ReturnType<typeof loadRevenueRows>> }[] = [];
  let stocksProcessed = 0;
  for (const stock of stocks) {
    const bars = await loadPriceBars(stock.id);
    if (bars.length < MIN_BARS_REQUIRED + 5) continue;
    const institutionalDays = await loadInstitutionalDays(stock.id);
    const revenueRows = await loadRevenueRows(stock.id);
    perStockData.push({ ticker: stock.ticker, bars, institutionalDays, revenueRows });

    stocksProcessed++;
    if (stocksProcessed % 50 === 0) console.log(`  已載入 ${stocksProcessed}/${stocks.length} 檔...`);
  }
  console.log(`\n共載入 ${stocksProcessed} 檔股票，開始跑 ${VARIANTS.length} 組變體`);

  for (const variant of VARIANTS) {
    const trades: Trade[] = [];
    for (const { ticker, bars, institutionalDays, revenueRows } of perStockData) {
      trades.push(...runStrategy(ticker, bars, institutionalDays, revenueRows, benchmarkBars, benchmarkDateIndex, variant.opts));
    }
    printReport(variant.label, trades, variant.only);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
