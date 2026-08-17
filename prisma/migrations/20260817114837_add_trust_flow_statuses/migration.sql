-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TrendStatus" ADD VALUE 'trustTurnBuy';
ALTER TYPE "TrendStatus" ADD VALUE 'combinedBuy';
ALTER TYPE "TrendStatus" ADD VALUE 'trustTurnSell';
ALTER TYPE "TrendStatus" ADD VALUE 'combinedSell';
