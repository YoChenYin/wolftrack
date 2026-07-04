import type { NextRequest } from "next/server";

/**
 * 排程觸發用的簡單密鑰驗證：帶 `Authorization: Bearer <CRON_SECRET>`。
 * 不用複雜的 auth 系統——這些 endpoint 只是把既有的批次腳本包成 HTTP 觸發器，
 * 唯一的安全需求是「不能被陌生人隨便打」，共用密鑰對這個場景已經足夠。
 */
export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // 沒設定密鑰時預設拒絕，避免忘記設定導致 endpoint 對外開放
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}
