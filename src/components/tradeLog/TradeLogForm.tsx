import { PlusCircle } from "lucide-react";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { createTradeEntry } from "@/lib/tradeLog/actions";
import { SIGNAL_SOURCE_LABELS } from "@/lib/tradeLog/types";

const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500";
const labelClass = "text-[11px] font-medium text-zinc-500 dark:text-zinc-400";

/** 記錄新進場——這是Trade Log的第一步，不是回測，是使用者真的下單之後手動補一筆紀錄 */
export function TradeLogForm() {
  return (
    <Card>
      <SectionHeader icon={PlusCircle} iconColor="blue" title="記錄新進場" />
      <form action={createTradeEntry} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>市場</span>
          <select name="market" defaultValue="TW" className={inputClass}>
            <option value="TW">TW</option>
            <option value="US">US</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>代號</span>
          <input name="ticker" required placeholder="2330" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>方向</span>
          <select name="side" defaultValue="long" className={inputClass}>
            <option value="long">做多</option>
            <option value="short">做空</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>訊號來源</span>
          <select name="signalSource" defaultValue="" className={inputClass}>
            <option value="">（未標記）</option>
            {Object.entries(SIGNAL_SOURCE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>進場日期</span>
          <input type="date" name="entryDate" required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>進場價</span>
          <input type="number" step="0.01" name="entryPrice" required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>數量（股／口）</span>
          <input type="number" step="0.01" name="quantity" required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>停損價（選填）</span>
          <input type="number" step="0.01" name="stopLossPrice" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>停利價（選填）</span>
          <input type="number" step="0.01" name="takeProfitPrice" className={inputClass} />
        </label>
        <label className="col-span-2 flex flex-col gap-1 sm:col-span-3">
          <span className={labelClass}>進場理由（選填）</span>
          <input name="notes" placeholder="為什麼進場" className={inputClass} />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="w-full rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            新增
          </button>
        </div>
      </form>
    </Card>
  );
}
