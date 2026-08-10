"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Market } from "@/generated/prisma/enums";

const VALID_MARKETS: Market[] = ["TW", "US"];
const VALID_DRIVERS = ["capacityYield", "productMixAsp", "inventoryCycle", "other"] as const;

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

export async function createExpectationGapNote(formData: FormData): Promise<void> {
  const market = requireString(formData, "market");
  if (!VALID_MARKETS.includes(market as Market)) throw new Error("market 不合法");
  const varianceDriver = requireString(formData, "varianceDriver");
  if (!VALID_DRIVERS.includes(varianceDriver as (typeof VALID_DRIVERS)[number])) throw new Error("varianceDriver 不合法");

  await prisma.expectationGapNote.create({
    data: {
      market: market as Market,
      ticker: requireString(formData, "ticker").toUpperCase(),
      noteDate: new Date(requireString(formData, "noteDate")),
      currentPrice: requireDecimalString(formData, "currentPrice"),
      consensusEps: optionalString(formData, "consensusEps") ?? undefined,
      consensusTargetPrice: optionalString(formData, "consensusTargetPrice") ?? undefined,
      ownEps: optionalString(formData, "ownEps") ?? undefined,
      ownTargetPe: optionalString(formData, "ownTargetPe") ?? undefined,
      varianceDriver: varianceDriver as (typeof VALID_DRIVERS)[number],
      thesis: requireString(formData, "thesis"),
    },
  });

  revalidatePath("/expectation-gap");
}

export async function resolveExpectationGapNote(formData: FormData): Promise<void> {
  const id = BigInt(requireString(formData, "id"));
  const status = requireString(formData, "status");
  if (status !== "confirmed" && status !== "invalidated") throw new Error("status 不合法");
  const outcomeNote = optionalString(formData, "outcomeNote");

  await prisma.expectationGapNote.update({
    where: { id },
    data: { status, outcomeNote },
  });

  revalidatePath("/expectation-gap");
}

export async function deleteExpectationGapNote(formData: FormData): Promise<void> {
  const id = BigInt(requireString(formData, "id"));
  await prisma.expectationGapNote.delete({ where: { id } });
  revalidatePath("/expectation-gap");
}
