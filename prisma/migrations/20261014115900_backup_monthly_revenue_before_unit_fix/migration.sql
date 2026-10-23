-- 2026-10-23：下一個migration（20261014120000_normalize_revenue_units_to_thousands）會改寫既有營收金額，
-- 改寫後無法再分辨哪些列被換算過。先在同一個資料庫留一份原始資料，出問題時可以從這張表還原：
--   UPDATE tw_monthly_revenue m SET revenue = b.revenue, revenue_prior_month = b.revenue_prior_month,
--     revenue_same_month_last_year = b.revenue_same_month_last_year
--   FROM tw_monthly_revenue_backup_20261014 b WHERE b.id = m.id;
-- 確認production資料正常後（scripts/check-revenue-units.ts）就可以DROP這張表。
CREATE TABLE IF NOT EXISTS "tw_monthly_revenue_backup_20261014" AS SELECT * FROM "tw_monthly_revenue";
