-- CreateEnum
CREATE TYPE "BottomPatternType" AS ENUM ('headShoulders', 'nShape');

-- CreateEnum
CREATE TYPE "BottomPatternStage" AS ENUM ('nearBreakout', 'confirmed');

-- AlterEnum
ALTER TYPE "TrendStatus" ADD VALUE 'none';

-- AlterTable
ALTER TABLE "daily_trend_signals" ADD COLUMN     "bottom_pattern_description" TEXT,
ADD COLUMN     "bottom_pattern_stage" "BottomPatternStage",
ADD COLUMN     "bottom_pattern_target_price" DECIMAL(12,4),
ADD COLUMN     "bottom_pattern_type" "BottomPatternType";
