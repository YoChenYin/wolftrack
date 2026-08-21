import Link from "next/link";
import { Star, LogOut } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/dal";
import { logout } from "@/lib/auth/actions";

/** Nav右側的登入狀態區塊，跟MarketNav分開是因為MarketNav要留給usePathname的client component用，
 * 這裡查session要用async server component。 */
export async function AuthNavSlot() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex shrink-0 items-center gap-3 text-sm font-medium">
        <Link href="/login" className="text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
          登入
        </Link>
        <Link
          href="/signup"
          className="rounded-full bg-zinc-900 px-3 py-1 text-xs text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          註冊
        </Link>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-3 text-sm font-medium">
      <Link
        href="/watchlist"
        className="flex items-center gap-1 text-zinc-500 transition-colors hover:text-amber-700 dark:text-zinc-400 dark:hover:text-amber-400"
      >
        <Star className="h-3.5 w-3.5" strokeWidth={2.25} />
        觀察清單
      </Link>
      <form action={logout}>
        <button
          type="submit"
          title={user.email}
          className="flex items-center gap-1 text-zinc-400 transition-colors hover:text-zinc-800 dark:text-zinc-500 dark:hover:text-zinc-200"
        >
          <LogOut className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      </form>
    </div>
  );
}
