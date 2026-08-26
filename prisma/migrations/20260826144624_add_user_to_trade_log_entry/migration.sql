/*
  Warnings:

  - Added the required column `user_id` to the `trade_log_entries` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "trade_log_entries_market_ticker_idx";

-- DropIndex
DROP INDEX "trade_log_entries_status_idx";

-- AlterTable
ALTER TABLE "trade_log_entries" ADD COLUMN     "user_id" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "trade_log_entries_user_id_market_ticker_idx" ON "trade_log_entries"("user_id", "market", "ticker");

-- CreateIndex
CREATE INDEX "trade_log_entries_user_id_status_idx" ON "trade_log_entries"("user_id", "status");

-- AddForeignKey
ALTER TABLE "trade_log_entries" ADD CONSTRAINT "trade_log_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
