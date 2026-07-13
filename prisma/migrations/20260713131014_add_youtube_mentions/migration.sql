-- CreateEnum
CREATE TYPE "TranscriptSource" AS ENUM ('caption', 'whisper');

-- CreateEnum
CREATE TYPE "MentionSentiment" AS ENUM ('bullish', 'bearish', 'neutral');

-- CreateEnum
CREATE TYPE "MentionAgreement" AS ENUM ('agree', 'aheadOfSystem', 'noData');

-- CreateTable
CREATE TABLE "youtube_videos" (
    "id" SERIAL NOT NULL,
    "channel_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL,
    "transcript" TEXT,
    "transcript_source" "TranscriptSource",
    "transcript_attempts" INTEGER NOT NULL DEFAULT 0,
    "transcript_failed_at" TIMESTAMP(3),
    "summary" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "youtube_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "youtube_stock_mentions" (
    "id" BIGSERIAL NOT NULL,
    "video_id" INTEGER NOT NULL,
    "stock_id" INTEGER,
    "raw_name_or_ticker" TEXT NOT NULL,
    "sentiment" "MentionSentiment" NOT NULL,
    "reasoning_excerpt" TEXT NOT NULL,
    "is_new_stock" BOOLEAN NOT NULL DEFAULT false,
    "resolution_note" TEXT,
    "system_status" "TrendStatus",
    "agreement" "MentionAgreement",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "youtube_stock_mentions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "youtube_videos_video_id_key" ON "youtube_videos"("video_id");

-- CreateIndex
CREATE INDEX "youtube_videos_channel_id_published_at_idx" ON "youtube_videos"("channel_id", "published_at");

-- CreateIndex
CREATE INDEX "youtube_videos_processed_at_idx" ON "youtube_videos"("processed_at");

-- CreateIndex
CREATE INDEX "youtube_stock_mentions_video_id_idx" ON "youtube_stock_mentions"("video_id");

-- CreateIndex
CREATE INDEX "youtube_stock_mentions_stock_id_idx" ON "youtube_stock_mentions"("stock_id");

-- AddForeignKey
ALTER TABLE "youtube_stock_mentions" ADD CONSTRAINT "youtube_stock_mentions_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "youtube_videos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "youtube_stock_mentions" ADD CONSTRAINT "youtube_stock_mentions_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
