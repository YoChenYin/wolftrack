import Link from "next/link";
import { Star } from "lucide-react";
import { getSessionUserId } from "@/lib/auth/dal";
import { isStockInWatchlist } from "@/lib/watchlist/queryWatchlist";
import { addToWatchlist, removeFromWatchlist } from "@/lib/watchlist/actions";

/** 個股頁的加入觀察按鈕：未登入顯示登入連結，已登入依目前狀態顯示加入/移除的表單按鈕。
 * 用server action直接掛form action，不用client component處理loading state
 * （跟TradeLogForm/tradeLog/actions.ts同一套慣例，見queryTradeLog.ts旁邊的actions.ts）。 */
export async function WatchlistButton({ stockId, currentPath }: { stockId: number; currentPath: string }) {
  const userId = await getSessionUserId();

  if (!userId) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(currentPath)}`}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-zinc-500 ring-1 ring-zinc-200 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:ring-white/10 dark:hover:text-zinc-100"
      >
        <Star className="h-3.5 w-3.5" strokeWidth={2.25} />
        登入以加入觀察
      </Link>
    );
  }

  const inWatchlist = await isStockInWatchlist(userId, stockId);
  const action = inWatchlist ? removeFromWatchlist : addToWatchlist;

  return (
    <form action={action}>
      <input type="hidden" name="stockId" value={stockId} />
      <input type="hidden" name="currentPath" value={currentPath} />
      <button
        type="submit"
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${
          inWatchlist
            ? "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20 dark:hover:bg-amber-400/15"
            : "text-zinc-500 ring-zinc-200 hover:text-zinc-800 dark:text-zinc-400 dark:ring-white/10 dark:hover:text-zinc-100"
        }`}
      >
        <Star className="h-3.5 w-3.5" strokeWidth={2.25} fill={inWatchlist ? "currentColor" : "none"} />
        {inWatchlist ? "已加入觀察" : "加入觀察"}
      </button>
    </form>
  );
}
