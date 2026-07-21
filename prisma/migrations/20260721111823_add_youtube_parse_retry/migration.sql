-- AlterTable
ALTER TABLE "youtube_videos" ADD COLUMN     "parse_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "parse_failed_at" TIMESTAMP(3);
