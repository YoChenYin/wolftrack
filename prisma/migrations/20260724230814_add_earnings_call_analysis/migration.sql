-- CreateEnum
CREATE TYPE "FundamentalSignal" AS ENUM ('positive', 'neutral', 'negative');

-- CreateTable
CREATE TABLE "earnings_call_analyses" (
    "id" SERIAL NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "conference_date" DATE NOT NULL,
    "pdf_file_name" TEXT NOT NULL,
    "profit_growth_summary" TEXT NOT NULL,
    "outlook_summary" TEXT NOT NULL,
    "risk_summary" TEXT NOT NULL,
    "signal" "FundamentalSignal" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "earnings_call_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "earnings_call_analyses_pdf_file_name_key" ON "earnings_call_analyses"("pdf_file_name");

-- CreateIndex
CREATE INDEX "earnings_call_analyses_stock_id_idx" ON "earnings_call_analyses"("stock_id");

-- AddForeignKey
ALTER TABLE "earnings_call_analyses" ADD CONSTRAINT "earnings_call_analyses_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
