import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * pg.Pool 預設沒有 statement_timeout/connectionTimeoutMillis，連線中途斷掉（例如長時間跑的
 * 回填腳本連到遠端 production DB，中途網路斷線）會讓 pending query 卡住永遠不 resolve、也不拋錯，
 * 跟這個專案先前在 fetch() 踩過的「沒設 timeout 導致卡死」是同一種問題（一次卡了超過18小時才發現）。
 *
 * 2026-08-24再踩一次同類問題：跑歷史相似情境回測（scripts/tw-run-scenario-backtest.ts）連到
 * 遠端prod DB，中途機器進入系統睡眠，process被凍結，醒來後連線早已在網路層silently斷掉，
 * 但process恢復執行時該筆pending query完全沒有拋錯也沒有resolve——statement_timeout是
 * postgres伺服器端才會生效的設定，如果連線本身在TCP層已經死掉（伺服器根本沒收到query），
 * 伺服器端的timeout機制不會被觸發。加`query_timeout`是pg driver本身的client端計時器，
 * 從送出query開始計時，時間到了不管伺服器有沒有回應都會主動判定逾時、拋錯，這才真正堵住
 * 這種「連線已死但沒有任何一方主動偵測到」的情境。
 */
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  statement_timeout: 30_000,
  query_timeout: 30_000,
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
