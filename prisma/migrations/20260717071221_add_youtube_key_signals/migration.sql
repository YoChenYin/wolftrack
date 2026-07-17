-- AlterTable
ALTER TABLE "youtube_videos" ADD COLUMN     "key_signals" TEXT[] DEFAULT ARRAY[]::TEXT[];
