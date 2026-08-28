import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { walkForwardTechnicalRuleBacktest, type TechnicalRuleEvent } from "@/lib/trend/tw/backtestTechnicalRules";
import { BACKTEST_HORIZONS } from "@/lib/trend/tw/backtestWalkForward";
import type { OhlcvBar } from "@/lib/trend/types";

const MIN_BARS_REQUIRED = 210;

export interface TwTechnicalRuleBacktestResult {
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

function toRow(stockId: number, event: TechnicalRuleEvent) {
  return {
    stockId,
    ruleType: event.ruleType,
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
  } satisfies Prisma.TwTechnicalRuleBacktestEventCreateManyInput;
}

/**
 * 跑一次純技術規則回測（見backtestTechnicalRules.ts），寫進tw_technical_rule_backtest_events。
 * 冪等：每次執行前先清空舊事件再整批寫入，跟runTwSignalBacktest.ts/runTwScenarioBacktest.ts
 * 同一套設計。純技術規則不用機構籌碼資料，只需要TwDailyPrice，不用另外查TwInstitutionalTrading。
 */
export async function runTwTechnicalRuleBacktest(tickerFilter?: string[]): Promise<TwTechnicalRuleBacktestResult> {
  const log: string[] = [];

  const taiexStock = await prisma.stock.findUnique({ where: { market_ticker: { market: "TW", ticker: "TAIEX" } } });
  if (!taiexStock) throw new Error('找不到 TAIEX 合成股票紀錄，先跑 `npx prisma db seed` 和 tw-backfill.ts。');
  const taiexBars = await loadPriceBars(taiexStock.id);
  if (taiexBars.length === 0) throw new Error("TAIEX 沒有價格歷史，先跑 tw-backfill.ts。");

  const stocks = await prisma.stock.findMany({
    where: { market: "TW", isActive: true, ticker: { not: "TAIEX" }, ...(tickerFilter ? { ticker: { in: tickerFilter } } : {}) },
    select: { id: true, ticker: true, companyName: true },
  });

  await prisma.twTechnicalRuleBacktestEvent.deleteMany({
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
      const events = walkForwardTechnicalRuleBacktest(bars, taiexBars);

      if (events.length > 0) {
        const result = await prisma.twTechnicalRuleBacktestEvent.createMany({
          data: events.map((e) => toRow(stock.id, e)),
          skipDuplicates: true,
        });
        eventsWritten += result.count;
      }
      stocksProcessed++;
      const line = `[${stocksProcessed + stocksSkippedInsufficientData}/${stocks.length}] ${stock.ticker} ${stock.companyName}: ${events.length} 筆事件`;
      log.push(line);
      console.log(line);
    } catch (err) {
      const line = `[${stocksProcessed + stocksSkippedInsufficientData}/${stocks.length}] ${stock.ticker} ${stock.companyName}: FAILED, skipping — ${(err as Error).message}`;
      failed.push({ ticker: stock.ticker, error: (err as Error).message });
      log.push(line);
      console.log(line);
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
