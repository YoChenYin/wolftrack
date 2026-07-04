-- CreateEnum
CREATE TYPE "TrendStatus" AS ENUM ('reversal', 'pullback', 'bullish');

-- CreateTable
CREATE TABLE "sector_mapping" (
    "id" SERIAL NOT NULL,
    "sector_code" TEXT NOT NULL,
    "sector_name" TEXT NOT NULL,
    "sector_name_zh" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sector_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocks" (
    "id" SERIAL NOT NULL,
    "ticker" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "sector_id" INTEGER NOT NULL,
    "industry" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_trend_signals" (
    "id" BIGSERIAL NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "trade_date" DATE NOT NULL,
    "close_price" DECIMAL(12,4) NOT NULL,
    "volume" BIGINT,
    "ma20" DECIMAL(12,4),
    "ma50" DECIMAL(12,4),
    "ma200" DECIMAL(12,4),
    "rsi14" DECIMAL(6,2),
    "adx14" DECIMAL(6,2),
    "macd_hist" DECIMAL(12,6),
    "avg_volume_20d" DECIMAL(16,2),
    "core_score" DECIMAL(5,2) NOT NULL,
    "ma_score" DECIMAL(5,2),
    "momentum_score" DECIMAL(5,2),
    "adx_score" DECIMAL(5,2),
    "rel_strength_score" DECIMAL(5,2),
    "volume_score" DECIMAL(5,2),
    "status" "TrendStatus" NOT NULL,
    "reversal_point_date" DATE,
    "price_at_signal" DECIMAL(12,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_trend_signals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sector_mapping_sector_code_key" ON "sector_mapping"("sector_code");

-- CreateIndex
CREATE UNIQUE INDEX "stocks_ticker_key" ON "stocks"("ticker");

-- CreateIndex
CREATE INDEX "stocks_sector_id_idx" ON "stocks"("sector_id");

-- CreateIndex
CREATE INDEX "daily_trend_signals_trade_date_status_idx" ON "daily_trend_signals"("trade_date", "status");

-- CreateIndex
CREATE INDEX "daily_trend_signals_stock_id_trade_date_idx" ON "daily_trend_signals"("stock_id", "trade_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_trend_signals_stock_id_trade_date_key" ON "daily_trend_signals"("stock_id", "trade_date");

-- AddForeignKey
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "sector_mapping"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_trend_signals" ADD CONSTRAINT "daily_trend_signals_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
