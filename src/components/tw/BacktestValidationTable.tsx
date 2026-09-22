import type { CategoryBacktestSummary } from "@/lib/trend/tw/backtestSummary";
import { MIN_SAMPLE_SIZE_FOR_UI } from "@/lib/trend/tw/backtestSummary";
import { InfoTooltip } from "../InfoTooltip";
import { SubCard } from "../ui/Card";
import { twReturnColor } from "@/lib/tw/color";

const CATEGORY_LABEL: Record<string, string> = {
  trustTurnBuy: "投信轉買",
  combinedBuy: "投信外資合買",
  trustTurnSell: "投信轉賣",
  combinedSell: "投信外資合賣",
  headShoulders: "頭肩底",
  nShape: "N字底",
};

function formatPct(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * 一個category+horizon的驗證儲存格：theme範圍的超額報酬(大字)比對全市場同類訊號基準(小字)，
 * 樣本數<MIN_SAMPLE_SIZE_FOR_UI時兩者都不顯示數字，改顯示「樣本不足」——跟backtestSummary.ts
 * 既有的badge邏輯（getBacktestBadgeStats）用同一個門檻，數字噪音太大時寧可不秀。
 */
function ValidationCell({
  theme,
  market,
}: {
  theme: { sampleSize: number; excessReturnPct: number | null; winRatePct: number | null } | undefined;
  market: { excessReturnPct: number | null } | undefined;
}) {
  if (!theme || theme.sampleSize < MIN_SAMPLE_SIZE_FOR_UI) {
    return (
      <td className="px-2 py-1.5 text-right text-[11px] text-zinc-300 dark:text-zinc-600">
        樣本不足{theme ? `（${theme.sampleSize}）` : ""}
      </td>
    );
  }
  return (
    <td className="px-2 py-1.5 text-right">
      <p className={`font-[family:var(--font-tw-mono)] text-sm font-semibold tabular-nums ${twReturnColor(theme.excessReturnPct)}`}>
        {formatPct(theme.excessReturnPct)}
      </p>
      <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
        勝率{theme.winRatePct !== null ? `${theme.winRatePct.toFixed(0)}%` : "—"}・大盤基準{formatPct(market?.excessReturnPct ?? null)}
      </p>
    </td>
  );
}

/**
 * 研究簡報的「歷史驗證」區塊：theme範圍 vs 全市場基準的超額報酬並排比較，判斷這個theme的
 * 戰術訊號歷史上是不是真的比全市場同類訊號更有效，不只是「訊號本身有沒有效」。
 */
export function BacktestValidationTable({
  themeBacktest,
  marketBaseline,
}: {
  themeBacktest: CategoryBacktestSummary[];
  marketBaseline: CategoryBacktestSummary[];
}) {
  const marketByCategory = new Map(marketBaseline.map((c) => [c.category, c]));
  const categories = [...themeBacktest].sort(
    (a, b) => (CATEGORY_LABEL[a.category] ?? a.category).localeCompare(CATEGORY_LABEL[b.category] ?? b.category, "zh-Hant")
  );

  if (categories.length === 0) {
    return <p className="text-xs text-zinc-400 dark:text-zinc-500">這個theme的成分股目前沒有任何戰術訊號回測事件。</p>;
  }

  return (
    <SubCard>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead>
            <tr className="text-left text-zinc-400 dark:text-zinc-500">
              <th className="pr-2 font-normal">
                分類
                <InfoTooltip>
                  超額報酬 = theme成分股訊號觸發後的平均報酬 − 同期加權指數平均報酬。大盤基準是全市場（排除ETF）同一分類的超額報酬，兩者並排才看得出這個theme是不是真的比全市場同類訊號更有效。
                </InfoTooltip>
              </th>
              {[5, 10, 20, 40, 60].map((h) => (
                <th key={h} className="px-2 text-right font-normal">
                  {h}日
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.category} className="border-t border-zinc-50 dark:border-white/5">
                <td className="py-1.5 pr-2 font-medium text-zinc-700 dark:text-zinc-300">{CATEGORY_LABEL[c.category] ?? c.category}</td>
                {[5, 10, 20, 40, 60].map((h) => (
                  <ValidationCell
                    key={h}
                    theme={c.horizons.find((x) => x.horizon === h)}
                    market={marketByCategory.get(c.category)?.horizons.find((x) => x.horizon === h)}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SubCard>
  );
}
