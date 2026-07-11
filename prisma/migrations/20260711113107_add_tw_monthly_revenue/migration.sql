-- CreateTable
CREATE TABLE "tw_monthly_revenue" (
    "id" BIGSERIAL NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "revenue_month" DATE NOT NULL,
    "revenue" BIGINT NOT NULL,
    "revenue_prior_month" BIGINT,
    "revenue_same_month_last_year" BIGINT,
    "mom_growth_pct" DECIMAL(8,2),
    "yoy_growth_pct" DECIMAL(8,2),
    "cumulative_revenue" BIGINT,
    "cumulative_revenue_last_year" BIGINT,
    "cumulative_yoy_growth_pct" DECIMAL(8,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tw_monthly_revenue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tw_monthly_revenue_revenue_month_idx" ON "tw_monthly_revenue"("revenue_month");

-- CreateIndex
CREATE UNIQUE INDEX "tw_monthly_revenue_stock_id_revenue_month_key" ON "tw_monthly_revenue"("stock_id", "revenue_month");

-- AddForeignKey
ALTER TABLE "tw_monthly_revenue" ADD CONSTRAINT "tw_monthly_revenue_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
