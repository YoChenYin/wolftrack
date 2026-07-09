/**
 * 一次性驗證腳本（不寫資料庫）：檢查「籌碼領先」候選標準會抓到哪些股票、訊號品質如何，
 * 決定要不要正式做成第四個雷達分類之前先看真實資料。
 *
 * 條件：status="none"（技術面尚未觸發任何戰術分類）+ chipMomentum="strengthening"
 *   + chipScore>=60 + chipConcentration5>=1.0
 *
 * 用法：npx tsx scripts/validate-chip-leading.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { computeIndicatorSeries } from "../src/lib/trend/indicators";
import { calculateTwTrendSignalAtIndex } from "../src/lib/trend/tw/calculateTwDailySignal";
import type { OhlcvBar } from "../src/lib/trend/types";
import type { InstitutionalDay } from "../src/lib/trend/tw/chipScore";

const MIN_BARS_REQUIRED = 210;
const CHIP_SCORE_THRESHOLD = 60;
const CONCENTRATION5_THRESHOLD = 1.0;

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

async function main() {
  const taiexStock = await prisma.stock.findUnique({ where: { market_ticker: { market: "TW", ticker: "TAIEX" } } });
  if (!taiexStock) throw new Error("找不到 TAIEX");
  const benchmarkBars = await loadPriceBars(taiexStock.id);
  const benchmarkSeries = computeIndicatorSeries(benchmarkBars);
  const benchmarkDateIndex = new Map(benchmarkBars.map((b, i) => [b.date, i]));

  const stocks = await prisma.stock.findMany({
    where: { market: "TW", isActive: true, ticker: { not: "TAIEX" } },
    select: { id: true, ticker: true, companyName: true },
  });

  let noneCount = 0;
  let insufficientCount = 0;
  const candidates: {
    ticker: string;
    companyName: string;
    chipScore: number;
    c5: number;
    c10: number;
    c20: number;
  }[] = [];

  for (const stock of stocks) {
    const bars = await loadPriceBars(stock.id);
    if (bars.length < MIN_BARS_REQUIRED) {
      insufficientCount++;
      continue;
    }
    const institutionalDays = await loadInstitutionalDays(stock.id);
    const targetIndex = bars.length - 1;
    const benchmarkTargetIndex = benchmarkDateIndex.get(bars[targetIndex].date);

    const signal = calculateTwTrendSignalAtIndex(
      bars,
      [],
      targetIndex,
      institutionalDays,
      benchmarkTargetIndex !== undefined ? benchmarkSeries : undefined,
      benchmarkTargetIndex
    );

    if (signal.status !== "none") continue;
    noneCount++;

    if (
      signal.chipMomentum === "strengthening" &&
      signal.chipScore >= CHIP_SCORE_THRESHOLD &&
      signal.chipConcentration5 >= CONCENTRATION5_THRESHOLD
    ) {
      candidates.push({
        ticker: stock.ticker,
        companyName: stock.companyName,
        chipScore: signal.chipScore,
        c5: signal.chipConcentration5,
        c10: signal.chipConcentration10,
        c20: signal.chipConcentration20,
      });
    }
  }

  candidates.sort((a, b) => b.chipScore - a.chipScore);

  console.log(`共 ${stocks.length} 檔追蹤中，${insufficientCount} 檔資料不足，${noneCount} 檔今天是 "none"（技術面未觸發）`);
  console.log(`符合「籌碼領先」條件（chipMomentum=strengthening, chipScore>=${CHIP_SCORE_THRESHOLD}, concentration5>=${CONCENTRATION5_THRESHOLD}%）: ${candidates.length} 檔\n`);
  for (const c of candidates) {
    console.log(
      `${c.ticker} ${c.companyName}: chipScore=${c.chipScore.toFixed(1)} concentration5=${c.c5.toFixed(2)}% 10=${c.c10.toFixed(2)}% 20=${c.c20.toFixed(2)}%`
    );
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
