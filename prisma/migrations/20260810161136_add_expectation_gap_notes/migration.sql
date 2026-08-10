-- CreateEnum
CREATE TYPE "VarianceDriver" AS ENUM ('capacityYield', 'productMixAsp', 'inventoryCycle', 'other');

-- CreateEnum
CREATE TYPE "ExpectationGapStatus" AS ENUM ('active', 'confirmed', 'invalidated');

-- AlterEnum
ALTER TYPE "TradeSignalSource" ADD VALUE 'expectationGap';

-- CreateTable
CREATE TABLE "expectation_gap_notes" (
    "id" BIGSERIAL NOT NULL,
    "market" "Market" NOT NULL,
    "ticker" TEXT NOT NULL,
    "note_date" DATE NOT NULL,
    "current_price" DECIMAL(12,2) NOT NULL,
    "consensus_eps" DECIMAL(10,2),
    "consensus_target_price" DECIMAL(12,2),
    "own_eps" DECIMAL(10,2),
    "own_target_pe" DECIMAL(6,2),
    "variance_driver" "VarianceDriver" NOT NULL,
    "thesis" TEXT NOT NULL,
    "status" "ExpectationGapStatus" NOT NULL DEFAULT 'active',
    "outcome_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expectation_gap_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expectation_gap_notes_market_ticker_idx" ON "expectation_gap_notes"("market", "ticker");

-- CreateIndex
CREATE INDEX "expectation_gap_notes_status_idx" ON "expectation_gap_notes"("status");
