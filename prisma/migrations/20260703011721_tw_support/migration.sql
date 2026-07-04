-- CreateEnum
CREATE TYPE "Market" AS ENUM ('US', 'TW');

-- CreateEnum
CREATE TYPE "ChipMomentum" AS ENUM ('strengthening', 'neutral', 'weakening');

-- CreateEnum
CREATE TYPE "ChipBadge" AS ENUM ('confirmed', 'divergence');

-- AlterEnum
ALTER TYPE "TrendStatus" ADD VALUE 'limitMove';

-- DropIndex
DROP INDEX "sector_mapping_sector_code_key";

-- DropIndex
DROP INDEX "stocks_ticker_key";

-- AlterTable
ALTER TABLE "daily_trend_signals" ADD COLUMN     "chip_badge" "ChipBadge",
ADD COLUMN     "chip_concentration_10" DECIMAL(6,2),
ADD COLUMN     "chip_concentration_20" DECIMAL(6,2),
ADD COLUMN     "chip_concentration_5" DECIMAL(6,2),
ADD COLUMN     "chip_momentum" "ChipMomentum",
ADD COLUMN     "chip_score" DECIMAL(5,2),
ADD COLUMN     "technical_score" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "sector_mapping" ADD COLUMN     "market" "Market" NOT NULL DEFAULT 'US';

-- AlterTable
ALTER TABLE "stocks" ADD COLUMN     "market" "Market" NOT NULL DEFAULT 'US';

-- CreateTable
CREATE TABLE "tw_institutional_trading" (
    "id" BIGSERIAL NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "trade_date" DATE NOT NULL,
    "foreign_net_buy_shares" BIGINT NOT NULL DEFAULT 0,
    "foreign_net_buy_amount" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "invest_trust_net_buy_shares" BIGINT NOT NULL DEFAULT 0,
    "invest_trust_net_buy_amount" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "dealer_net_buy_shares" BIGINT NOT NULL DEFAULT 0,
    "dealer_net_buy_amount" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "total_volume_shares" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tw_institutional_trading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tw_broker_branch_flow" (
    "id" BIGSERIAL NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "trade_date" DATE NOT NULL,
    "broker_name" TEXT NOT NULL,
    "buy_shares" BIGINT NOT NULL DEFAULT 0,
    "sell_shares" BIGINT NOT NULL DEFAULT 0,
    "net_shares" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tw_broker_branch_flow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tw_institutional_trading_trade_date_idx" ON "tw_institutional_trading"("trade_date");

-- CreateIndex
CREATE UNIQUE INDEX "tw_institutional_trading_stock_id_trade_date_key" ON "tw_institutional_trading"("stock_id", "trade_date");

-- CreateIndex
CREATE INDEX "tw_broker_branch_flow_trade_date_idx" ON "tw_broker_branch_flow"("trade_date");

-- CreateIndex
CREATE UNIQUE INDEX "tw_broker_branch_flow_stock_id_trade_date_broker_name_key" ON "tw_broker_branch_flow"("stock_id", "trade_date", "broker_name");

-- CreateIndex
CREATE UNIQUE INDEX "sector_mapping_market_sector_code_key" ON "sector_mapping"("market", "sector_code");

-- CreateIndex
CREATE UNIQUE INDEX "stocks_market_ticker_key" ON "stocks"("market", "ticker");

-- AddForeignKey
ALTER TABLE "tw_institutional_trading" ADD CONSTRAINT "tw_institutional_trading_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tw_broker_branch_flow" ADD CONSTRAINT "tw_broker_branch_flow_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

