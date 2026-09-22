import { Landmark, Presentation, PlaySquare } from "lucide-react";
import type { ThemeNarrativeResult } from "@/lib/valuation/computeThemeNarrative";
import { SubCard } from "../ui/Card";
import { stripCompanySuffix } from "@/lib/formatCompanyName";

const SIGNAL_STYLE: Record<string, { label: string; className: string }> = {
  positive: { label: "偏多", className: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-400/10 dark:text-red-400 dark:ring-red-400/20" },
  bullish: { label: "偏多", className: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-400/10 dark:text-red-400 dark:ring-red-400/20" },
  negative: {
    label: "偏空",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-400 dark:ring-emerald-400/20",
  },
  bearish: {
    label: "偏空",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-400 dark:ring-emerald-400/20",
  },
  neutral: { label: "中性", className: "bg-zinc-50 text-zinc-600 ring-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:ring-white/10" },
};

function SignalBadge({ signal }: { signal: string | null }) {
  const style = signal ? SIGNAL_STYLE[signal] ?? SIGNAL_STYLE.neutral : null;
  if (!style) return null;
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ${style.className}`}>{style.label}</span>;
}

function NarrativeSubSection({
  icon: Icon,
  title,
  emptyText,
  isEmpty,
  children,
}: {
  icon: typeof Landmark;
  title: string;
  emptyText: string;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  return (
    <SubCard>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
        {title}
      </p>
      {isEmpty ? <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">{emptyText}</p> : children}
    </SubCard>
  );
}

/**
 * 研究簡報的敘事面區塊：法人報告/法說會/YouTube提及三個子區塊分開列，不硬拼成一段文字。
 * 三個來源都是「近90天沒資料就顯示提示文字」而不是整段消失——這是本來就沒有覆蓋、還是
 * 剛好沒人談論，對判斷「這個theme有沒有被市場關注」是兩件不同的事，要讓使用者看得到差異。
 */
export function ThemeNarrativePanel({ narrative }: { narrative: ThemeNarrativeResult }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <NarrativeSubSection icon={Landmark} title="法人報告" emptyText="近90天無提及" isEmpty={narrative.institutionalReports.length === 0}>
        {narrative.institutionalReports.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-2">
            {narrative.institutionalReports.slice(0, 8).map((r) => (
              <div key={r.postId} className="text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-zinc-400 dark:text-zinc-500">{r.publishDate}</span>
                  <SignalBadge signal={r.signal} />
                </div>
                <p className="mt-0.5 text-zinc-700 dark:text-zinc-300">
                  <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {r.title}
                  </a>
                </p>
                {r.mentionedStocks.length > 0 && (
                  <p className="mt-0.5 text-zinc-400 dark:text-zinc-500">
                    {r.mentionedStocks.map((m) => m.ticker).join("、")}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </NarrativeSubSection>

      <NarrativeSubSection icon={Presentation} title="法說會" emptyText="近3個月無法說會分析" isEmpty={narrative.earningsCalls.length === 0}>
        {narrative.earningsCalls.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-2">
            {narrative.earningsCalls.slice(0, 8).map((e) => (
              <div key={`${e.ticker}-${e.conferenceDate}`} className="text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {e.ticker} {stripCompanySuffix(e.companyName)}
                  </span>
                  <SignalBadge signal={e.signal} />
                </div>
                <p className="mt-0.5 text-zinc-400 dark:text-zinc-500">{e.conferenceDate}</p>
                {e.outlookSummary && <p className="mt-0.5 text-zinc-700 dark:text-zinc-300">{e.outlookSummary}</p>}
              </div>
            ))}
          </div>
        )}
      </NarrativeSubSection>

      <NarrativeSubSection icon={PlaySquare} title="YouTube提及" emptyText="近90天無提及" isEmpty={narrative.youtubeMentions.length === 0}>
        {narrative.youtubeMentions.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-2">
            {narrative.youtubeMentions.slice(0, 8).map((y) => (
              <div key={y.stockId} className="text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {y.ticker} {stripCompanySuffix(y.companyName)}
                  </span>
                  <SignalBadge signal={y.latestSentiment} />
                </div>
                <p className="mt-0.5 text-zinc-400 dark:text-zinc-500">
                  {y.channelIds.length}個頻道提及{y.mentionCount}次・最新{y.latestPublishedAt.slice(0, 10)}
                </p>
              </div>
            ))}
          </div>
        )}
      </NarrativeSubSection>
    </div>
  );
}
