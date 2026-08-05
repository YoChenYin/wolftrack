-- CreateEnum
CREATE TYPE "FinalStance" AS ENUM ('bull', 'bear', 'neutral');

-- CreateEnum
CREATE TYPE "TradeStrategy" AS ENUM ('swingLong', 'swingShort', 'rangeBound', 'flat');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('low', 'medium', 'high');

-- CreateTable
CREATE TABLE "decision_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "trade_date" DATE NOT NULL,
    "l1_global_score" DECIMAL(4,2),
    "l3_tw_market_score" DECIMAL(4,2),
    "l4_flow_score" DECIMAL(4,2),
    "l5_sentiment_score" DECIMAL(4,2),
    "l6_technical_score" DECIMAL(4,2),
    "total_score" DECIMAL(5,2) NOT NULL,
    "final_stance" "FinalStance" NOT NULL,
    "final_confidence" INTEGER NOT NULL,
    "strategy" "TradeStrategy" NOT NULL,
    "risk_level" "RiskLevel" NOT NULL,
    "suggested_size_pct" INTEGER NOT NULL,
    "entry_condition" TEXT NOT NULL,
    "stop_loss_price" DECIMAL(10,2),
    "take_profit_price" DECIMAL(10,2),
    "supporting_reasons" JSONB NOT NULL,
    "opposing_reasons" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_triggers" (
    "id" BIGSERIAL NOT NULL,
    "trade_date" DATE NOT NULL,
    "gate_number" INTEGER NOT NULL,
    "gate_name" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gate_triggers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_risk_profile" (
    "id" SERIAL NOT NULL,
    "account_equity" DECIMAL(14,0) NOT NULL,
    "risk_per_trade_pct" DECIMAL(4,2) NOT NULL DEFAULT 1.0,
    "daily_max_loss_pct" DECIMAL(4,2) NOT NULL DEFAULT 3.0,
    "monthly_max_loss_pct" DECIMAL(4,2) NOT NULL DEFAULT 10.0,
    "max_exposure_pct" DECIMAL(4,2) NOT NULL DEFAULT 50.0,
    "atr_stop_multiplier" DECIMAL(3,2) NOT NULL DEFAULT 1.5,
    "consecutive_loss_halt" INTEGER NOT NULL DEFAULT 3,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_risk_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "macro_events" (
    "id" SERIAL NOT NULL,
    "event_date" DATE NOT NULL,
    "event_type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "gate_action" TEXT NOT NULL,

    CONSTRAINT "macro_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "decision_snapshots_trade_date_key" ON "decision_snapshots"("trade_date");

-- CreateIndex
CREATE INDEX "gate_triggers_trade_date_idx" ON "gate_triggers"("trade_date");

-- CreateIndex
CREATE INDEX "macro_events_event_date_idx" ON "macro_events"("event_date");
