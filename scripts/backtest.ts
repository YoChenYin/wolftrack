/**
 * 回測：對每檔追蹤中股票的完整歷史股價，逐日重跑分類邏輯（跟正式批次用同一套函式），
 * 記錄每次觸發訊號後 5/10/20 個交易日的實際報酬，統計勝率/平均報酬，回答「這套邏輯到底準不準」。
 *
 * ⚠️避免 look-ahead bias 是這支腳本的核心：
 * - 技術指標（MA/RSI/ADX等）只會用到當天(含)以前的價格，這是 computeIndicatorSeries() 本來的行為，沒問題
 * - 三大法人籌碼資料每次都要「只看當天(含)以前」，不能整包丟進去——因為 tw_institutional_trading
 *   實際涵蓋到 2024-06 起（不是文件寫的「近25天」，是多次回填疊加出來的），如果不篩日期，
 *   回測 2024-07 的訊號時會偷看到 2026-07 的法人資料，統計出來的準確率會嚴重失真。
 *
 * 用法：npx tsx scripts/backtest.ts [ticker1,ticker2,...]
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { computeIndicatorSeries } from "../src/lib/trend/indicators";
import { calculateTwTrendSignalAtIndex } from "../src/lib/trend/tw/calculateTwDailySignal";
import type { OhlcvBar } from "../src/lib/trend/types";
import type { InstitutionalDay } from "../src/lib/trend/tw/chipScore";

const MIN_BARS_REQUIRED = 210;
const FORWARD_WINDOWS = [5, 10, 20];
const MAX_FORWARD = Math.max(...FORWARD_WINDOWS);
/** 跟 classify.ts 的 RECENT_HIGH_LOOKBACK_DAYS 保持一致，這裡沒 export 所以複製一份小函式，不改 classify.ts 的對外介面 */
const RECENT_HIGH_LOOKBACK_DAYS = 60;

function recentHigh(bars: OhlcvBar[], targetIndex: number, lookback: number): number {
  const start = Math.max(0, targetIndex - lookback + 1);
  let high = -Infinity;
  for (let i = start; i <= targetIndex; i++) high = Math.max(high, bars[i].high);
  return high;
}

interface Observation {
  ticker: string;
  date: string;
  status: string;
  coreScore: number;
  forwardReturns: Record<number, number>;
  /** 同一天進場、同樣持有期間的大盤(TAIEX)報酬，兩者相減 = 超額報酬(alpha)，才是訊號真正的價值 */
  marketForwardReturns: Record<number, number | null>;
  /** 額外存這兩個原始值，讓 chipLeading 的門檻敏感度分析可以直接篩已收集的樣本，不用重跑模擬 */
  chipScore: number;
  chipConcentration5: number;
  /** pullback 門檻敏感度分析用：RSI14 + 從近60日高點回檔幅度(%) */
  rsi14: number | null;
  drawdownPct: number;
}

async function loadPriceBars(stockId: number): Promise<OhlcvBar[]> {
  const rows = await prisma.twDailyPrice.findMany({ where: { stockId }, orderBy: { tradeDate: "asc" } });
  return rows.map((r) => ({
    date: r.tradeDate.toISOString().slice(0, 10),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
  }));
}

async function loadInstitutionalDays(stockId: number): Promise<InstitutionalDay[]> {
  const rows = await prisma.twInstitutionalTrading.findMany({ where: { stockId }, orderBy: { tradeDate: "asc" } });
  return rows.map((r) => ({
    date: r.tradeDate.toISOString().slice(0, 10),
    foreignNetBuyShares: Number(r.foreignNetBuyShares),
    investTrustNetBuyShares: Number(r.investTrustNetBuyShares),
    dealerNetBuyShares: Number(r.dealerNetBuyShares),
    totalVolumeShares: Number(r.totalVolumeShares),
  }));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

async function main() {
  const tickerFilter = process.argv[2] ? process.argv[2].split(",").map((t) => t.trim()) : null;

  const taiexStock = await prisma.stock.findUnique({ where: { market_ticker: { market: "TW", ticker: "TAIEX" } } });
  if (!taiexStock) throw new Error("找不到 TAIEX");
  const benchmarkBars = await loadPriceBars(taiexStock.id);
  const benchmarkSeries = computeIndicatorSeries(benchmarkBars);
  const benchmarkDateIndex = new Map(benchmarkBars.map((b, i) => [b.date, i]));

  const stocks = await prisma.stock.findMany({
    where: { market: "TW", isActive: true, ticker: { not: "TAIEX" }, ...(tickerFilter ? { ticker: { in: tickerFilter } } : {}) },
    select: { id: true, ticker: true, companyName: true },
  });

  const observations: Observation[] = [];
  let stocksProcessed = 0;

  for (const stock of stocks) {
    const bars = await loadPriceBars(stock.id);
    if (bars.length < MIN_BARS_REQUIRED + MAX_FORWARD) continue;

    const allInstitutionalDays = await loadInstitutionalDays(stock.id);
    // 計算技術指標只需要價格，這步只需要做一次（不是每個 targetIndex 都重算），MA/RSI/ADX 本來就是
    // 只往回看的指標，不會洩漏未來資訊
    const series = computeIndicatorSeries(bars);

    for (let targetIndex = MIN_BARS_REQUIRED - 1; targetIndex < bars.length - MAX_FORWARD; targetIndex++) {
      const targetDate = bars[targetIndex].date;

      // 關鍵防護：只給「當天(含)以前」的法人資料，避免偷看未來
      const institutionalDaysUpToTarget = allInstitutionalDays.filter((d) => d.date <= targetDate);

      const benchmarkTargetIndex = benchmarkDateIndex.get(targetDate);

      // 直接用預先算好的 series，不透過 calculateTwTrendSignalAtIndex 內部重算（它會對 bars 重跑
      // adjustPrice+computeIndicatorSeries，這裡先跳過，改成手動組裝結果比較快，但為了跟正式批次
      // 邏輯完全一致，還是呼叫同一支函式，只是接受重算指標的效能成本，正確性優先）
      const signal = calculateTwTrendSignalAtIndex(
        bars,
        [],
        targetIndex,
        institutionalDaysUpToTarget,
        benchmarkTargetIndex !== undefined ? benchmarkSeries : undefined,
        benchmarkTargetIndex
      );

      if (signal.status === "none") continue;

      const entryClose = bars[targetIndex].close;
      const forwardReturns: Record<number, number> = {};
      for (const w of FORWARD_WINDOWS) {
        const futureClose = bars[targetIndex + w].close;
        forwardReturns[w] = entryClose !== 0 ? ((futureClose - entryClose) / entryClose) * 100 : 0;
      }

      // 同一天進場、同樣持有期間的大盤報酬（用交易日對齊，不是曆日），沒對到大盤日期就是 null
      const marketForwardReturns: Record<number, number | null> = {};
      if (benchmarkTargetIndex !== undefined) {
        const marketEntry = benchmarkBars[benchmarkTargetIndex].close;
        for (const w of FORWARD_WINDOWS) {
          const futureIndex = benchmarkTargetIndex + w;
          marketForwardReturns[w] =
            futureIndex < benchmarkBars.length && marketEntry !== 0
              ? ((benchmarkBars[futureIndex].close - marketEntry) / marketEntry) * 100
              : null;
        }
      } else {
        for (const w of FORWARD_WINDOWS) marketForwardReturns[w] = null;
      }

      const high60 = recentHigh(bars, targetIndex, RECENT_HIGH_LOOKBACK_DAYS);
      const drawdownPct = high60 > 0 ? ((high60 - entryClose) / high60) * 100 : 0;

      observations.push({
        ticker: stock.ticker,
        date: targetDate,
        status: signal.status,
        coreScore: signal.coreScore,
        forwardReturns,
        marketForwardReturns,
        chipScore: signal.chipScore,
        chipConcentration5: signal.chipConcentration5,
        rsi14: signal.indicators.rsi14,
        drawdownPct,
      });
    }

    stocksProcessed++;
    if (stocksProcessed % 50 === 0) console.log(`  已處理 ${stocksProcessed}/${stocks.length} 檔...`);
  }

  console.log(`\n共處理 ${stocksProcessed} 檔股票，${observations.length} 筆訊號觀察值\n`);

  const byStatus = new Map<string, Observation[]>();
  for (const obs of observations) {
    const list = byStatus.get(obs.status) ?? [];
    list.push(obs);
    byStatus.set(obs.status, list);
  }

  console.log("原始報酬（還沒扣掉同期大盤，會受大盤當時強弱影響）");
  console.log("=".repeat(100));
  console.log(
    "狀態".padEnd(14) + "樣本數".padEnd(10) + FORWARD_WINDOWS.map((w) => `${w}日勝率`.padEnd(10)).join("") +
      FORWARD_WINDOWS.map((w) => `${w}日均報酬`.padEnd(12)).join("") + FORWARD_WINDOWS.map((w) => `${w}日中位數`.padEnd(12)).join("")
  );
  console.log("=".repeat(100));

  for (const [status, obs] of [...byStatus.entries()].sort((a, b) => b[1].length - a[1].length)) {
    let line = status.padEnd(14) + String(obs.length).padEnd(10);
    for (const w of FORWARD_WINDOWS) {
      const returns = obs.map((o) => o.forwardReturns[w]);
      const winRate = (returns.filter((r) => r > 0).length / returns.length) * 100;
      line += `${winRate.toFixed(1)}%`.padEnd(10);
    }
    for (const w of FORWARD_WINDOWS) {
      const returns = obs.map((o) => o.forwardReturns[w]);
      const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
      line += `${avg >= 0 ? "+" : ""}${avg.toFixed(2)}%`.padEnd(12);
    }
    for (const w of FORWARD_WINDOWS) {
      const sorted = [...obs.map((o) => o.forwardReturns[w])].sort((a, b) => a - b);
      const median = percentile(sorted, 0.5);
      line += `${median >= 0 ? "+" : ""}${median.toFixed(2)}%`.padEnd(12);
    }
    console.log(line);
  }
  console.log("=".repeat(100));

  console.log("\n超額報酬（扣掉同一天進場、同樣持有天數的大盤報酬，這才是訊號真正的 alpha，不是搭大盤順風車）");
  console.log("=".repeat(100));
  console.log(
    "狀態".padEnd(14) + "樣本數".padEnd(10) + FORWARD_WINDOWS.map((w) => `${w}日勝率`.padEnd(10)).join("") +
      FORWARD_WINDOWS.map((w) => `${w}日均超額`.padEnd(12)).join("") + FORWARD_WINDOWS.map((w) => `${w}日中位超額`.padEnd(12)).join("")
  );
  console.log("=".repeat(100));

  for (const [status, obs] of [...byStatus.entries()].sort((a, b) => b[1].length - a[1].length)) {
    let line = status.padEnd(14) + String(obs.length).padEnd(10);
    for (const w of FORWARD_WINDOWS) {
      const excess = obs
        .filter((o) => o.marketForwardReturns[w] !== null)
        .map((o) => o.forwardReturns[w] - (o.marketForwardReturns[w] as number));
      const winRate = excess.length > 0 ? (excess.filter((r) => r > 0).length / excess.length) * 100 : NaN;
      line += `${winRate.toFixed(1)}%`.padEnd(10);
    }
    for (const w of FORWARD_WINDOWS) {
      const excess = obs
        .filter((o) => o.marketForwardReturns[w] !== null)
        .map((o) => o.forwardReturns[w] - (o.marketForwardReturns[w] as number));
      const avg = excess.length > 0 ? excess.reduce((a, b) => a + b, 0) / excess.length : NaN;
      line += `${avg >= 0 ? "+" : ""}${avg.toFixed(2)}%`.padEnd(12);
    }
    for (const w of FORWARD_WINDOWS) {
      const excess = obs
        .filter((o) => o.marketForwardReturns[w] !== null)
        .map((o) => o.forwardReturns[w] - (o.marketForwardReturns[w] as number));
      const sorted = [...excess].sort((a, b) => a - b);
      const median = percentile(sorted, 0.5);
      line += `${median >= 0 ? "+" : ""}${median.toFixed(2)}%`.padEnd(12);
    }
    console.log(line);
  }
  console.log("=".repeat(100));

  console.log(`\n⚠️ 樣本涵蓋期間：三大法人資料從 2024-06 起才有（累積回填疊加出來的，不是刻意回補2年），
所以 chipLeading 這類依賴籌碼判斷的狀態樣本數會比純技術面狀態少，數字僅供參考、還沒有足夠樣本前不要當成定論。`);

  // chipLeading 門檻敏感度分析：現有門檻（chipScore>=60, concentration5>=1%）超額報酬偏弱，
  // 測試拉高門檻後，篩掉的訊號是不是雜訊、留下的訊號品質會不會變好
  const chipLeadingObs = byStatus.get("chipLeading") ?? [];
  if (chipLeadingObs.length > 0) {
    console.log("\n" + "=".repeat(100));
    console.log("chipLeading 門檻敏感度分析（現有門檻 chipScore>=60, concentration5>=1%，20日超額報酬偏弱，測試拉高門檻）");
    console.log("=".repeat(100));
    console.log("chipScore門檻   concentration5門檻   樣本數    20日勝率(超額)   20日中位超額報酬");
    const scoreThresholds = [60, 65, 70, 75, 80];
    const concThresholds = [1, 2, 3, 5];
    for (const scoreT of scoreThresholds) {
      for (const concT of concThresholds) {
        const subset = chipLeadingObs.filter((o) => o.chipScore >= scoreT && o.chipConcentration5 >= concT);
        if (subset.length < 15) continue; // 樣本太少不列，避免雜訊被誤讀成訊號
        const excess = subset
          .filter((o) => o.marketForwardReturns[20] !== null)
          .map((o) => o.forwardReturns[20] - (o.marketForwardReturns[20] as number));
        if (excess.length === 0) continue;
        const winRate = (excess.filter((r) => r > 0).length / excess.length) * 100;
        const sorted = [...excess].sort((a, b) => a - b);
        const median = percentile(sorted, 0.5);
        console.log(
          `>=${scoreT}`.padEnd(16) + `>=${concT}%`.padEnd(21) + String(subset.length).padEnd(10) +
            `${winRate.toFixed(1)}%`.padEnd(17) + `${median >= 0 ? "+" : ""}${median.toFixed(2)}%`
        );
      }
    }
    console.log("=".repeat(100));
  }

  // pullback 門檻敏感度分析：現有邏輯（回檔5-15% + 貼近MA支撐 + RSI從超買冷卻回40-55）20日超額報酬
  // 中位數是負的(-0.43%)，這裡拆兩個可以獨立測試的連續變數（回檔幅度、當下RSI區間）找问题在哪
  const pullbackObs = byStatus.get("pullback") ?? [];
  if (pullbackObs.length > 0) {
    console.log("\n" + "=".repeat(100));
    console.log("pullback 回檔幅度敏感度分析（現有門檻 5%~15%，20日超額報酬中位數是負的，測試其他區間）");
    console.log("=".repeat(100));
    console.log("回檔幅度區間        樣本數    20日勝率(超額)   20日中位超額報酬");
    const drawdownBands: [number, number][] = [
      [3, 8], [5, 10], [5, 15], [8, 15], [10, 20], [15, 25], [3, 20],
    ];
    for (const [lo, hi] of drawdownBands) {
      const subset = pullbackObs.filter((o) => o.drawdownPct >= lo && o.drawdownPct <= hi);
      if (subset.length < 15) continue;
      const excess = subset
        .filter((o) => o.marketForwardReturns[20] !== null)
        .map((o) => o.forwardReturns[20] - (o.marketForwardReturns[20] as number));
      if (excess.length === 0) continue;
      const winRate = (excess.filter((r) => r > 0).length / excess.length) * 100;
      const sorted = [...excess].sort((a, b) => a - b);
      const median = percentile(sorted, 0.5);
      console.log(
        `${lo}%~${hi}%`.padEnd(21) + String(subset.length).padEnd(10) +
          `${winRate.toFixed(1)}%`.padEnd(17) + `${median >= 0 ? "+" : ""}${median.toFixed(2)}%`
      );
    }
    console.log("=".repeat(100));

    console.log("\npullback 訊號當下 RSI 區間敏感度分析（現有邏輯要求RSI冷卻到40~55，測試其他區間）");
    console.log("=".repeat(100));
    console.log("RSI區間              樣本數    20日勝率(超額)   20日中位超額報酬");
    const rsiBands: [number, number][] = [
      [30, 40], [35, 45], [40, 50], [40, 55], [45, 55], [50, 60], [55, 65],
    ];
    for (const [lo, hi] of rsiBands) {
      const subset = pullbackObs.filter((o) => o.rsi14 !== null && o.rsi14 >= lo && o.rsi14 <= hi);
      if (subset.length < 15) continue;
      const excess = subset
        .filter((o) => o.marketForwardReturns[20] !== null)
        .map((o) => o.forwardReturns[20] - (o.marketForwardReturns[20] as number));
      if (excess.length === 0) continue;
      const winRate = (excess.filter((r) => r > 0).length / excess.length) * 100;
      const sorted = [...excess].sort((a, b) => a - b);
      const median = percentile(sorted, 0.5);
      console.log(
        `${lo}~${hi}`.padEnd(21) + String(subset.length).padEnd(10) +
          `${winRate.toFixed(1)}%`.padEnd(17) + `${median >= 0 ? "+" : ""}${median.toFixed(2)}%`
      );
    }
    console.log("=".repeat(100));
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
