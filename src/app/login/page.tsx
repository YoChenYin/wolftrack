import { LogIn } from "lucide-react";
import { AuthForm } from "@/components/auth/AuthForm";
import { login } from "@/lib/auth/actions";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";

export default function LoginPage() {
  return (
    <div
      className="relative flex flex-1 flex-col items-center overflow-hidden font-[family:var(--font-tw-sans)] dark:bg-zinc-950"
      style={{ background: "var(--tw-canvas)" }}
    >
      <main className="relative mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-10">
        <header className="tw-reveal text-center">
          <h1
            className="font-[family:var(--font-tw-display)] text-3xl font-semibold tracking-tight"
            style={{
              backgroundImage: "var(--tw-heading-gradient)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            登入
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">觀察選股、交易筆記都在這裡</p>
        </header>

        <Card className="tw-reveal">
          <SectionHeader icon={LogIn} iconColor="amber" title="會員登入" />
          <div className="mt-4">
            <AuthForm mode="login" action={login} />
          </div>
        </Card>
      </main>
    </div>
  );
}
