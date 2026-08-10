"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Market } from "@/generated/prisma/enums";

const VALID_MARKETS: Market[] = ["TW", "US"];
const VALID_SIDES = ["long", "short"] as const;
const VALID_SIGNAL_SOURCES = [
  "twTrendEntry",
  "twTrendBuyDip",
  "twTrendReversal",
  "twTrendPullback",
  "twTrendBullish",
  "decisionOsFutures",
  "decisionLabGlobal",
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

export async function createTradeEntry(formData: FormData): Promise<void> {
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

export async function closeTradeEntry(formData: FormData): Promise<void> {
  const id = BigInt(requireString(formData, "id"));
  const exitPrice = requireDecimalString(formData, "exitPrice");
  const exitDate = requireString(formData, "exitDate");
  const exitNotes = optionalString(formData, "exitNotes");

  const existing = await prisma.tradeLogEntry.findUniqueOrThrow({ where: { id } });
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
}

export async function cancelTradeEntry(formData: FormData): Promise<void> {
  const id = BigInt(requireString(formData, "id"));
  await prisma.tradeLogEntry.update({ where: { id }, data: { status: "cancelled" } });
  revalidatePath("/trade-log");
}

export async function deleteTradeEntry(formData: FormData): Promise<void> {
  const id = BigInt(requireString(formData, "id"));
  await prisma.tradeLogEntry.delete({ where: { id } });
  revalidatePath("/trade-log");
}
