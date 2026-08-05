-- CreateTable
CREATE TABLE "tw_futures_daily" (
    "id" BIGSERIAL NOT NULL,
    "trade_date" DATE NOT NULL,
    "contract" TEXT NOT NULL DEFAULT 'TX',
    "contract_month" TEXT NOT NULL,
    "open" DECIMAL(10,2) NOT NULL,
    "high" DECIMAL(10,2) NOT NULL,
    "low" DECIMAL(10,2) NOT NULL,
    "close" DECIMAL(10,2) NOT NULL,
    "settlement_price" DECIMAL(10,2),
    "volume" INTEGER NOT NULL,
    "open_interest" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tw_futures_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tw_options_put_call_ratio" (
    "id" BIGSERIAL NOT NULL,
    "trade_date" DATE NOT NULL,
    "put_volume" BIGINT NOT NULL,
    "call_volume" BIGINT NOT NULL,
    "put_call_volume_ratio_pct" DECIMAL(6,2) NOT NULL,
    "put_open_interest" BIGINT NOT NULL,
    "call_open_interest" BIGINT NOT NULL,
    "put_call_oi_ratio_pct" DECIMAL(6,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tw_options_put_call_ratio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tw_futures_daily_contract_trade_date_key" ON "tw_futures_daily"("contract", "trade_date");

-- CreateIndex
CREATE UNIQUE INDEX "tw_options_put_call_ratio_trade_date_key" ON "tw_options_put_call_ratio"("trade_date");
