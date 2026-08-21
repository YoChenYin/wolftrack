-- CreateEnum
CREATE TYPE "SupplyChainLayer" AS ENUM ('upstream', 'midstream', 'downstream', 'support');

-- AlterTable
ALTER TABLE "institutional_report_articles" ADD COLUMN     "bear_bottleneck" TEXT,
ADD COLUMN     "bear_core_logic" TEXT,
ADD COLUMN     "bull_core_logic" TEXT,
ADD COLUMN     "bull_trigger" TEXT,
ADD COLUMN     "key_metrics" JSONB,
ADD COLUMN     "tags" JSONB;

-- AlterTable
ALTER TABLE "institutional_report_mentions" ADD COLUMN     "chain_layer" "SupplyChainLayer",
ADD COLUMN     "role" TEXT,
ADD COLUMN     "sentiment" "MentionSentiment";
