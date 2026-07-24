/**
 * 2026-07-25：把台股全部ETF（含上市/上櫃、股票型/債券型）加進追蹤清單，只負責建立 Stock 列，
 * 不在這裡抓歷史資料——建立後交給 scripts/backfill-tw-10y-history.ts（透過
 * /api/cron/tw-history-backfill 分批觸發）去回補價格/籌碼/營收歷史，避免這支腳本又做一次
 * 重複的回補邏輯。
 *
 * FinMind的TaiwanStockInfo資料集裡，ETF用industry_category區分成三類：
 * "ETF"（上市，例如0050/0056）、"上櫃ETF"、"上櫃指數股票型基金(ETF)"（上櫃債券型ETF），
 * 三類全部收錄，不篩選（使用者2026-07-25確認全部都要）。
 *
 * 用法：npx tsx scripts/backfill-tw-etfs.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fetchFinMindStockInfo } from "../src/lib/marketData/finmindClient";

const ETF_SECTOR_CODE = "ETF";

async function main() {
  const allInfo = await fetchFinMindStockInfo();
  const etfInfo = allInfo.filter((s) => s.industryCategory.includes("ETF"));
  console.log(`FinMind回傳 ${allInfo.length} 檔股票，其中 ${etfInfo.length} 檔是ETF`);

  const sector = await prisma.sectorMapping.upsert({
    where: { market_sectorCode: { market: "TW", sectorCode: ETF_SECTOR_CODE } },
    update: {},
    create: {
      market: "TW",
      sectorCode: ETF_SECTOR_CODE,
      sectorName: "ETF",
      sectorNameZh: "ETF",
      displayOrder: 98,
    },
  });

  let created = 0;
  let updated = 0;
  for (const etf of etfInfo) {
    const existing = await prisma.stock.findUnique({
      where: { market_ticker: { market: "TW", ticker: etf.ticker } },
    });
    if (existing) {
      await prisma.stock.update({
        where: { id: existing.id },
        data: { companyName: etf.name, industry: etf.industryCategory, isActive: true },
      });
      updated++;
    } else {
      await prisma.stock.create({
        data: {
          market: "TW",
          ticker: etf.ticker,
          companyName: etf.name,
          sectorId: sector.id,
          industry: etf.industryCategory,
          isActive: true,
        },
      });
      created++;
    }
  }

  console.log(`新增 ${created} 檔、更新 ${updated} 檔，共 ${etfInfo.length} 檔ETF`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
