"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth/dal";

function requireStockId(formData: FormData): number {
  const stockId = Number(formData.get("stockId"));
  if (!Number.isInteger(stockId)) throw new Error("stockId 不合法");
  return stockId;
}

/** 表單自己帶目前所在頁面路徑，才知道除了/watchlist以外還要revalidate哪一頁
 * （例如個股頁上的加入觀察按鈕，加入後按鈕狀態要立刻切換） */
function optionalRedirectPath(formData: FormData): string | null {
  const value = formData.get("currentPath");
  return typeof value === "string" && value.startsWith("/") ? value : null;
}

export async function addToWatchlist(formData: FormData): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error("請先登入");
  const stockId = requireStockId(formData);

  await prisma.userWatchlistItem.upsert({
    where: { userId_stockId: { userId, stockId } },
    create: { userId, stockId },
    update: {},
  });

  revalidatePath("/watchlist");
  const currentPath = optionalRedirectPath(formData);
  if (currentPath) revalidatePath(currentPath);
}

export async function removeFromWatchlist(formData: FormData): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error("請先登入");
  const stockId = requireStockId(formData);

  await prisma.userWatchlistItem.deleteMany({ where: { userId, stockId } });

  revalidatePath("/watchlist");
  const currentPath = optionalRedirectPath(formData);
  if (currentPath) revalidatePath(currentPath);
}
