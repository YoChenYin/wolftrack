import { Landmark, TrendingUp, TrendingDown } from "lucide-react";
import { InfoTooltip } from "../InfoTooltip";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { twReturnColor } from "@/lib/tw/color";

export interface InstitutionalAttentionData {
  /** 近20個交易日外資+投信合計淨買賣超（張） */
  netBuyLots20d: number;
  /** 連續同方向（買或賣）的交易日數，0=最新一天沒有淨買賣超或資料不足 */
  streakDays: number;
  streakDirection: "buy" | "sell" | null;
  latestDate: string;
}

function formatLots(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString()}張`;
}

/**
 * 2026-08-19新增：個股頁「總覽」用的法人動向摘要——把「三大法人」分頁裡完整的歷史圖表
 * 濃縮成一眼看懂的摘要（近20日合計買賣超+連續買賣超天數），完整細節還是要去那個分頁看。
 */
export function InstitutionalAttentionCard({ data }: { data: InstitutionalAttentionData | null }) {
  if (!data) {
    return (
      <Card>
        <SectionHeader icon={Landmark} iconColor="blue" title="法人動向" />
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">這檔股票目前沒有三大法人買賣超資料。</p>
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader
        icon={Landmark}
        iconColor="blue"
        title="法人動向"
        tooltip={<InfoTooltip>外資+投信合計淨買賣超（張），完整每日歷史與自營商拆分見「三大法人」分頁。</InfoTooltip>}
      />
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <div>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">近20個交易日外資+投信合計</p>
          <p className={`mt-0.5 text-lg font-semibold ${twReturnColor(data.netBuyLots20d)}`}>{formatLots(data.netBuyLots20d)}</p>
        </div>
        {data.streakDirection && data.streakDays > 0 && (
          <div
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              data.streakDirection === "buy"
                ? "bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-400"
                : "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400"
            }`}
          >
            {data.streakDirection === "buy" ? (
              <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.25} />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" strokeWidth={2.25} />
            )}
            連續{data.streakDays}天{data.streakDirection === "buy" ? "合計買超" : "合計賣超"}
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">資料日期：{data.latestDate}</p>
    </Card>
  );
}
