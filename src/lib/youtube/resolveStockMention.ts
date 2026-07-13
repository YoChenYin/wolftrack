import { prisma } from "@/lib/prisma";
import { fetchFinMindStockInfo } from "@/lib/marketData/finmindClient";
import { stripCompanySuffix } from "@/lib/formatCompanyName";

const TICKER_PATTERN = /^[0-9]{4,6}[A-Z]?$/;
/** 找不到對應SectorMapping.sectorNameZh時的保底分類（已在seedTw.ts驗證存在，不用新建） */
const FALLBACK_SECTOR_CODE = "TW20";

export interface ResolvedMention {
  stockId: number | null;
  isNewStock: boolean;
  resolutionNote: string | null;
}

let finMindRegistryCache: Awaited<ReturnType<typeof fetchFinMindStockInfo>> | null = null;

async function getFinMindRegistry() {
  if (!finMindRegistryCache) {
    finMindRegistryCache = await fetchFinMindStockInfo();
  }
  return finMindRegistryCache;
}

/**
 * 把LLM從逐字稿抽出的原始個股名稱/代號解析成內部stockId。刻意保守：只有「唯一明確匹配」
 * 才自動insert新股，模糊/多筆候選一律留白（stockId=null + resolutionNote）交由人工比對，
 * 不做fuzzy match硬猜（呼應這個專案「不能盲目相信爬到的ticker/name」的既有原則）。
 * US個股提及只比對已追蹤清單，絕不自動新增。
 */
export async function resolveStockMention(
  rawNameOrTicker: string,
  market: "TW" | "US" | "unknown"
): Promise<ResolvedMention> {
  const raw = rawNameOrTicker.trim();

  if (market === "US") {
    const stock = await prisma.stock.findFirst({ where: { market: "US", ticker: raw } });
    return stock
      ? { stockId: stock.id, isNewStock: false, resolutionNote: null }
      : { stockId: null, isNewStock: false, resolutionNote: "US個股，且不在已追蹤清單中，不自動新增" };
  }

  // market === "TW" || "unknown"：視同TW（絕大多數情況）
  if (TICKER_PATTERN.test(raw)) {
    const stock = await prisma.stock.findFirst({ where: { market: "TW", ticker: raw } });
    if (stock) return { stockId: stock.id, isNewStock: false, resolutionNote: null };
  }

  const existingTwStocks = await prisma.stock.findMany({
    where: { market: "TW" },
    select: { id: true, companyName: true },
  });
  const nameMatch = existingTwStocks.find((s) => stripCompanySuffix(s.companyName) === raw);
  if (nameMatch) return { stockId: nameMatch.id, isNewStock: false, resolutionNote: null };

  const registry = await getFinMindRegistry();
  const candidates = registry.filter((r) => r.ticker === raw || r.name === raw);

  if (candidates.length === 0) {
    return { stockId: null, isNewStock: false, resolutionNote: `FinMind註冊資料查無「${raw}」，需人工確認` };
  }
  if (candidates.length > 1) {
    const tickers = candidates.map((c) => c.ticker).join(", ");
    return {
      stockId: null,
      isNewStock: false,
      resolutionNote: `FinMind比對到${candidates.length}筆候選（${tickers}），無法自動判定，需人工確認`,
    };
  }

  const candidate = candidates[0];
  const sector = await prisma.sectorMapping.findFirst({
    where: { market: "TW", sectorNameZh: candidate.industryCategory },
  });
  const fallbackSector = sector ?? (await prisma.sectorMapping.findFirst({
    where: { market: "TW", sectorCode: FALLBACK_SECTOR_CODE },
  }));
  if (!fallbackSector) {
    return {
      stockId: null,
      isNewStock: false,
      resolutionNote: `找到唯一FinMind候選(${candidate.ticker})但無法解析sector，需人工確認`,
    };
  }

  const newStock = await prisma.stock.create({
    data: {
      market: "TW",
      ticker: candidate.ticker,
      companyName: candidate.name,
      sectorId: fallbackSector.id,
      industry: candidate.industryCategory,
      isActive: true,
    },
  });

  return { stockId: newStock.id, isNewStock: true, resolutionNote: null };
}
