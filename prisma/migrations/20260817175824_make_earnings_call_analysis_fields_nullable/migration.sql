-- AlterTable
ALTER TABLE "earnings_call_analyses" ALTER COLUMN "profit_growth_summary" DROP NOT NULL,
ALTER COLUMN "outlook_summary" DROP NOT NULL,
ALTER COLUMN "risk_summary" DROP NOT NULL,
ALTER COLUMN "signal" DROP NOT NULL;
