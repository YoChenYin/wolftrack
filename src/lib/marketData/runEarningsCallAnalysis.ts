import { prisma } from "@/lib/prisma";
import { getAllLeaderTickers, getAllThemedTickers } from "@/lib/valuation/groupConfig";
import { fetchFinMindStockInfo } from "./finmindClient";
import { fetchEarningsConferenceList, downloadMopsPdf } from "./mopsClient";
import { extractPdfText } from "./extractPdfText";
import { parseEarningsCall } from "./parseEarningsCall";

/**
 * 2026-07-25：龍頭股法說會基本面訊號批次處理，2026-08-16擴大到「龍頭+二軍」，
 * 2026-08-19再擴大到「所有有分類到板塊的股票」（getAllThemedTickers，目前約290檔，
 * 不是全部~800+檔——完全沒被任何板塊收錄的股票在這個app裡本來就不會出現在選股/產業鏈頁面，
 * 解析它的法說會沒有對應的展示位置），以及近7天出現「投信轉買/投信外資合買」訊號的股票
 * （getInstitutionalAccumulationTickers，不限於有分類到板塊）。
 *
 * 2026-08-19：把「發現」跟「解析」拆成兩個完全獨立的階段（跟runInstitutionalReportIngest.ts
 * 同一套設計）——原本兩者是合在processStock裡一輪跑完，外層迴圈額度用完就整個break，連
 * 「發現」都會被腰斬（尤其本機沒有ANTHROPIC_API_KEY時，第一檔股票的PDF解析就會直接
 * 丟例外、但budgetUsed照樣算掉，等於連8檔股票的清單都掃不完）。拆開後：
 * - discoverNewFilings()：掃全部universe的MOPS法說會清單，新PDF立刻寫一筆只有pdfFileName/
 *   日期的「待解析」紀錄，不消耗LLM額度，可以放心對全市場跑。
 * - parsePendingFilings(budget)：從DB找還沒解析（signal為null）的紀錄，額度內下載+LLM解析。
 * 排程呼叫時兩階段都跑（見runEarningsCallAnalysisBatch）；本機沒有LLM金鑰時可以只呼叫
 * discoverNewFilings() 補齊「待解析」清單，解析留給有金鑰的正式環境排程處理。
 */
const PROCESS_BUDGET_PER_INVOCATION = 8;
/** 內容太短的PDF擷取結果視為異常（可能是掃描圖檔或下載失敗），跳過不送LLM */
const MIN_TEXT_LENGTH = 200;
/** 「投信外資開始佈局」訊號的時效窗口，跟computeChainSignals.ts的RECENCY_WINDOW_DAYS同一套邏輯 */
const ACCUMULATION_SIGNAL_RECENCY_DAYS = 7;

/** 近幾天出現「投信由賣轉買」或「投信外資同時買超」的股票代號（見classifyChipFlow.ts），
 * 不限於group_config.json收錄的板塊——這是「當下正在發生的籌碼動向」，跟板塊分類是
 * 兩套獨立的入選邏輯，各自都可能覆蓋到另一邊沒有的股票 */
async function getInstitutionalAccumulationTickers(): Promise<string[]> {
  const cutoff = new Date(Date.now() - ACCUMULATION_SIGNAL_RECENCY_DAYS * 86_400_000);
  const rows = await prisma.dailyTrendSignal.findMany({
    where: {
      tradeDate: { gte: cutoff },
      status: { in: ["trustTurnBuy", "combinedBuy"] },
      stock: { market: "TW" },
    },
    select: { stock: { select: { ticker: true } } },
    distinct: ["stockId"],
  });
  return rows.map((r) => r.stock.ticker);
}

/** 龍頭優先、其次是剛被投信/外資點名的股票、其餘依代號排序——時效性最重要的兩種股票
 * 排最前面，遍歷順序中途被打斷（例如MOPS請求失敗）時受影響的機率最低 */
async function buildUniverseTickers(): Promise<string[]> {
  const themedTickers = getAllThemedTickers();
  const accumulationTickers = await getInstitutionalAccumulationTickers();
  const leaderTickers = new Set(getAllLeaderTickers());
  const accumulationSet = new Set(accumulationTickers);

  return [...new Set([...themedTickers, ...accumulationTickers])].sort((a, b) => {
    const rank = (t: string) => (leaderTickers.has(t) ? 0 : accumulationSet.has(t) ? 1 : 2);
    const aRank = rank(a);
    const bRank = rank(b);
    return aRank !== bRank ? aRank - bRank : a.localeCompare(b);
  });
}

interface DiscoverStockResult {
  ticker: string;
  discovered: number;
  skipped: number;
  errors: number;
  errorMessages: string[];
}

export interface DiscoverFilingsResult {
  stocksChecked: number;
  totalDiscovered: number;
  totalErrors: number;
  results: DiscoverStockResult[];
}

/**
 * 掃全市場universe的MOPS法說會清單，新PDF立刻寫一筆「待解析」紀錄。純HTML GET/POST查詢，
 * 不下載PDF、不呼叫LLM，對全市場（目前約290+檔）跑也很輕量，不用額度限制。
 */
export async function discoverNewFilings(): Promise<DiscoverFilingsResult> {
  const universeTickers = await buildUniverseTickers();

  const stocks = await prisma.stock.findMany({
    where: { market: "TW", ticker: { in: universeTickers } },
    select: { id: true, ticker: true },
  });
  const stockByTicker = new Map(stocks.map((s) => [s.ticker, s]));

  const finmindInfo = await fetchFinMindStockInfo();
  const typeByTicker = new Map(finmindInfo.map((s) => [s.ticker, s.type]));

  const rocYear = new Date().getFullYear() - 1911;
  const results: DiscoverStockResult[] = [];

  for (const ticker of universeTickers) {
    const stock = stockByTicker.get(ticker);
    if (!stock) continue; // 板塊設定裡有、但我們資料庫還沒追蹤的股票

    const rawType = typeByTicker.get(ticker);
    const typeK: "sii" | "otc" = rawType === "tpex" ? "otc" : "sii";

    let discovered = 0;
    let skipped = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    try {
      const entries = await fetchEarningsConferenceList(ticker, typeK, rocYear);
      for (const entry of entries) {
        const existing = await prisma.earningsCallAnalysis.findUnique({ where: { pdfFileName: entry.pdfFileName } });
        if (existing) {
          skipped++;
          continue;
        }
        await prisma.earningsCallAnalysis.create({
          data: { stockId: stock.id, conferenceDate: new Date(entry.conferenceDate), pdfFileName: entry.pdfFileName },
        });
        discovered++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[earningsCall] failed to check conference list for ${ticker}:`, err);
      errorMessages.push(message);
      errors++;
    }

    results.push({ ticker, discovered, skipped, errors, errorMessages });
  }

  return {
    stocksChecked: results.length,
    totalDiscovered: results.reduce((sum, r) => sum + r.discovered, 0),
    totalErrors: results.reduce((sum, r) => sum + r.errors, 0),
    results,
  };
}

export interface ParseFilingsResult {
  processed: number;
  skipped: number;
  errors: number;
  errorMessages: string[];
}

/** 從DB找還沒解析（signal為null）的紀錄，額度內下載PDF+LLM解析、補上摘要 */
export async function parsePendingFilings(budget: number): Promise<ParseFilingsResult> {
  const pending = await prisma.earningsCallAnalysis.findMany({
    where: { signal: null },
    orderBy: { conferenceDate: "desc" },
    take: budget,
    include: { stock: { select: { ticker: true } } },
  });

  let processed = 0;
  let skipped = 0;
  let errors = 0;
  const errorMessages: string[] = [];

  for (const filing of pending) {
    try {
      const pdfBuffer = await downloadMopsPdf(filing.pdfFileName);
      const text = await extractPdfText(pdfBuffer);
      if (text.length < MIN_TEXT_LENGTH) {
        console.warn(`[earningsCall] ${filing.stock.ticker}/${filing.pdfFileName} extracted text too short (${text.length}), skipping`);
        skipped++;
        continue;
      }

      const analysis = await parseEarningsCall(text);
      await prisma.earningsCallAnalysis.update({
        where: { pdfFileName: filing.pdfFileName },
        data: {
          profitGrowthSummary: analysis.profitGrowthSummary,
          outlookSummary: analysis.outlookSummary,
          riskSummary: analysis.riskSummary,
          signal: analysis.signal,
        },
      });
      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[earningsCall] ${filing.stock.ticker}/${filing.pdfFileName} failed:`, err);
      errorMessages.push(`${filing.stock.ticker}/${filing.pdfFileName}: ${message}`);
      errors++;
    }
  }

  return { processed, skipped, errors, errorMessages };
}

export interface EarningsCallBatchResult {
  stocksChecked: number;
  totalDiscovered: number;
  totalProcessed: number;
  totalErrors: number;
}

export async function runEarningsCallAnalysisBatch(): Promise<EarningsCallBatchResult> {
  const discoverResult = await discoverNewFilings();
  const parseResult = await parsePendingFilings(PROCESS_BUDGET_PER_INVOCATION);

  return {
    stocksChecked: discoverResult.stocksChecked,
    totalDiscovered: discoverResult.totalDiscovered,
    totalProcessed: parseResult.processed,
    totalErrors: discoverResult.totalErrors + parseResult.errors,
  };
}
