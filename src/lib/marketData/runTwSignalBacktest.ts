import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { walkForwardBacktest, BACKTEST_HORIZONS, type BacktestEvent } from "@/lib/trend/tw/backtestWalkForward";
import type { OhlcvBar } from "@/lib/trend/types";
import type { InstitutionalDay } from "@/lib/trend/tw/chipScore";

const MIN_BARS_REQUIRED = 210;

export interface TwSignalBacktestResult {
  stocksProcessed: number;
  stocksSkippedInsufficientData: number;
  eventsWritten: number;
  failed: { ticker: string; error: string }[];
  log: string[];
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

function toRow(stockId: number, event: BacktestEvent) {
  return {
    stockId,
    category: event.category,
    signalDate: new Date(event.signalDate),
    priceAtSignal: event.priceAtSignal,
    return5d: event.returns[5],
    return10d: event.returns[10],
    return20d: event.returns[20],
    return40d: event.returns[40],
    return60d: event.returns[60],
    taiexReturn5d: event.taiexReturns[5],
    taiexReturn10d: event.taiexReturns[10],
    taiexReturn20d: event.taiexReturns[20],
    taiexReturn40d: event.taiexReturns[40],
    taiexReturn60d: event.taiexReturns[60],
  } satisfies Prisma.TwSignalBacktestEventCreateManyInput;
}

/**
 * 跑一次戰術訊號回測（見backtestWalkForward.ts），寫進tw_signal_backtest_events。
 * 冪等：每次執行前先清空舊事件再整批寫入（不是upsert）——重跑通常是因為調整了偵測邏輯的
 * 參數（例如detectBottomPattern.ts的門檻），舊事件已經不代表現在的規則，留著會混淆結果。
 *
 * tickerFilter：只跑指定股票（測試/抓效能用），預設跑全部有回填歷史的台股。
 */
export async function runTwSignalBacktest(tickerFilter?: string[]): Promise<TwSignalBacktestResult> {
  const log: string[] = [];

  const taiexStock = await prisma.stock.findUnique({ where: { market_ticker: { market: "TW", ticker: "TAIEX" } } });
  if (!taiexStock) throw new Error('找不到 TAIEX 合成股票紀錄，先跑 `npx prisma db seed` 和 tw-backfill.ts。');
  const taiexBars = await loadPriceBars(taiexStock.id);
  if (taiexBars.length === 0) throw new Error("TAIEX 沒有價格歷史，先跑 tw-backfill.ts。");

  const stocks = await prisma.stock.findMany({
    where: { market: "TW", isActive: true, ticker: { not: "TAIEX" }, ...(tickerFilter ? { ticker: { in: tickerFilter } } : {}) },
    select: { id: true, ticker: true, companyName: true },
  });

  await prisma.twSignalBacktestEvent.deleteMany({
    where: tickerFilter ? { stock: { ticker: { in: tickerFilter } } } : {},
  });

  let stocksProcessed = 0;
  let stocksSkippedInsufficientData = 0;
  let eventsWritten = 0;
  const failed: { ticker: string; error: string }[] = [];

  for (const stock of stocks) {
    try {
      const bars = await loadPriceBars(stock.id);
      if (bars.length < MIN_BARS_REQUIRED) {
        stocksSkippedInsufficientData++;
        continue;
      }
      const institutionalDays = await loadInstitutionalDays(stock.id);
      const events = walkForwardBacktest(bars, institutionalDays, taiexBars);

      if (events.length > 0) {
        const result = await prisma.twSignalBacktestEvent.createMany({
          data: events.map((e) => toRow(stock.id, e)),
          skipDuplicates: true,
        });
        eventsWritten += result.count;
      }
      stocksProcessed++;
      log.push(`${stock.ticker} ${stock.companyName}: ${events.length} 筆事件`);
    } catch (err) {
      failed.push({ ticker: stock.ticker, error: (err as Error).message });
      log.push(`${stock.ticker} ${stock.companyName}: FAILED, skipping — ${(err as Error).message}`);
    }
  }

  log.push(
    `Done. processed ${stocksProcessed} stocks, skipped ${stocksSkippedInsufficientData} insufficient price history (<${MIN_BARS_REQUIRED} bars), wrote ${eventsWritten} events across horizons ${BACKTEST_HORIZONS.join("/")}, failed ${failed.length}.`
  );
  if (failed.length > 0) {
    log.push(`Failed tickers: ${failed.map((f) => f.ticker).join(",")}`);
  }

  return { stocksProcessed, stocksSkippedInsufficientData, eventsWritten, failed, log };
}
