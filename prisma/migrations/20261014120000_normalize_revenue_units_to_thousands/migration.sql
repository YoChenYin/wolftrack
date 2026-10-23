-- 2026-10-14：tw_monthly_revenue統一成「千元」。
-- 歷史回補（backfillTwHistory.ts，FinMind）原本寫入「元」，每月排程（TWSE/TPEx OpenAPI）寫入「千元」，
-- 兩種單位混在同一張表。回補程式已改成寫入千元，這裡把之前寫入的「元」資料換算回千元。
-- 分辨方式：回補不會寫cumulative_revenue（OpenAPI一定會寫），且FinMind金額都是「千元×1000」，
-- 一定是1000的倍數。月增率/年增率是比例，不受單位影響。修正前後檢查見scripts/check-revenue-units.ts。
UPDATE "tw_monthly_revenue" SET
  "revenue" = "revenue" / 1000,
  "revenue_prior_month" = CASE WHEN "revenue_prior_month" % 1000 = 0 THEN "revenue_prior_month" / 1000 ELSE "revenue_prior_month" END,
  "revenue_same_month_last_year" = CASE WHEN "revenue_same_month_last_year" % 1000 = 0 THEN "revenue_same_month_last_year" / 1000 ELSE "revenue_same_month_last_year" END
WHERE "cumulative_revenue" IS NULL AND "revenue" % 1000 = 0 AND "revenue" > 0;
