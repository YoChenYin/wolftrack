import { InfoTooltip } from "../InfoTooltip";

export interface EarningsCallAnalysisItem {
  conferenceDate: string;
  profitGrowthSummary: string;
  outlookSummary: string;
  riskSummary: string;
  signal: "positive" | "neutral" | "negative";
}

const SIGNAL_STYLE: Record<string, { label: string; className: string }> = {
  positive: { label: "正面", className: "bg-red-50 text-red-700 ring-red-200" },
  negative: { label: "負面", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  neutral: { label: "中性", className: "bg-zinc-50 text-zinc-600 ring-zinc-200" },
};

/**
 * 2026-07-25新增：龍頭股法說會基本面訊號（見 runEarningsCallAnalysis.ts）。只有
 * group_config.json標記的leader股票才會有資料，其餘股票這個區塊不會渲染（見呼叫端判斷）。
 */
export function EarningsCallPanel({ analyses }: { analyses: EarningsCallAnalysisItem[] }) {
  if (analyses.length === 0) return null;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="flex items-center gap-1 text-sm font-semibold text-zinc-900">
        法說會基本面訊號
        <InfoTooltip>
          抓取這檔股票（龍頭股）的法人說明會簡報PDF，用LLM解析出獲利成長、未來展望、風險因素三個重點，並給出整體基本面訊號（正面/中性/負面）。資料來源是公開資訊觀測站的法說會簡報，一季更新一次。
        </InfoTooltip>
      </h2>
      <div className="mt-3 flex flex-col gap-3">
        {analyses.map((a) => {
          const style = SIGNAL_STYLE[a.signal] ?? SIGNAL_STYLE.neutral;
          return (
            <div key={a.conferenceDate} className="rounded border border-zinc-100 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-zinc-400">{a.conferenceDate}</span>
                <span className={`rounded px-1.5 py-0.5 font-medium ring-1 ${style.className}`}>{style.label}</span>
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                <p>
                  <span className="font-medium text-zinc-500">獲利成長：</span>
                  <span className="text-zinc-700">{a.profitGrowthSummary}</span>
                </p>
                <p>
                  <span className="font-medium text-zinc-500">展望：</span>
                  <span className="text-zinc-700">{a.outlookSummary}</span>
                </p>
                <p>
                  <span className="font-medium text-zinc-500">風險：</span>
                  <span className="text-zinc-700">{a.riskSummary}</span>
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
