import { prisma } from "@/lib/prisma";
import { parseTranscript } from "./parseTranscript";
import { resolveStockMention } from "./resolveStockMention";
import { backfillSingleTwStock } from "@/lib/marketData/backfillSingleTwStock";
import type { MentionAgreement, TrendStatus } from "@/generated/prisma/enums";

/**
 * 交叉驗證用「系統當下」（處理當下的最新一筆DailyTrendSignal），不是「影片發布當天」——
 * 後者需要額外的歷史時間窗查詢，對一個人眼就能在UI上並排比對日期的功能來說不成比例地複雜，
 * 這裡採用即算即定、不重算的immutable snapshot（跟DailyTrendSignal本身的精神一致）。
 * TrendStatus完全沒有看空分類，所以只有sentiment=bullish才有得比：系統當下有訊號=agree，
 * 沒有=aheadOfSystem（網紅已經看多但系統還沒亮燈，這才是最有價值的落差案例）。
 */
async function computeAgreement(
  stockId: number,
  sentiment: "bullish" | "bearish" | "neutral"
): Promise<{ systemStatus: TrendStatus | null; agreement: MentionAgreement }> {
  if (sentiment !== "bullish") {
    return { systemStatus: null, agreement: "noData" };
  }
  const latestSignal = await prisma.dailyTrendSignal.findFirst({
    where: { stockId },
    orderBy: { tradeDate: "desc" },
  });
  if (!latestSignal) {
    return { systemStatus: null, agreement: "aheadOfSystem" };
  }
  return { systemStatus: latestSignal.status, agreement: "agree" };
}

/**
 * 逐字稿寫入後的orchestrator：LLM解析出個股提及 -> 逐一解析成內部stockId(必要時自動新增)
 * -> 算交叉驗證agreement -> 寫入YoutubeStockMention -> 新股觸發一次性回補。
 */
export async function runYoutubeParseAndResolve(videoId: number): Promise<void> {
  const video = await prisma.youtubeVideo.findUnique({ where: { id: videoId } });
  if (!video || !video.transcript) {
    throw new Error(`[runYoutubeParseAndResolve] video ${videoId} not found or has no transcript`);
  }

  const analysis = await parseTranscript(video.transcript);

  for (const mention of analysis.mentions) {
    const resolved = await resolveStockMention(mention.rawNameOrTicker, mention.market);

    let systemStatus: TrendStatus | null = null;
    let agreement: MentionAgreement | null = null;
    if (resolved.stockId !== null) {
      const result = await computeAgreement(resolved.stockId, mention.sentiment);
      systemStatus = result.systemStatus;
      agreement = result.agreement;
    }

    await prisma.youtubeStockMention.create({
      data: {
        videoId: video.id,
        stockId: resolved.stockId,
        rawNameOrTicker: mention.rawNameOrTicker,
        sentiment: mention.sentiment,
        reasoningExcerpt: mention.reasoningExcerpt,
        entryReason: mention.entryReason,
        exitCondition: mention.exitCondition,
        isNewStock: resolved.isNewStock,
        resolutionNote: resolved.resolutionNote,
        systemStatus,
        agreement,
      },
    });

    if (resolved.isNewStock && resolved.stockId !== null) {
      const newStock = await prisma.stock.findUnique({ where: { id: resolved.stockId } });
      if (newStock) {
        try {
          const backfill = await backfillSingleTwStock(newStock.id, newStock.ticker);
          // FinMind的TaiwanStockInfo註冊資料包含沒有實際交易紀錄的ticker（例如下市、
          // 註冊但未實際掛牌），實測發現過（誠致/3614查得到公司資料但TWSE/FinMind都
          // 沒有任何價格歷史）。這種情況回補會是空的，讓它永遠isActive=true只會是個
          // 死資料、系統排程永遠不會處理它，這裡直接關掉isActive避免弄髒追蹤清單。
          if (backfill.priceBars === 0) {
            await prisma.stock.update({ where: { id: newStock.id }, data: { isActive: false } });
            console.warn(
              `[runYoutubeParseAndResolve] ${newStock.ticker} has no price history anywhere, marked inactive`
            );
          }
        } catch (err) {
          console.error(`[runYoutubeParseAndResolve] backfill failed for new stock ${newStock.ticker}:`, err);
        }
      }
    }
  }

  await prisma.youtubeVideo.update({
    where: { id: video.id },
    data: { summary: analysis.summary, processedAt: new Date() },
  });
}
