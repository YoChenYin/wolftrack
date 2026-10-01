"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth/dal";
import type { Market } from "@/generated/prisma/enums";

const VALID_MARKETS: Market[] = ["TW", "US"];
const VALID_SIDES = ["long", "short"] as const;
const VALID_SIGNAL_SOURCES = [
  "twTrendEntry",
  "twTrendBuyDip",
  "twTrustTurnBuy",
  "twCombinedBuy",
  "twBottomPattern",
  "twTrendReversal",
  "twTrendPullback",
  "twTrendBullish",
  "decisionOsFutures",
  "decisionLabGlobal",
  "expectationGap",
  "manual",
] as const;

function requireString(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${key} 不可為空`);
  return value.trim();
}

function optionalString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function requireDecimalString(formData: FormData, key: string): string {
  const raw = requireString(formData, key);
  if (!Number.isFinite(Number(raw))) throw new Error(`${key} 必須是數字`);
  return raw;
}

async function requireUserId(): Promise<number> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error("請先登入");
  return userId;
}

export async function createTradeEntry(formData: FormData): Promise<void> {
  const userId = await requireUserId();

  const market = requireString(formData, "market");
  if (!VALID_MARKETS.includes(market as Market)) throw new Error("market 不合法");
  const side = requireString(formData, "side");
  if (!VALID_SIDES.includes(side as (typeof VALID_SIDES)[number])) throw new Error("side 不合法");
  const signalSourceRaw = optionalString(formData, "signalSource");
  if (signalSourceRaw && !VALID_SIGNAL_SOURCES.includes(signalSourceRaw as (typeof VALID_SIGNAL_SOURCES)[number])) {
    throw new Error("signalSource 不合法");
  }

  await prisma.tradeLogEntry.create({
    data: {
      userId,
      market: market as Market,
      ticker: requireString(formData, "ticker").toUpperCase(),
      side: side as (typeof VALID_SIDES)[number],
      signalSource: signalSourceRaw as (typeof VALID_SIGNAL_SOURCES)[number] | null,
      entryDate: new Date(requireString(formData, "entryDate")),
      entryPrice: requireDecimalString(formData, "entryPrice"),
      quantity: requireDecimalString(formData, "quantity"),
      stopLossPrice: optionalString(formData, "stopLossPrice") ?? undefined,
      takeProfitPrice: optionalString(formData, "takeProfitPrice") ?? undefined,
      notes: optionalString(formData, "notes"),
    },
  });

  revalidatePath("/trade-log");
}

/** 台北時間的今天（UTC+8，沒有日光節約） */
function taipeiToday(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * /tw/track-record「我今天進場」：從今日進場訊號或搜尋結果記一筆台股做多部位，進場日固定是
 * 台北時間今天，之後在同一頁用績效驗證的出場規則追蹤（見positionTracking.ts）。
 * 底部型態訊號會把型態目標價帶進停利價，讓「達目標價停利」這條規則也能套用到使用者的持倉。
 */
export async function recordTrackedEntry(formData: FormData): Promise<void> {
  const userId = await requireUserId();

  const ticker = requireString(formData, "ticker").toUpperCase();
  const stock = await prisma.stock.findUnique({ where: { market_ticker: { market: "TW", ticker } }, select: { id: true } });
  if (!stock) throw new Error(`找不到台股 ${ticker}`);

  const entryPrice = requireDecimalString(formData, "entryPrice");
  if (Number(entryPrice) <= 0) throw new Error("進場價必須大於0");
  const quantity = requireDecimalString(formData, "quantity");
  if (Number(quantity) <= 0) throw new Error("股數必須大於0");

  const signalSourceRaw = optionalString(formData, "signalSource");
  if (signalSourceRaw && !VALID_SIGNAL_SOURCES.includes(signalSourceRaw as (typeof VALID_SIGNAL_SOURCES)[number])) {
    throw new Error("signalSource 不合法");
  }
  const takeProfitPrice = optionalString(formData, "takeProfitPrice");
  if (takeProfitPrice !== null && !Number.isFinite(Number(takeProfitPrice))) throw new Error("停利價必須是數字");

  await prisma.tradeLogEntry.create({
    data: {
      userId,
      market: "TW",
      ticker,
      side: "long",
      signalSource: (signalSourceRaw ?? "manual") as (typeof VALID_SIGNAL_SOURCES)[number],
      entryDate: new Date(taipeiToday()),
      entryPrice,
      quantity,
      takeProfitPrice: takeProfitPrice ?? undefined,
      notes: "從績效驗證頁記錄進場",
    },
  });

  revalidatePath("/tw/track-record");
  revalidatePath("/trade-log");
}

export async function closeTradeEntry(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const id = BigInt(requireString(formData, "id"));
  const exitPrice = requireDecimalString(formData, "exitPrice");
  const exitDate = requireString(formData, "exitDate");
  const exitNotes = optionalString(formData, "exitNotes");

  const existing = await prisma.tradeLogEntry.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("找不到這筆交易紀錄");

  await prisma.tradeLogEntry.update({
    where: { id },
    data: {
      exitPrice,
      exitDate: new Date(exitDate),
      status: "closed",
      notes: exitNotes ? `${existing.notes ? existing.notes + "\n" : ""}[出場] ${exitNotes}` : existing.notes,
    },
  });

  revalidatePath("/trade-log");
  revalidatePath("/tw/track-record");
}

export async function cancelTradeEntry(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const id = BigInt(requireString(formData, "id"));
  const result = await prisma.tradeLogEntry.updateMany({ where: { id, userId }, data: { status: "cancelled" } });
  if (result.count === 0) throw new Error("找不到這筆交易紀錄");
  revalidatePath("/trade-log");
}

export async function deleteTradeEntry(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const id = BigInt(requireString(formData, "id"));
  const result = await prisma.tradeLogEntry.deleteMany({ where: { id, userId } });
  if (result.count === 0) throw new Error("找不到這筆交易紀錄");
  revalidatePath("/trade-log");
}
