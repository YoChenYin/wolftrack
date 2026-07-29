import { RotateCw } from "lucide-react";

/** fetch失敗時的統一UI，取代原本卡死在「載入中」不動的狀態 */
export function FetchError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
      <span>載入失敗（{message}）</span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-600 transition-colors hover:bg-zinc-200"
      >
        <RotateCw className="h-3 w-3" strokeWidth={2.25} />
        重試
      </button>
    </div>
  );
}
