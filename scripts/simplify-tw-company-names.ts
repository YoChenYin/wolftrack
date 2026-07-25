/**
 * 2026-07-26：把現有台股股票的公司名稱換成TWSE/TPEx官方簡稱（見 twCompanyNames.ts），
 * 一次性清理現有資料。之後新股票上架（onboard-tw-tickers.ts/backfill-tw-etfs.ts）
 * 已經改用同一個資料源，不會再需要重跑這支。
 *
 * 用法：npx tsx scripts/simplify-tw-company-names.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fetchTwCompanyShortNames } from "../src/lib/marketData/twCompanyNames";

async function main() {
  const shortNames = await fetchTwCompanyShortNames();
  console.log(`抓到 ${shortNames.size} 筆官方簡稱`);

  const stocks = await prisma.stock.findMany({ where: { market: "TW" }, select: { id: true, ticker: true, companyName: true } });

  let updated = 0;
  let unchanged = 0;
  let noMatch = 0;

  for (const stock of stocks) {
    const shortName = shortNames.get(stock.ticker);
    if (!shortName) {
      noMatch++;
      continue;
    }
    if (shortName === stock.companyName) {
      unchanged++;
      continue;
    }
    await prisma.stock.update({ where: { id: stock.id }, data: { companyName: shortName } });
    updated++;
  }

  console.log(`更新 ${updated} 檔，已經是簡稱不用改 ${unchanged} 檔，官方清單查無對應（維持原名，多半是ETF）${noMatch} 檔`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
