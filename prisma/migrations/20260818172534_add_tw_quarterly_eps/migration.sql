-- CreateTable
CREATE TABLE "tw_quarterly_eps" (
    "id" BIGSERIAL NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "fiscal_quarter" INTEGER NOT NULL,
    "report_date" DATE NOT NULL,
    "eps_cumulative" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tw_quarterly_eps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tw_quarterly_eps_fiscal_year_fiscal_quarter_idx" ON "tw_quarterly_eps"("fiscal_year", "fiscal_quarter");

-- CreateIndex
CREATE UNIQUE INDEX "tw_quarterly_eps_stock_id_fiscal_year_fiscal_quarter_key" ON "tw_quarterly_eps"("stock_id", "fiscal_year", "fiscal_quarter");

-- AddForeignKey
ALTER TABLE "tw_quarterly_eps" ADD CONSTRAINT "tw_quarterly_eps_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
