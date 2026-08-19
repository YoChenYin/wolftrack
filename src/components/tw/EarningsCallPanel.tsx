import { Presentation, FileText } from "lucide-react";
import { InfoTooltip } from "../InfoTooltip";
import { Card, SubCard } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";

export interface EarningsCallAnalysisItem {
  conferenceDate: string;
  pdfUrl: string;
  /** null=還沒被LLM解析（待解析，只有PDF連結），見runEarningsCallAnalysis.ts說明 */
  profitGrowthSummary: string | null;
  outlookSummary: string | null;
  riskSummary: string | null;
  signal: "positive" | "neutral" | "negative" | null;
}

const SIGNAL_STYLE: Record<string, { label: string; className: string }> = {
  positive: { label: "正面", className: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-400/10 dark:text-red-400 dark:ring-red-400/20" },
  negative: {
    label: "負面",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-400 dark:ring-emerald-400/20",
  },
  neutral: { label: "中性", className: "bg-zinc-50 text-zinc-600 ring-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:ring-white/10" },
};

/**
 * 2026-07-25新增：法說會基本面訊號（見 runEarningsCallAnalysis.ts）。2026-08-19起涵蓋範圍
 * 擴大到所有有分類到板塊的股票（不限龍頭），且支援「待解析」狀態——LLM額度還沒排到時
 * 只有PDF簡報連結、沒有摘要。
 * 2026-08-19：個股頁改成tab分頁後，沒有資料時不能再直接return null（原本邏輯是「長頁面
 * 直向堆疊時，沒資料就整塊不渲染，讓下一個區塊自然接上」；改成分頁後，使用者點開這個
 * tab預期至少看到「沒有資料」的訊息，不是一片空白，跟其他區塊的沒資料狀態一致）。
 */
export function EarningsCallPanel({ analyses }: { analyses: EarningsCallAnalysisItem[] }) {
  if (analyses.length === 0) {
    return (
      <Card>
        <SectionHeader icon={Presentation} iconColor="violet" title="法說會基本面訊號" />
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">這檔股票目前沒有法說會分析資料。</p>
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader
        icon={Presentation}
        iconColor="violet"
        title="法說會基本面訊號"
        tooltip={
          <InfoTooltip>
            抓取這檔股票（龍頭股）的法人說明會簡報PDF，用LLM解析出獲利成長、未來展望、風險因素三個重點，並給出整體基本面訊號（正面/中性/負面）。資料來源是公開資訊觀測站的法說會簡報，一季更新一次。
          </InfoTooltip>
        }
      />
      <div className="mt-3 flex flex-col gap-3">
        {analyses.map((a) => {
          const style = a.signal ? SIGNAL_STYLE[a.signal] ?? SIGNAL_STYLE.neutral : null;
          return (
            <SubCard key={a.conferenceDate} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-zinc-400 dark:text-zinc-500">{a.conferenceDate}</span>
                {style ? (
                  <span className={`rounded px-1.5 py-0.5 font-medium ring-1 ${style.className}`}>{style.label}</span>
                ) : (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-400 dark:ring-amber-400/20">
                    待解析
                  </span>
                )}
              </div>
              {a.profitGrowthSummary !== null ? (
                <div className="mt-2 flex flex-col gap-1.5">
                  <p>
                    <span className="font-medium text-zinc-500 dark:text-zinc-400">獲利成長：</span>
                    <span className="text-zinc-700 dark:text-zinc-300">{a.profitGrowthSummary}</span>
                  </p>
                  <p>
                    <span className="font-medium text-zinc-500 dark:text-zinc-400">展望：</span>
                    <span className="text-zinc-700 dark:text-zinc-300">{a.outlookSummary}</span>
                  </p>
                  <p>
                    <span className="font-medium text-zinc-500 dark:text-zinc-400">風險：</span>
                    <span className="text-zinc-700 dark:text-zinc-300">{a.riskSummary}</span>
                  </p>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="text-zinc-400 dark:text-zinc-500">LLM還沒解析這份簡報：</span>
                  <a
                    href={a.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-violet-600 hover:underline dark:text-violet-400"
                  >
                    <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />
                    開啟簡報PDF
                  </a>
                </div>
              )}
            </SubCard>
          );
        })}
      </div>
    </Card>
  );
}
