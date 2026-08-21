import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { readSession } from "./session";

/** 只做「有沒有登入」的判斷，不查資料庫——UI快速判斷用（例如nav要不要顯示登入按鈕） */
export const getSessionUserId = cache(async (): Promise<number | null> => {
  const session = await readSession();
  return session?.userId ?? null;
});

/** 查目前登入使用者的完整資料，DTO只挑需要的欄位、不含passwordHash */
export const getCurrentUser = cache(async () => {
  const userId = await getSessionUserId();
  if (!userId) return null;

  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, tier: true, createdAt: true },
  });
});
