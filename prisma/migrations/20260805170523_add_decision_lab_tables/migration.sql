-- CreateEnum
CREATE TYPE "MarketRegime" AS ENUM ('strongBull', 'weakBull', 'range', 'weakBear', 'strongBear', 'volatile', 'distribution', 'accumulation', 'capitulation');

-- CreateEnum
CREATE TYPE "ScenarioOutcome" AS ENUM ('correct', 'incorrect', 'notTriggered');

-- CreateTable
CREATE TABLE "macro_daily_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "global_market_data" JSONB NOT NULL,
    "macro_events_snapshot" JSONB,
    "volatility_data" JSONB,
    "liquidity_data" JSONB,
    "breadth_data" JSONB,
    "sentiment_data" JSONB,
    "regime" "MarketRegime" NOT NULL,
    "trading_score" INTEGER NOT NULL,
    "max_possible_score" INTEGER NOT NULL,
    "score_breakdown" JSONB NOT NULL,
    "trading_plan_strategy" TEXT NOT NULL,
    "trading_plan_reason" TEXT NOT NULL,
    "suggested_size_pct" INTEGER NOT NULL,
    "fund_manager_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "macro_daily_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario_forecasts" (
    "id" BIGSERIAL NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "probability" INTEGER NOT NULL,
    "condition" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "actual_outcome" "ScenarioOutcome",

    CONSTRAINT "scenario_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "macro_daily_snapshots_snapshot_date_key" ON "macro_daily_snapshots"("snapshot_date");

-- CreateIndex
CREATE UNIQUE INDEX "scenario_forecasts_snapshot_date_label_key" ON "scenario_forecasts"("snapshot_date", "label");
