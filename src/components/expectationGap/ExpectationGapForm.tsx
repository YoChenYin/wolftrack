import { PlusCircle } from "lucide-react";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { createExpectationGapNote } from "@/lib/expectationGap/actions";
import { VARIANCE_DRIVER_LABELS } from "@/lib/expectationGap/types";

const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500";
const labelClass = "text-[11px] font-medium text-zinc-500 dark:text-zinc-400";

/** 記錄一筆預期差判斷——Variance = 自己的Proprietary Model估值 - 市場共識，不是backtest，
 * 是研究部門每天在做的「我跟市場共識哪裡不一樣」。市場共識目標價/EPS選填，因為不是每次都
 * 查得到分析師共識，沒填就只顯示自己的Target Price跟目前股價的潛在空間，不強求對照。 */
export function ExpectationGapForm() {
  return (
    <Card>
      <SectionHeader icon={PlusCircle} iconColor="blue" title="記錄新的預期差判斷" />
      <form action={createExpectationGapNote} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          <span className={labelClass}>筆記日期</span>
          <input type="date" name="noteDate" required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>目前股價</span>
          <input type="number" step="0.01" name="currentPrice" required className={inputClass} />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>市場共識 Forward EPS（選填）</span>
          <input type="number" step="0.01" name="consensusEps" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>市場共識目標價（選填）</span>
          <input type="number" step="0.01" name="consensusTargetPrice" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>自己判斷的 Forward EPS</span>
          <input type="number" step="0.01" name="ownEps" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>自己給的 Target PE</span>
          <input type="number" step="0.01" name="ownTargetPe" className={inputClass} />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>預期差切入點</span>
          <select name="varianceDriver" defaultValue="capacityYield" className={inputClass}>
            {Object.entries(VARIANCE_DRIVER_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 flex flex-col gap-1 sm:col-span-3">
          <span className={labelClass}>論述（為什麼判斷跟市場共識不一樣）</span>
          <input name="thesis" required placeholder="例如：透過供應鏈查證，新產品良率超預期..." className={inputClass} />
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
