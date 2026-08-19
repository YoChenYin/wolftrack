-- AlterTable
ALTER TABLE "earnings_call_analyses" ADD COLUMN     "catalyst_summary" TEXT,
ADD COLUMN     "customer_summary" TEXT,
ADD COLUMN     "market_share_summary" TEXT,
ADD COLUMN     "moat_summary" TEXT;

-- AlterTable
ALTER TABLE "tw_quarterly_eps" ADD COLUMN     "gross_margin_pct" DECIMAL(6,2),
ADD COLUMN     "net_margin_pct" DECIMAL(6,2),
ADD COLUMN     "operating_margin_pct" DECIMAL(6,2),
ADD COLUMN     "pretax_margin_pct" DECIMAL(6,2);
