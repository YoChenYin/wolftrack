-- CreateTable
CREATE TABLE "institutional_report_articles" (
    "id" SERIAL NOT NULL,
    "source_name" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publish_date" DATE NOT NULL,
    "category" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "industry_theme" TEXT,
    "summary" TEXT,
    "signal" "FundamentalSignal",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institutional_report_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institutional_report_mentions" (
    "id" BIGSERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "stock_id" INTEGER,
    "raw_name_or_ticker" TEXT NOT NULL,
    "is_new_stock" BOOLEAN NOT NULL DEFAULT false,
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institutional_report_mentions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "institutional_report_articles_post_id_key" ON "institutional_report_articles"("post_id");

-- CreateIndex
CREATE INDEX "institutional_report_articles_publish_date_idx" ON "institutional_report_articles"("publish_date");

-- CreateIndex
CREATE INDEX "institutional_report_mentions_stock_id_idx" ON "institutional_report_mentions"("stock_id");

-- AddForeignKey
ALTER TABLE "institutional_report_mentions" ADD CONSTRAINT "institutional_report_mentions_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "institutional_report_articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institutional_report_mentions" ADD CONSTRAINT "institutional_report_mentions_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
