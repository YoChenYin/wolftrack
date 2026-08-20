-- CreateEnum
CREATE TYPE "BacktestSignalCategory" AS ENUM ('trustTurnBuy', 'combinedBuy', 'trustTurnSell', 'combinedSell', 'headShoulders', 'nShape');

-- CreateTable
CREATE TABLE "tw_signal_backtest_events" (
    "id" BIGSERIAL NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "category" "BacktestSignalCategory" NOT NULL,
    "signal_date" DATE NOT NULL,
    "price_at_signal" DECIMAL(12,4) NOT NULL,
    "return_5d" DECIMAL(8,2),
    "return_10d" DECIMAL(8,2),
    "return_20d" DECIMAL(8,2),
    "return_40d" DECIMAL(8,2),
    "return_60d" DECIMAL(8,2),
    "taiex_return_5d" DECIMAL(8,2),
    "taiex_return_10d" DECIMAL(8,2),
    "taiex_return_20d" DECIMAL(8,2),
    "taiex_return_40d" DECIMAL(8,2),
    "taiex_return_60d" DECIMAL(8,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tw_signal_backtest_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tw_signal_backtest_events_category_idx" ON "tw_signal_backtest_events"("category");

-- CreateIndex
CREATE UNIQUE INDEX "tw_signal_backtest_events_stock_id_category_signal_date_key" ON "tw_signal_backtest_events"("stock_id", "category", "signal_date");

-- AddForeignKey
ALTER TABLE "tw_signal_backtest_events" ADD CONSTRAINT "tw_signal_backtest_events_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
