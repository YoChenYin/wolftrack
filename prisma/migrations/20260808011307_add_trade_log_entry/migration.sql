-- CreateEnum
CREATE TYPE "TradeSide" AS ENUM ('long', 'short');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('open', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "TradeSignalSource" AS ENUM ('twTrendEntry', 'twTrendBuyDip', 'twTrendReversal', 'twTrendPullback', 'twTrendBullish', 'decisionOsFutures', 'decisionLabGlobal', 'manual');

-- CreateTable
CREATE TABLE "trade_log_entries" (
    "id" BIGSERIAL NOT NULL,
    "market" "Market" NOT NULL,
    "ticker" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "signal_source" "TradeSignalSource",
    "entry_date" DATE NOT NULL,
    "entry_price" DECIMAL(12,2) NOT NULL,
    "quantity" DECIMAL(14,2) NOT NULL,
    "exit_date" DATE,
    "exit_price" DECIMAL(12,2),
    "stop_loss_price" DECIMAL(12,2),
    "take_profit_price" DECIMAL(12,2),
    "status" "TradeStatus" NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trade_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trade_log_entries_market_ticker_idx" ON "trade_log_entries"("market", "ticker");

-- CreateIndex
CREATE INDEX "trade_log_entries_status_idx" ON "trade_log_entries"("status");
