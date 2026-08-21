import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = "wolftrack_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30天，跟一般消費性網站的「記住我」時長一致

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: number;
  [key: string]: unknown;
}

async function encrypt(payload: SessionPayload, expiresAt: Date): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getSecretKey());
}

async function decrypt(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSession(userId: number): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const token = await encrypt({ userId }, expiresAt);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/** 從cookie讀取並解密目前的session payload，沒有登入或token無效都回傳null */
export async function readSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  return decrypt(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

/** Proxy裡用的樂觀檢查版本：直接從NextRequest的cookie讀，不經過`cookies()`（Proxy runtime限制） */
export async function readSessionFromToken(token: string | undefined): Promise<SessionPayload | null> {
  return decrypt(token);
}

export { SESSION_COOKIE_NAME };
