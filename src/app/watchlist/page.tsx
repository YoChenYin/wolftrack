import Link from "next/link";
import { Star, LogOut } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/dal";
import { queryWatchlistForUser } from "@/lib/watchlist/queryWatchlist";
import { removeFromWatchlist } from "@/lib/watchlist/actions";
import { logout } from "@/lib/auth/actions";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";

// 個人化清單，不能被凍結成靜態快照
export const dynamic = "force-dynamic";

const MARKET_LABEL: Record<string, string> = { TW: "台股", US: "美股" };

export default async function WatchlistPage() {
  const user = await getCurrentUser();
  if (!user) return null; // proxy.ts已經攔截未登入導去/login，這裡是防禦性寫法

  const items = await queryWatchlistForUser(user.id);

  return (
    <div
      className="relative flex flex-1 flex-col overflow-hidden font-[family:var(--font-tw-sans)] dark:bg-zinc-950"
      style={{ background: "var(--tw-canvas)" }}
    >
      <main className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
        <header className="tw-reveal flex items-start justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-3">
              <h1
                className="font-[family:var(--font-tw-display)] text-3xl font-semibold tracking-tight"
                style={{
                  backgroundImage: "var(--tw-heading-gradient)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                我的觀察清單
              </h1>
              <span className="font-[family:var(--font-tw-mono)] text-xs font-medium tracking-wide text-amber-800/60 dark:text-amber-400/70">
                WOLFTRACK · WATCHLIST
              </span>
            </div>
            <div className="mt-2 h-px w-24 bg-gradient-to-r from-amber-700/50 to-transparent dark:from-amber-400/40" />
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              {user.name ? `${user.name}（${user.email}）` : user.email}
            </p>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-zinc-500 ring-1 ring-zinc-200 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:ring-white/10 dark:hover:text-zinc-100"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={2.25} />
              登出
            </button>
          </form>
        </header>

        <div className="tw-reveal" style={{ animationDelay: "60ms" }}>
          <Card>
            <SectionHeader icon={Star} iconColor="amber" title={`觀察中（${items.length}）`} />

            {items.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                還沒有加入任何股票——到台股個股頁按「加入觀察」就會出現在這裡。
              </p>
            ) : (
              <div className="mt-4 flex flex-col divide-y divide-zinc-100 dark:divide-white/5">
                {items.map((item) => (
                  <div key={item.stockId} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link
                        href={`/tw/stock/${item.ticker}`}
                        className="font-[family:var(--font-tw-mono)] text-sm font-semibold text-zinc-900 hover:underline dark:text-zinc-100"
                      >
                        {item.ticker}
                      </Link>{" "}
                      <span className="text-sm text-zinc-600 dark:text-zinc-300">{item.companyName}</span>
                      <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-white/5 dark:text-zinc-400">
                        {MARKET_LABEL[item.market] ?? item.market}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      {item.latestClose !== null && (
                        <div className="text-right">
                          <div className="font-[family:var(--font-tw-mono)] text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                            {item.latestClose.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-zinc-400 dark:text-zinc-500">
                            {item.latestTradeDate?.toISOString().slice(0, 10)}
                          </div>
                        </div>
                      )}
                      <form action={removeFromWatchlist}>
                        <input type="hidden" name="stockId" value={item.stockId} />
                        <input type="hidden" name="currentPath" value="/watchlist" />
                        <button
                          type="submit"
                          className="text-xs font-medium text-zinc-400 transition-colors hover:text-rose-600 dark:text-zinc-500 dark:hover:text-rose-400"
                        >
                          移除
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
