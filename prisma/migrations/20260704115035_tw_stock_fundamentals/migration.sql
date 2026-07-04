-- CreateTable
CREATE TABLE "tw_stock_fundamentals" (
    "id" BIGSERIAL NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "trade_date" DATE NOT NULL,
    "pe" DECIMAL(10,2),
    "pb" DECIMAL(10,2),
    "dividend_yield" DECIMAL(6,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tw_stock_fundamentals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tw_stock_fundamentals_stock_id_trade_date_key" ON "tw_stock_fundamentals"("stock_id", "trade_date");

-- AddForeignKey
ALTER TABLE "tw_stock_fundamentals" ADD CONSTRAINT "tw_stock_fundamentals_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

