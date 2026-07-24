-- CreateTable
CREATE TABLE "tw_history_backfill_status" (
    "id" SERIAL NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "dataset" TEXT NOT NULL,
    "earliest_date_fetched" DATE,
    "is_fully_backfilled" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tw_history_backfill_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tw_history_backfill_status_stock_id_dataset_key" ON "tw_history_backfill_status"("stock_id", "dataset");

-- AddForeignKey
ALTER TABLE "tw_history_backfill_status" ADD CONSTRAINT "tw_history_backfill_status_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
