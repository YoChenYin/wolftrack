import { prisma } from "@/lib/prisma";
import { getLeaderAndSecondTierTickers } from "@/lib/valuation/researchUniverse";
import { fetchFinMindStockInfo } from "./finmindClient";
import { fetchEarningsConferenceList, downloadMopsPdf } from "./mopsClient";
import { extractPdfText } from "./extractPdfText";
import { parseEarningsCall } from "./parseEarningsCall";

/**
 * 2026-07-25：龍頭股法說會基本面訊號批次處理，2026-08-16擴大到「龍頭+二軍」
 * （getLeaderAndSecondTierTickers，目前約150-250檔，見該函式說明），不是全部~800檔
 * （成本/尖峰財報季processing lag換算過不划算）。法說會一季一次，MOPS清單查詢很輕量
 * （純HTML GET/POST，對公開政府網站來說微不足道），但PDF下載+LLM解析比較重，所以用
 * PROCESS_BUDGET限制單次呼叫真正處理（下載+LLM）的篇數，維持跟backfillTwHistory.ts
 * 一樣的「小批次、awaited、快速回應」設計——2026-07-21修YouTube LLM解析fire-and-forget
 * 問題的教訓：長時間工作不能丟給單一個Zeabur request，由外部（GitHub Actions排程）
 * 反覆呼叫來達成。已經處理過的法說會（pdfFileName已存在）永遠會被跳過，不會重複消耗LLM額度。
 */
const PROCESS_BUDGET_PER_INVOCATION = 8;
/** 內容太短的PDF擷取結果視為異常（可能是掃描圖檔或下載失敗），跳過不送LLM */
const MIN_TEXT_LENGTH = 200;

interface StockResult {
  ticker: string;
  processed: number;
  skipped: number;
  errors: number;
  errorMessages: string[];
}

async function processStock(
  stockId: number,
  ticker: string,
  typeK: "sii" | "otc",
  budgetRemaining: number
): Promise<{ result: StockResult; budgetUsed: number }> {
  const rocYear = new Date().getFullYear() - 1911;
  const entries = await fetchEarningsConferenceList(ticker, typeK, rocYear);

  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let budgetUsed = 0;
  const errorMessages: string[] = [];

  for (const entry of entries) {
    if (budgetUsed >= budgetRemaining) break;

    const existing = await prisma.earningsCallAnalysis.findUnique({ where: { pdfFileName: entry.pdfFileName } });
    if (existing) {
      skipped++;
      continue;
    }

    budgetUsed++;
    try {
      const pdfBuffer = await downloadMopsPdf(entry.pdfFileName);
      const text = await extractPdfText(pdfBuffer);
      if (text.length < MIN_TEXT_LENGTH) {
        console.warn(`[earningsCall] ${ticker}/${entry.pdfFileName} extracted text too short (${text.length}), skipping`);
        skipped++;
        continue;
      }

      const analysis = await parseEarningsCall(text);
      await prisma.earningsCallAnalysis.create({
        data: {
          stockId,
          conferenceDate: new Date(entry.conferenceDate),
          pdfFileName: entry.pdfFileName,
          profitGrowthSummary: analysis.profitGrowthSummary,
          outlookSummary: analysis.outlookSummary,
          riskSummary: analysis.riskSummary,
          signal: analysis.signal,
        },
      });
      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[earningsCall] ${ticker}/${entry.pdfFileName} failed:`, err);
      errorMessages.push(`${entry.pdfFileName}: ${message}`);
      errors++;
    }
  }

  return { result: { ticker, processed, skipped, errors, errorMessages }, budgetUsed };
}

export interface EarningsCallBatchResult {
  stocksChecked: number;
  totalProcessed: number;
  totalErrors: number;
  results: StockResult[];
}

export async function runEarningsCallAnalysisBatch(): Promise<EarningsCallBatchResult> {
  const universeTickers = await getLeaderAndSecondTierTickers();
  const stocks = await prisma.stock.findMany({
    where: { market: "TW", ticker: { in: universeTickers } },
    select: { id: true, ticker: true },
    orderBy: { ticker: "asc" },
  });

  const finmindInfo = await fetchFinMindStockInfo();
  const typeByTicker = new Map(finmindInfo.map((s) => [s.ticker, s.type]));

  const results: StockResult[] = [];
  let budgetRemaining = PROCESS_BUDGET_PER_INVOCATION;

  for (const stock of stocks) {
    if (budgetRemaining <= 0) break;

    const rawType = typeByTicker.get(stock.ticker);
    const typeK: "sii" | "otc" = rawType === "tpex" ? "otc" : "sii";

    try {
      const { result, budgetUsed } = await processStock(stock.id, stock.ticker, typeK, budgetRemaining);
      results.push(result);
      budgetRemaining -= budgetUsed;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[earningsCall] failed to check conference list for ${stock.ticker}:`, err);
      results.push({ ticker: stock.ticker, processed: 0, skipped: 0, errors: 1, errorMessages: [message] });
    }
  }

  return {
    stocksChecked: results.length,
    totalProcessed: results.reduce((sum, r) => sum + r.processed, 0),
    totalErrors: results.reduce((sum, r) => sum + r.errors, 0),
    results,
  };
}
