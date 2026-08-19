-- CreateTable
CREATE TABLE "tw_daily_market_report" (
    "id" SERIAL NOT NULL,
    "report_date" DATE NOT NULL,
    "prev_trade_date" DATE NOT NULL,
    "taiex_close" DECIMAL(12,2),
    "taiex_change_pct" DECIMAL(6,2),
    "category_transitions" JSONB NOT NULL,
    "breakouts" JSONB NOT NULL,
    "cost_basis_crossovers" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tw_daily_market_report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tw_daily_market_report_report_date_key" ON "tw_daily_market_report"("report_date");
