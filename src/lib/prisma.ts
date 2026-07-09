import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * pg.Pool 預設沒有 statement_timeout/connectionTimeoutMillis，連線中途斷掉（例如長時間跑的
 * 回填腳本連到遠端 production DB，中途網路斷線）會讓 pending query 卡住永遠不 resolve、也不拋錯，
 * 跟這個專案先前在 fetch() 踩過的「沒設 timeout 導致卡死」是同一種問題（一次卡了超過18小時才發現）。
 */
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  statement_timeout: 30_000,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
});

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
