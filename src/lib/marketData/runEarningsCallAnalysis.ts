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
 * 解析它的法說會沒有對應的展示位置）。法說會一季一次，MOPS清單查詢很輕量（純HTML GET/POST），
 * 但PDF下載+LLM解析比較重，所以用PROCESS_BUDGET限制單次呼叫真正解析（下載+LLM）的篇數，
 * 維持跟backfillTwHistory.ts一樣的「小批次、awaited、快速回應」設計。
 *
 * 2026-08-19：擴大範圍後單靠PROCESS_BUDGET追不上（尤其財報季高峰），這裡把「發現」跟「解析」
 * 拆開兩步：每次呼叫都會把清單裡「還沒看過的PDF」立刻寫一筆只有pdfFileName/日期的「待解析」
 * 紀錄（不消耗LLM額度，UI上可以直接連到PDF），額度夠的話才真的下載+LLM解析、補上摘要。
 * 額度用完的股票這輪只留下待解析紀錄，下次呼叫時（見processStock裡existing.signal===null
 * 分支）會被撿回來繼續解析，不會因為某一輪額度不夠就整份掉了。
 *
 * 龍頭股（getAllLeaderTickers）排在遍歷順序最前面，額度不夠時優先保證解析完，二軍/其餘
 * 板塊成員排後面——同樣是「額度不夠沒解析」，龍頭股比較少見，其餘股票比較常見也可接受。
 */
const PROCESS_BUDGET_PER_INVOCATION = 8;
/** 內容太短的PDF擷取結果視為異常（可能是掃描圖檔或下載失敗），跳過不送LLM */
const MIN_TEXT_LENGTH = 200;

interface StockResult {
  ticker: string;
  discovered: number;
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

  let discovered = 0;
  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let budgetUsed = 0;
  const errorMessages: string[] = [];

  for (const entry of entries) {
    const existing = await prisma.earningsCallAnalysis.findUnique({ where: { pdfFileName: entry.pdfFileName } });

    if (existing && existing.signal !== null) {
      skipped++;
      continue; // 已經完整解析過
    }

    if (!existing) {
      // 先建立「待解析」紀錄（只有檔名/日期，沒有LLM摘要）——就算這輪額度不夠沒辦法馬上解析，
      // 使用者在UI上還是看得到「有簡報，尚未解析」+ 可以直接點開PDF原文
      await prisma.earningsCallAnalysis.create({
        data: { stockId, conferenceDate: new Date(entry.conferenceDate), pdfFileName: entry.pdfFileName },
      });
      discovered++;
    }

    if (budgetUsed >= budgetRemaining) continue; // 沒有LLM額度了，留著待解析紀錄，下次再處理

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
      await prisma.earningsCallAnalysis.update({
        where: { pdfFileName: entry.pdfFileName },
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
      console.error(`[earningsCall] ${ticker}/${entry.pdfFileName} failed:`, err);
      errorMessages.push(`${entry.pdfFileName}: ${message}`);
      errors++;
    }
  }

  return { result: { ticker, discovered, processed, skipped, errors, errorMessages }, budgetUsed };
}

export interface EarningsCallBatchResult {
  stocksChecked: number;
  totalDiscovered: number;
  totalProcessed: number;
  totalErrors: number;
  results: StockResult[];
}

export async function runEarningsCallAnalysisBatch(): Promise<EarningsCallBatchResult> {
  const themedTickers = getAllThemedTickers();
  const leaderTickers = new Set(getAllLeaderTickers());
  // 龍頭優先、其餘依代號排序——額度不夠時最先保證解析完的是龍頭股
  const universeTickers = [...themedTickers].sort((a, b) => {
    const aRank = leaderTickers.has(a) ? 0 : 1;
    const bRank = leaderTickers.has(b) ? 0 : 1;
    return aRank !== bRank ? aRank - bRank : a.localeCompare(b);
  });

  const stocks = await prisma.stock.findMany({
    where: { market: "TW", ticker: { in: universeTickers } },
    select: { id: true, ticker: true },
  });
  const stockByTicker = new Map(stocks.map((s) => [s.ticker, s]));

  const finmindInfo = await fetchFinMindStockInfo();
  const typeByTicker = new Map(finmindInfo.map((s) => [s.ticker, s.type]));

  const results: StockResult[] = [];
  let budgetRemaining = PROCESS_BUDGET_PER_INVOCATION;

  for (const ticker of universeTickers) {
    if (budgetRemaining <= 0) break;

    const stock = stockByTicker.get(ticker);
    if (!stock) continue; // 板塊設定裡有、但我們資料庫還沒追蹤的股票

    const rawType = typeByTicker.get(ticker);
    const typeK: "sii" | "otc" = rawType === "tpex" ? "otc" : "sii";

    try {
      const { result, budgetUsed } = await processStock(stock.id, ticker, typeK, budgetRemaining);
      results.push(result);
      budgetRemaining -= budgetUsed;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[earningsCall] failed to check conference list for ${ticker}:`, err);
      results.push({ ticker, discovered: 0, processed: 0, skipped: 0, errors: 1, errorMessages: [message] });
    }
  }

  return {
    stocksChecked: results.length,
    totalDiscovered: results.reduce((sum, r) => sum + r.discovered, 0),
    totalProcessed: results.reduce((sum, r) => sum + r.processed, 0),
    totalErrors: results.reduce((sum, r) => sum + r.errors, 0),
    results,
  };
}
