-- CreateTable
CREATE TABLE "themes" (
    "id" SERIAL NOT NULL,
    "theme_code" TEXT NOT NULL,
    "theme_name" TEXT NOT NULL,
    "theme_name_zh" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_themes" (
    "stock_id" INTEGER NOT NULL,
    "theme_id" INTEGER NOT NULL,

    CONSTRAINT "stock_themes_pkey" PRIMARY KEY ("stock_id","theme_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "themes_theme_code_key" ON "themes"("theme_code");

-- AddForeignKey
ALTER TABLE "stock_themes" ADD CONSTRAINT "stock_themes_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_themes" ADD CONSTRAINT "stock_themes_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "themes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
