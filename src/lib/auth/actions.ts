"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "./password";
import { createSession, deleteSession } from "./session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export interface AuthFormState {
  error?: string;
}

export async function signup(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!EMAIL_RE.test(email)) return { error: "email格式不正確" };
  if (password.length < MIN_PASSWORD_LENGTH) return { error: `密碼至少需要${MIN_PASSWORD_LENGTH}碼` };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "這個email已經註冊過了" };

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, name: name || null },
    select: { id: true },
  });

  await createSession(user.id);
  redirect("/watchlist");
}

export async function login(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "email或密碼錯誤" };
  }

  await createSession(user.id);
  redirect("/watchlist");
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
