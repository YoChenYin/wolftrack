/**
 * 2026-10-14：檢查tw_monthly_revenue的單位是否一致（唯讀，不寫入）。
 * 單位統一成千元是由migration 20261014120000_normalize_revenue_units_to_thousands處理（部署時
 * prisma migrate deploy自動執行），這支是事後確認用：
 * - 還有沒有「看起來是元」的資料（cumulative_revenue為空、金額是1000的倍數＝FinMind回補的特徵）
 * - 同一檔股票相鄰月份營收差超過100倍的異常（單位混用的典型症狀）
 *
 * 用法：npx tsx scripts/check-revenue-units.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const [suspect] = await prisma.$queryRawUnsafe<{ rows: number; stocks: number }[]>(`
    SELECT COUNT(*)::int AS rows, COUNT(DISTINCT stock_id)::int AS stocks
    FROM tw_monthly_revenue WHERE cumulative_revenue IS NULL AND revenue % 1000 = 0 AND revenue > 0`);
  console.log(`疑似「元」單位的資料：${suspect.rows} 筆、${suspect.stocks} 檔（正常應該接近0，千元剛好是1000倍數的機率約千分之一）`);

  const jumps = await prisma.$queryRawUnsafe<{ ticker: string; month: string; ratio: number }[]>(`
    SELECT ticker, month, ratio FROM (
      SELECT s.ticker, m.revenue_month::text AS month,
             m.revenue::float / NULLIF(LAG(m.revenue) OVER (PARTITION BY m.stock_id ORDER BY m.revenue_month), 0) AS ratio
      FROM tw_monthly_revenue m JOIN stocks s ON s.id = m.stock_id
    ) x WHERE ratio > 100 OR ratio < 0.01 ORDER BY ticker, month`);
  console.log(`相鄰月份營收差超過100倍：${jumps.length} 筆`);
  for (const j of jumps.slice(0, 20)) console.log(`  ${j.ticker} ${j.month} ×${j.ratio.toFixed(4)}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
