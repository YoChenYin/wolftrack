import { Lightbulb } from "lucide-react";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";

export interface InvestmentThesisData {
  conferenceDate: string;
  moatSummary: string | null;
  marketShareSummary: string | null;
  customerSummary: string | null;
  catalystSummary: string | null;
}

/**
 * 2026-08-19新增：個股頁「總覽」用的質化投資論點——取最新一份已解析法說會的護城河/市占率/
 * 客戶/催化劑四個維度（見parseEarningsCall.ts），簡報完全沒談到任何一項時data會是null，
 * 這張卡直接不渲染（不是強制顯示空狀態——這張卡本來就是錦上添花，法說會分頁本身才是
 * 「沒有資料」訊息該出現的地方，總覽不需要重複）。
 */
export function InvestmentThesisCard({ data }: { data: InvestmentThesisData | null }) {
  if (!data) return null;

  return (
    <Card>
      <SectionHeader icon={Lightbulb} iconColor="amber" title="投資論點" />
      <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">整理自{data.conferenceDate}法說會簡報</p>
      <div className="mt-3 flex flex-col gap-2 text-xs">
        {data.moatSummary && (
          <p>
            <span className="font-medium text-zinc-500 dark:text-zinc-400">護城河：</span>
            <span className="text-zinc-700 dark:text-zinc-300">{data.moatSummary}</span>
          </p>
        )}
        {data.marketShareSummary && (
          <p>
            <span className="font-medium text-zinc-500 dark:text-zinc-400">市占率：</span>
            <span className="text-zinc-700 dark:text-zinc-300">{data.marketShareSummary}</span>
          </p>
        )}
        {data.customerSummary && (
          <p>
            <span className="font-medium text-zinc-500 dark:text-zinc-400">客戶：</span>
            <span className="text-zinc-700 dark:text-zinc-300">{data.customerSummary}</span>
          </p>
        )}
        {data.catalystSummary && (
          <p>
            <span className="font-medium text-zinc-500 dark:text-zinc-400">催化劑：</span>
            <span className="text-zinc-700 dark:text-zinc-300">{data.catalystSummary}</span>
          </p>
        )}
      </div>
    </Card>
  );
}
