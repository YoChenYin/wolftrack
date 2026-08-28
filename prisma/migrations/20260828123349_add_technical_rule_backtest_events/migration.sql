-- CreateEnum
CREATE TYPE "TechnicalRuleType" AS ENUM ('goldenCrossMaBullish', 'deathCrossMaBearish', 'rsiOversoldCross', 'rsiOverboughtCross', 'macdBullishCross', 'macdBearishCross', 'bottomPatternConfirmed');

-- CreateTable
CREATE TABLE "tw_technical_rule_backtest_events" (
    "id" BIGSERIAL NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "rule_type" "TechnicalRuleType" NOT NULL,
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

    CONSTRAINT "tw_technical_rule_backtest_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tw_technical_rule_backtest_events_rule_type_idx" ON "tw_technical_rule_backtest_events"("rule_type");

-- CreateIndex
CREATE UNIQUE INDEX "tw_technical_rule_backtest_events_stock_id_rule_type_signal_key" ON "tw_technical_rule_backtest_events"("stock_id", "rule_type", "signal_date");

-- AddForeignKey
ALTER TABLE "tw_technical_rule_backtest_events" ADD CONSTRAINT "tw_technical_rule_backtest_events_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
