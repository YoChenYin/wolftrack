import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readSessionFromToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

/**
 * 帳號系統的樂觀檢查（只讀cookie裡的JWT，不查資料庫）——這個Next.js版本把middleware.ts
 * 改名成proxy.ts（見node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md）。
 * 真正需要保護的資料查詢仍然要在DAL（src/lib/auth/dal.ts）裡再驗一次session，這裡只負責
 * 「沒登入就別讓他進/watchlist，導去/login」這種UX層的攔截。
 */
const PROTECTED_ROUTES = ["/watchlist"];
const AUTH_ROUTES = ["/login", "/signup"];

export default async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_ROUTES.some((route) => path.startsWith(route));
  const isAuthRoute = AUTH_ROUTES.some((route) => path.startsWith(route));

  if (!isProtected && !isAuthRoute) return NextResponse.next();

  const session = await readSessionFromToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (isProtected && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthRoute && session) {
    return NextResponse.redirect(new URL("/watchlist", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/watchlist/:path*", "/login", "/signup"],
};
