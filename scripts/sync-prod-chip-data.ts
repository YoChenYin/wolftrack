/**
 * 一次性工具：把 production 真實的 tw_institutional_trading / tw_monthly_revenue 資料同步到本機，
 * 取代本機被 seed-tw-mock-signals.ts 污染的假資料。
 *
 * 用 ticker+market 對應本機的 stockId，不是直接複製 stock_id——production 跟本機是兩個獨立資料庫
 * 實例，同一個 stock_id 數字在兩邊指向不同股票（實測 2330 在 production 是 id=118，本機是 id=384），
 * 直接複製 stock_id 會整個對錯。
 *
 * PROD_DATABASE_URL 用環境變數傳入，不寫死在檔案裡。
 * 用法：PROD_DATABASE_URL="postgresql://..." npx tsx scripts/_sync-prod-chip-data.ts
 */
import "dotenv/config";
import { Client } from "pg";
import { prisma } from "../src/lib/prisma";

const BATCH_SIZE = 5000;

async function main() {
  const prodUrl = process.env.PROD_DATABASE_URL;
  if (!prodUrl) throw new Error("請用 PROD_DATABASE_URL 環境變數傳入 production 連線字串");

  const prod = new Client({ connectionString: prodUrl });
  await prod.connect();

  const localStocks = await prisma.stock.findMany({ where: { market: "TW" }, select: { id: true, ticker: true } });
  const tickerToLocalId = new Map(localStocks.map((s) => [s.ticker, s.id]));
  console.log(`本機 TW 股票數：${localStocks.length}`);

  // --- tw_institutional_trading ---
  const instRes = await prod.query(`
    SELECT s.ticker, t.trade_date, t.foreign_net_buy_shares, t.foreign_net_buy_amount,
           t.invest_trust_net_buy_shares, t.invest_trust_net_buy_amount,
           t.dealer_net_buy_shares, t.dealer_net_buy_amount, t.total_volume_shares
    FROM tw_institutional_trading t
    JOIN stocks s ON s.id = t.stock_id
    WHERE s.market = 'TW'
    ORDER BY t.trade_date ASC
  `);
  console.log(`production tw_institutional_trading：${instRes.rows.length} 筆`);

  let instMatched = 0;
  let instSkipped = 0;
  const instData: {
    stockId: number;
    tradeDate: Date;
    foreignNetBuyShares: bigint;
    foreignNetBuyAmount: string;
    investTrustNetBuyShares: bigint;
    investTrustNetBuyAmount: string;
    dealerNetBuyShares: bigint;
    dealerNetBuyAmount: string;
    totalVolumeShares: bigint;
  }[] = [];

  for (const row of instRes.rows) {
    const stockId = tickerToLocalId.get(row.ticker);
    if (stockId === undefined) {
      instSkipped++;
      continue;
    }
    instMatched++;
    instData.push({
      stockId,
      tradeDate: row.trade_date,
      foreignNetBuyShares: BigInt(row.foreign_net_buy_shares),
      foreignNetBuyAmount: row.foreign_net_buy_amount,
      investTrustNetBuyShares: BigInt(row.invest_trust_net_buy_shares),
      investTrustNetBuyAmount: row.invest_trust_net_buy_amount,
      dealerNetBuyShares: BigInt(row.dealer_net_buy_shares),
      dealerNetBuyAmount: row.dealer_net_buy_amount,
      totalVolumeShares: BigInt(row.total_volume_shares),
    });
  }
  console.log(`institutional：對應成功 ${instMatched} 筆，本機找不到對應股票跳過 ${instSkipped} 筆`);

  console.log("清空本機 tw_institutional_trading（已知是假資料）...");
  await prisma.twInstitutionalTrading.deleteMany({});

  for (let i = 0; i < instData.length; i += BATCH_SIZE) {
    const batch = instData.slice(i, i + BATCH_SIZE);
    await prisma.twInstitutionalTrading.createMany({ data: batch, skipDuplicates: true });
    console.log(`  已寫入 ${Math.min(i + BATCH_SIZE, instData.length)}/${instData.length}`);
  }

  // --- tw_monthly_revenue ---
  const revRes = await prod.query(`
    SELECT s.ticker, m.revenue_month, m.revenue, m.revenue_prior_month, m.revenue_same_month_last_year,
           m.mom_growth_pct, m.yoy_growth_pct, m.cumulative_revenue, m.cumulative_revenue_last_year,
           m.cumulative_yoy_growth_pct
    FROM tw_monthly_revenue m
    JOIN stocks s ON s.id = m.stock_id
    WHERE s.market = 'TW'
    ORDER BY m.revenue_month ASC
  `);
  console.log(`\nproduction tw_monthly_revenue：${revRes.rows.length} 筆`);

  let revMatched = 0;
  let revSkipped = 0;
  const revData: {
    stockId: number;
    revenueMonth: Date;
    revenue: bigint;
    revenuePriorMonth: bigint | null;
    revenueSameMonthLastYear: bigint | null;
    momGrowthPct: string | null;
    yoyGrowthPct: string | null;
    cumulativeRevenue: bigint | null;
    cumulativeRevenueLastYear: bigint | null;
    cumulativeYoyGrowthPct: string | null;
  }[] = [];

  for (const row of revRes.rows) {
    const stockId = tickerToLocalId.get(row.ticker);
    if (stockId === undefined) {
      revSkipped++;
      continue;
    }
    revMatched++;
    revData.push({
      stockId,
      revenueMonth: row.revenue_month,
      revenue: BigInt(row.revenue),
      revenuePriorMonth: row.revenue_prior_month !== null ? BigInt(row.revenue_prior_month) : null,
      revenueSameMonthLastYear: row.revenue_same_month_last_year !== null ? BigInt(row.revenue_same_month_last_year) : null,
      momGrowthPct: row.mom_growth_pct,
      yoyGrowthPct: row.yoy_growth_pct,
      cumulativeRevenue: row.cumulative_revenue !== null ? BigInt(row.cumulative_revenue) : null,
      cumulativeRevenueLastYear: row.cumulative_revenue_last_year !== null ? BigInt(row.cumulative_revenue_last_year) : null,
      cumulativeYoyGrowthPct: row.cumulative_yoy_growth_pct,
    });
  }
  console.log(`revenue：對應成功 ${revMatched} 筆，本機找不到對應股票跳過 ${revSkipped} 筆`);

  console.log("清空本機 tw_monthly_revenue...");
  await prisma.twMonthlyRevenue.deleteMany({});
  for (let i = 0; i < revData.length; i += BATCH_SIZE) {
    const batch = revData.slice(i, i + BATCH_SIZE);
    await prisma.twMonthlyRevenue.createMany({ data: batch, skipDuplicates: true });
  }
  console.log(`已寫入 ${revData.length} 筆 revenue`);

  await prod.end();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
