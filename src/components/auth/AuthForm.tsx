"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { AuthFormState } from "@/lib/auth/actions";

const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500";
const labelClass = "text-[11px] font-medium text-zinc-500 dark:text-zinc-400";

export function AuthForm({
  mode,
  action,
}: {
  mode: "login" | "signup";
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {mode === "signup" && (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>暱稱（選填）</span>
          <input name="name" placeholder="怎麼稱呼你" className={inputClass} />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Email</span>
        <input type="email" name="email" required placeholder="you@example.com" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>密碼</span>
        <input
          type="password"
          name="password"
          required
          minLength={mode === "signup" ? 8 : undefined}
          placeholder={mode === "signup" ? "至少8碼" : "••••••••"}
          className={inputClass}
        />
      </label>

      {state.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {pending ? "處理中…" : mode === "login" ? "登入" : "註冊"}
      </button>

      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        {mode === "login" ? (
          <>
            還沒有帳號？{" "}
            <Link href="/signup" className="font-medium text-amber-700 hover:underline dark:text-amber-400">
              註冊
            </Link>
          </>
        ) : (
          <>
            已經有帳號？{" "}
            <Link href="/login" className="font-medium text-amber-700 hover:underline dark:text-amber-400">
              登入
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
