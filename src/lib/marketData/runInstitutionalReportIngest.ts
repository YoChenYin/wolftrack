import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { resolveStockMention } from "@/lib/youtube/resolveStockMention";
import { backfillSingleTwStock } from "./backfillSingleTwStock";
import { ESUNSEC_CATEGORIES, fetchCategoryArticles, fetchArticleFullText } from "./esunsecClient";
import { parseInstitutionalReport, type InstitutionalReportMentionRaw } from "./parseInstitutionalReport";

/**
 * 法人報告批次處理，跟runEarningsCallAnalysis.ts同一套「發現/解析拆分」設計：先把
 * 分類清單裡「還沒看過的文章」立刻寫一筆只有title/date/sourceUrl的「待解析」紀錄
 * （不消耗LLM額度，UI上可以直接連到原文），額度夠的話才真的下載內文+LLM解析、補上
 * industryTheme/summary/signal跟提及個股清單。目前只接玉山證券的「台股熱點」「總經
 * 盤勢」兩個分類（見esunsecClient.ts）。
 */
const PROCESS_BUDGET_PER_INVOCATION = 8;
/** 內文太短視為異常（可能是網站改版、或整篇是會員限定內容擷取失敗），跳過不送LLM */
const MIN_TEXT_LENGTH = 100;

export interface InstitutionalReportBatchResult {
  discovered: number;
  processed: number;
  errors: number;
  errorMessages: string[];
}

async function discoverNewArticles(): Promise<{ discovered: number; errorMessages: string[] }> {
  let discovered = 0;
  const errorMessages: string[] = [];

  for (const category of ESUNSEC_CATEGORIES) {
    let articles;
    try {
      articles = await fetchCategoryArticles(category.id, category.label);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[institutionalReport] failed to fetch category ${category.label}:`, err);
      errorMessages.push(`分類「${category.label}」清單抓取失敗: ${message}`);
      continue;
    }

    for (const article of articles) {
      if (article.isMemberOnly) continue; // 會員限定內容不強行擷取付費牆後的內容

      const existing = await prisma.institutionalReportArticle.findUnique({ where: { postId: article.postId } });
      if (existing) continue;

      await prisma.institutionalReportArticle.create({
        data: {
          sourceName: "玉山證券",
          postId: article.postId,
          title: article.title,
          publishDate: new Date(article.publishDate),
          category: article.category,
          sourceUrl: article.sourceUrl,
        },
      });
      discovered++;
    }
  }

  return { discovered, errorMessages };
}

/** 跟runYoutubeParseAndResolve.ts同一套：解析出的個股逐一比對成內部stockId（必要時
 * 自動新增），新股觸發一次性回補，沒有任何價格歷史的話直接標記isActive=false避免弄髒
 * 追蹤清單 */
async function resolveMentions(articleId: number, mentions: InstitutionalReportMentionRaw[]): Promise<void> {
  // 這篇文章可能因為上次呼叫中途失敗被重複解析，先清掉舊的mentions才能安全重跑
  await prisma.institutionalReportMention.deleteMany({ where: { articleId } });

  for (const mention of mentions) {
    const resolved = await resolveStockMention(mention.rawNameOrTicker, mention.market);

    await prisma.institutionalReportMention.create({
      data: {
        articleId,
        stockId: resolved.stockId,
        rawNameOrTicker: mention.rawNameOrTicker,
        isNewStock: resolved.isNewStock,
        resolutionNote: resolved.resolutionNote,
        sentiment: mention.sentiment,
        chainLayer: mention.chainLayer,
        role: mention.role,
      },
    });

    if (resolved.isNewStock && resolved.stockId !== null) {
      const newStock = await prisma.stock.findUnique({ where: { id: resolved.stockId } });
      if (newStock) {
        try {
          const backfill = await backfillSingleTwStock(newStock.id, newStock.ticker);
          if (backfill.priceBars === 0) {
            await prisma.stock.update({ where: { id: newStock.id }, data: { isActive: false } });
            console.warn(`[institutionalReport] ${newStock.ticker} has no price history anywhere, marked inactive`);
          }
        } catch (err) {
          console.error(`[institutionalReport] backfill failed for new stock ${newStock.ticker}:`, err);
        }
      }
    }
  }
}

async function parsePendingArticles(budget: number): Promise<{ processed: number; errors: number; errorMessages: string[] }> {
  const pending = await prisma.institutionalReportArticle.findMany({
    where: { signal: null },
    orderBy: { publishDate: "desc" },
    take: budget,
  });

  let processed = 0;
  let errors = 0;
  const errorMessages: string[] = [];

  for (const article of pending) {
    try {
      const text = await fetchArticleFullText(article.postId);
      if (!text || text.length < MIN_TEXT_LENGTH) {
        console.warn(`[institutionalReport] ${article.postId} content too short or missing, skipping`);
        continue;
      }

      const analysis = await parseInstitutionalReport(text);
      await resolveMentions(article.id, analysis.mentions);

      await prisma.institutionalReportArticle.update({
        where: { id: article.id },
        data: {
          industryTheme: analysis.industryTheme,
          summary: analysis.summary,
          signal: analysis.signal,
          keyMetrics: analysis.keyMetrics as unknown as Prisma.InputJsonValue,
          bullCoreLogic: analysis.bullCase.coreLogic,
          bullTrigger: analysis.bullCase.trigger,
          bearCoreLogic: analysis.bearCase.coreLogic,
          bearBottleneck: analysis.bearCase.bottleneck,
          tags: analysis.tags as unknown as Prisma.InputJsonValue,
        },
      });
      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[institutionalReport] ${article.postId} failed:`, err);
      errorMessages.push(`${article.postId}: ${message}`);
      errors++;
    }
  }

  return { processed, errors, errorMessages };
}

export async function runInstitutionalReportIngestBatch(): Promise<InstitutionalReportBatchResult> {
  const discoverResult = await discoverNewArticles();
  const parseResult = await parsePendingArticles(PROCESS_BUDGET_PER_INVOCATION);

  return {
    discovered: discoverResult.discovered,
    processed: parseResult.processed,
    errors: parseResult.errors,
    errorMessages: [...discoverResult.errorMessages, ...parseResult.errorMessages],
  };
}
