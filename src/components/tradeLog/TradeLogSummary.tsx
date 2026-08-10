import { BarChart3 } from "lucide-react";
import { Card, SubCard } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { InfoTooltip } from "../InfoTooltip";
import type { AttributionRow } from "@/lib/tradeLog/queryTradeLog";
import { SIGNAL_SOURCE_LABELS } from "@/lib/tradeLog/types";

function pctColor(value: number): string {
  if (value > 0) return "text-red-600 dark:text-red-400";
  if (value < 0) return "text-emerald-600 dark:text-emerald-400";
  return "text-zinc-500 dark:text-zinc-400";
}

/** 按訊號來源分組的真實績效——這是「這個訊號真的有幫使用者賺錢嗎」的最終答案，
 * 跟scripts/backtest-*.ts的差異是這裡100%是使用者實際下單的紀錄，不是歷史模擬。
 * 樣本數通常很小（剛起步),用avgPnlPct/勝率而不是加總金額比較，避免被單筆大部位或
 * 不同市場的金額單位混在一起誤導。 */
export function TradeLogSummary({ attribution }: { attribution: AttributionRow[] }) {
  const totalClosed = attribution.reduce((a, r) => a + r.count, 0);

  return (
    <Card>
      <SectionHeader
        icon={BarChart3}
        iconColor="amber"
        title="訊號績效歸因"
        tooltip={
          <InfoTooltip>
            按「進場時標記的訊號來源」分組，只算已平倉的交易。樣本數少的時候數字不穩定，
            這是用來long-term追蹤「哪個訊號實際上真的有幫你賺錢」的地方，不是backtest。
          </InfoTooltip>
        }
      />
      {totalClosed === 0 ? (
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">還沒有已平倉的交易，累積幾筆之後這裡會出現按訊號來源分組的勝率／報酬統計。</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {attribution.map((row) => (
            <SubCard key={row.signalSource} className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                  {SIGNAL_SOURCE_LABELS[row.signalSource] ?? row.signalSource}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                  {row.count}筆 · 勝率{row.winRate.toFixed(0)}%
                </p>
              </div>
              <span className={`text-sm font-semibold ${pctColor(row.avgPnlPct)}`}>
                {row.avgPnlPct >= 0 ? "+" : ""}
                {row.avgPnlPct.toFixed(1)}%
              </span>
            </SubCard>
          ))}
        </div>
      )}
    </Card>
  );
}
