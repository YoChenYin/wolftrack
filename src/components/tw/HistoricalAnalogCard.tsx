import { History } from "lucide-react";
import { InfoTooltip } from "../InfoTooltip";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { twReturnColor } from "@/lib/tw/color";
import type { MaArrangement, ChipConcentrationBucket } from "@/lib/trend/tw/backtestScenario";
import type { ScenarioHorizonStats } from "@/lib/trend/tw/scenarioBacktestSummary";

export interface HistoricalAnalogData {
  maArrangement: MaArrangement;
  chipBucket: ChipConcentrationBucket;
  horizons: ScenarioHorizonStats[];
}

const MA_ARRANGEMENT_LABEL: Record<MaArrangement, string> = {
  bullish: "多頭排列（MA5>MA10>MA20）",
  bearish: "空頭排列（MA5<MA10<MA20）",
  mixed: "糾結盤整",
};

const CHIP_BUCKET_LABEL: Record<ChipConcentrationBucket, string> = {
  low: "籌碼集中度低（<10%）",
  mid: "籌碼集中度中（10-20%）",
  high: "籌碼集中度高（≥20%）",
};

/**
 * 「歷史相似情境統計」卡片（2026-08-22新增，見docs/progress-status.md「走勢預測模型」章節）：
 * 使用者想要的是「用MA+籌碼量能關係做走勢預測」，但直接輸出「預測」有投顧牌照風險，改成
 * 呈現「這個MA排列+籌碼集中度組合，過去出現時未來N個交易日的報酬分布」——是歷史統計事實，
 * 不是預測，使用者自己判斷，跟buyDip現有的70%勝率標示同一種呈現邏輯。
 */
export function HistoricalAnalogCard({ data }: { data: HistoricalAnalogData | null }) {
  if (!data) {
    return (
      <Card>
        <SectionHeader icon={History} iconColor="violet" title="歷史相似情境統計" />
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">這檔股票目前沒有足夠的價格或籌碼歷史資料（需要近20個交易日）。</p>
      </Card>
    );
  }

  const hasAnySample = data.horizons.some((h) => h.sampleSize >= 1 && h.winRatePct !== null);

  return (
    <Card>
      <SectionHeader
        icon={History}
        iconColor="violet"
        title="歷史相似情境統計"
        tooltip={
          <InfoTooltip>
            把「MA5/10/20排列狀態」跟「近20日籌碼集中度」交叉，回溯統計這個組合過去在這檔股票歷史上出現時，未來N個交易日的實際報酬分布。這是歷史統計數據，不是預測，過去績效不代表未來表現，僅供參考。
          </InfoTooltip>
        }
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 dark:bg-violet-400/10 dark:text-violet-400">
          {MA_ARRANGEMENT_LABEL[data.maArrangement]}
        </span>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
          {CHIP_BUCKET_LABEL[data.chipBucket]}
        </span>
      </div>

      {!hasAnySample ? (
        <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">這個組合在這檔股票的歷史資料裡樣本數不足，暫不呈現統計數字。</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-xs">
            <thead>
              <tr className="text-zinc-400 dark:text-zinc-500">
                <th className="pb-1.5 font-medium">持有天數</th>
                <th className="pb-1.5 font-medium">樣本數</th>
                <th className="pb-1.5 font-medium">上漲比例</th>
                <th className="pb-1.5 font-medium">平均報酬</th>
                <th className="pb-1.5 font-medium">超額報酬（vs大盤）</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
              {data.horizons.map((h) => (
                <tr key={h.horizon}>
                  <td className="py-1.5 font-medium text-zinc-700 dark:text-zinc-300">+{h.horizon}日</td>
                  {h.winRatePct === null ? (
                    <td colSpan={4} className="py-1.5 text-zinc-400 dark:text-zinc-500">
                      樣本數不足（{h.sampleSize}筆）
                    </td>
                  ) : (
                    <>
                      <td className="py-1.5 tabular-nums text-zinc-600 dark:text-zinc-300">{h.sampleSize}</td>
                      <td className="py-1.5 tabular-nums font-medium text-zinc-900 dark:text-zinc-100">{h.winRatePct.toFixed(1)}%</td>
                      <td className={`py-1.5 tabular-nums font-medium ${twReturnColor(h.avgReturnPct)}`}>
                        {h.avgReturnPct! > 0 ? "+" : ""}
                        {h.avgReturnPct!.toFixed(2)}%
                      </td>
                      <td className={`py-1.5 tabular-nums font-medium ${h.excessReturnPct !== null ? twReturnColor(h.excessReturnPct) : ""}`}>
                        {h.excessReturnPct === null ? "N/A" : `${h.excessReturnPct > 0 ? "+" : ""}${h.excessReturnPct.toFixed(2)}%`}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
