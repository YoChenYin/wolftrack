import { Percent } from "lucide-react";
import { InfoTooltip } from "../InfoTooltip";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";

export interface FundamentalsSnapshotData {
  fiscalYear: number;
  fiscalQuarter: number;
  epsCumulative: number;
  grossMarginPct: number | null;
  operatingMarginPct: number | null;
  netMarginPct: number | null;
}

function formatPct(value: number | null): string {
  return value === null ? "N/A" : `${value.toFixed(1)}%`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}

/**
 * 2026-08-19新增：個股頁「總覽」用的基本面快照——散戶看到選股訊號但不敢買時最先想知道的
 * 「這公司賺不賺錢、賺多少」，來源TWSE/TPEx官方季報彙總表（見quarterlyEpsClient.ts），
 * 數字是自年初累計至最新一期季底，不是單季。
 */
export function FundamentalsSnapshotCard({ data }: { data: FundamentalsSnapshotData | null }) {
  if (!data) {
    return (
      <Card>
        <SectionHeader icon={Percent} iconColor="emerald" title="基本面快照" />
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">這檔股票目前沒有季報獲利能力資料。</p>
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader
        icon={Percent}
        iconColor="emerald"
        title="基本面快照"
        tooltip={
          <InfoTooltip>
            資料來源：TWSE/TPEx官方季報彙總表，數字是自年初累計至{data.fiscalYear}年第{data.fiscalQuarter}季底（不是單季）。毛利率等比率端點涵蓋率不如EPS端點，部分公司/期別可能顯示N/A。
          </InfoTooltip>
        }
      />
      <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
        {data.fiscalYear}年Q{data.fiscalQuarter}累計
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="年度累積EPS" value={`${data.epsCumulative.toFixed(2)}元`} />
        <Stat label="毛利率" value={formatPct(data.grossMarginPct)} />
        <Stat label="營業利益率" value={formatPct(data.operatingMarginPct)} />
        <Stat label="稅後淨利率" value={formatPct(data.netMarginPct)} />
      </div>
    </Card>
  );
}
