-- CreateEnum
CREATE TYPE "MembershipTier" AS ENUM ('free', 'pro');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "tier" "MembershipTier" NOT NULL DEFAULT 'free',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_watchlist_items" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_watchlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "user_watchlist_items_user_id_idx" ON "user_watchlist_items"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_watchlist_items_user_id_stock_id_key" ON "user_watchlist_items"("user_id", "stock_id");

-- AddForeignKey
ALTER TABLE "user_watchlist_items" ADD CONSTRAINT "user_watchlist_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_watchlist_items" ADD CONSTRAINT "user_watchlist_items_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
