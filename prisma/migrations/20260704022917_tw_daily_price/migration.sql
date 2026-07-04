-- CreateTable
CREATE TABLE "tw_daily_price" (
    "id" BIGSERIAL NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "trade_date" DATE NOT NULL,
    "open" DECIMAL(12,4) NOT NULL,
    "high" DECIMAL(12,4) NOT NULL,
    "low" DECIMAL(12,4) NOT NULL,
    "close" DECIMAL(12,4) NOT NULL,
    "volume" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tw_daily_price_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tw_daily_price_stock_id_trade_date_idx" ON "tw_daily_price"("stock_id", "trade_date");

-- CreateIndex
CREATE UNIQUE INDEX "tw_daily_price_stock_id_trade_date_key" ON "tw_daily_price"("stock_id", "trade_date");

-- AddForeignKey
ALTER TABLE "tw_daily_price" ADD CONSTRAINT "tw_daily_price_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

