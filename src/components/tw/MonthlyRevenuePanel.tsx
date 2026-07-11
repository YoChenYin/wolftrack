import { InfoTooltip } from "../InfoTooltip";

export interface MonthlyRevenueRow {
  revenueMonth: string; // YYYY-MM
  revenue: string; // BigInt 轉字串（千元）
  yoyGrowthPct: number | null;
  momGrowthPct: number | null;
  cumulativeYoyGrowthPct: number | null;
}

function formatRevenue(thousands: string): string {
  const n = Number(thousands);
  if (!Number.isFinite(n)) return "N/A";
  return `${(n / 100_000).toFixed(1)} 億`; // 千元 -> 億元
}

function formatPct(value: number | null): string {
  if (value === null) return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function pctColor(value: number | null): string {
  if (value === null) return "text-zinc-400";
  return value >= 0 ? "text-emerald-600" : "text-red-600";
}

/**
 * 月營收面板（2026-07-11 新增）：TWSE/TPEx 官方月營收彙總表只回傳「最新一期」，沒辦法一次回填
 * 歷史，這裡顯示的多月資料是每次排程執行自然累積出來的（見 fetchTwMonthlyRevenue.ts 說明），
 * 剛上線時大部分股票可能只有 1 筆。
 */
export function MonthlyRevenuePanel({ rows }: { rows: MonthlyRevenueRow[] }) {
  if (rows.length === 0) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">月營收</h2>
        <p className="mt-2 text-xs text-zinc-400">這檔股票目前沒有月營收資料。</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-zinc-900">
        月營收
        <InfoTooltip>
          資料來源：TWSE/TPEx 官方每月營收彙總表。年增率(YoY)是台股最常用的成長性指標；累計營收年增率把今年以來所有月份加總跟去年同期比，比單月數字更不容易被單月異常值誤導。這兩個端點只回傳最新一期，多月資料是排程累積出來的，剛上線時可能只有1筆。
        </InfoTooltip>
      </h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-zinc-400">
              <th className="pr-2 font-normal">月份</th>
              <th className="pr-2 text-right font-normal">營收</th>
              <th className="pr-2 text-right font-normal">月增率</th>
              <th className="pr-2 text-right font-normal">年增率</th>
              <th className="text-right font-normal">累計年增率</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.revenueMonth} className="border-t border-zinc-50">
                <td className="py-1 pr-2 font-medium text-zinc-800">{r.revenueMonth}</td>
                <td className="pr-2 text-right text-zinc-600">{formatRevenue(r.revenue)}</td>
                <td className={`pr-2 text-right font-medium ${pctColor(r.momGrowthPct)}`}>{formatPct(r.momGrowthPct)}</td>
                <td className={`pr-2 text-right font-medium ${pctColor(r.yoyGrowthPct)}`}>{formatPct(r.yoyGrowthPct)}</td>
                <td className={`text-right font-medium ${pctColor(r.cumulativeYoyGrowthPct)}`}>
                  {formatPct(r.cumulativeYoyGrowthPct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
