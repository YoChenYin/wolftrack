/**
 * 2026-07-25：把指定的台股代號加進追蹤清單（Stock列），用途：group_config.json手動補上
 * 新的產業鏈/題材資料時，裡面常常包含目前還沒被追蹤的股票代號，這支腳本負責把它們
 * 補進stocks表——只建立Stock列，不抓歷史資料，交給scripts/backfill-tw-10y-history.ts
 * （透過 /api/cron/tw-history-backfill 排程）之後自動回補，避免這裡重複寫一次回補邏輯。
 *
 * sector比對邏輯比照 resolveStockMention.ts：優先用FinMind industry_category對應現有
 * SectorMapping.sectorNameZh，找不到就掛到 TW20（其他業）。
 *
 * 用法：npx tsx scripts/onboard-tw-tickers.ts 2338,2342,2434,...
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fetchFinMindStockInfo } from "../src/lib/marketData/finmindClient";

const FALLBACK_SECTOR_CODE = "TW20";

async function main() {
  const tickers = process.argv[2]?.split(",").map((t) => t.trim()).filter(Boolean);
  if (!tickers || tickers.length === 0) {
    console.error("用法：npx tsx scripts/onboard-tw-tickers.ts 2338,2342,...");
    process.exitCode = 1;
    return;
  }

  const allInfo = await fetchFinMindStockInfo();
  const infoByTicker = new Map(allInfo.map((s) => [s.ticker, s]));

  const fallbackSector = await prisma.sectorMapping.findFirst({
    where: { market: "TW", sectorCode: FALLBACK_SECTOR_CODE },
  });
  if (!fallbackSector) throw new Error(`找不到fallback sector ${FALLBACK_SECTOR_CODE}`);

  let created = 0;
  let skippedExisting = 0;
  let skippedNotFound = 0;

  for (const ticker of tickers) {
    const existing = await prisma.stock.findUnique({ where: { market_ticker: { market: "TW", ticker } } });
    if (existing) {
      skippedExisting++;
      continue;
    }

    const info = infoByTicker.get(ticker);
    if (!info) {
      console.warn(`FinMind查無「${ticker}」，跳過`);
      skippedNotFound++;
      continue;
    }

    const sector = await prisma.sectorMapping.findFirst({
      where: { market: "TW", sectorNameZh: info.industryCategory },
    });

    await prisma.stock.create({
      data: {
        market: "TW",
        ticker: info.ticker,
        companyName: info.name,
        sectorId: (sector ?? fallbackSector).id,
        industry: info.industryCategory,
        isActive: true,
      },
    });
    created++;
  }

  console.log(`新增 ${created} 檔，已存在跳過 ${skippedExisting} 檔，FinMind查無跳過 ${skippedNotFound} 檔`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
