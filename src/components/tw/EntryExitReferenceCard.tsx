import { Target } from "lucide-react";
import { InfoTooltip } from "../InfoTooltip";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";

export interface EntryExitReferenceData {
  support: number;
  resistance: number;
  priceStatus: "aboveResistance" | "belowSupport" | "withinRange";
  foreignCostBasis: number | null;
  trustCostBasis: number | null;
}

function formatPrice(value: number | null): string {
  return value === null ? "N/A" : `${value.toFixed(2)}元`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">{hint}</p>}
    </div>
  );
}

/**
 * 2026-08-19新增：個股頁「總覽」用的進出場參考——散戶最常問的「進場/出場點在哪」，用近60個
 * 交易日（不含當天）高低點當支撐/壓力，建議進場點＝支撐、建議停利點＝壓力（最基本的區間
 * 操作邏輯，不猜測突破後的目標價），加上外資/投信近60個交易日持續買超部位的加權平均成本
 * 當額外參考（法人套牢區/獲利區在哪）。
 */
export function EntryExitReferenceCard({ data }: { data: EntryExitReferenceData | null }) {
  if (!data) {
    return (
      <Card>
        <SectionHeader icon={Target} iconColor="rose" title="進出場參考" />
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">這檔股票目前沒有足夠的歷史股價資料（需要近60個交易日）。</p>
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader
        icon={Target}
        iconColor="rose"
        title="進出場參考"
        tooltip={
          <InfoTooltip>
            支撐/壓力：近60個交易日（不含當天）收盤價的最低/最高點。建議進場點＝支撐價（拉回支撐找買點）、建議停利點＝壓力價（漲到壓力附近停利）——最基本的區間操作邏輯，不是精準的價位預測，如果股價正在創新高的強勢趨勢中，壓力價可能很貼近目前股價，這時候參考意義會降低。
            <br />
            <br />
            外資/投信成本：回推近60個交易日法人持續買超部位的加權平均成本，N/A代表這個窗口內法人淨部位從未轉正。
          </InfoTooltip>
        }
      />
      {data.priceStatus !== "withinRange" && (
        <p
          className={`mt-1 text-xs font-medium ${
            data.priceStatus === "aboveResistance" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {data.priceStatus === "aboveResistance"
            ? "目前股價已站上近60日壓力，支撐/壓力參考意義降低"
            : "目前股價已跌破近60日支撐，支撐/壓力參考意義降低"}
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="建議進場點" value={formatPrice(data.support)} hint="＝支撐價" />
        <Stat label="建議停利點" value={formatPrice(data.resistance)} hint="＝壓力價" />
        <Stat label="外資成本價" value={formatPrice(data.foreignCostBasis)} />
        <Stat label="投信成本價" value={formatPrice(data.trustCostBasis)} />
      </div>
    </Card>
  );
}
