import { Scale } from "lucide-react";
import { Card } from "./ui/Card";
import { SectionHeader } from "./ui/SectionHeader";
import { InfoTooltip } from "./InfoTooltip";
import type { DecisionOsSnapshotView } from "@/lib/decisionOs/queryLatestSnapshot";
import type { DecisionLabSnapshotView } from "@/lib/decisionLab/querySnapshot";
import { computeCrossCheck, type CrossCheckAlignment } from "@/lib/crossCheck/computeCrossCheck";
import { REGIME_LABELS } from "@/lib/decisionLab/types";

const STANCE_LABEL: Record<string, string> = { bull: "偏多", bear: "偏空", neutral: "中性" };

/** TW慣例紅漲綠跌：偏多用紅、偏空用綠，維持跟站上其他多空色彩一致 */
const DIRECTION_DOT: Record<string, string> = {
  bull: "bg-red-500",
  bear: "bg-emerald-500",
  neutral: "bg-zinc-400 dark:bg-zinc-500",
};

const ALIGNMENT_BADGE: Record<CrossCheckAlignment, { label: string; className: string }> = {
  alignedBull: { label: "方向一致（偏多）", className: "bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-400" },
  alignedBear: { label: "方向一致（偏空）", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400" },
  alignedNeutral: { label: "方向一致（中性）", className: "bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400" },
  partial: { label: "部分確認", className: "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-400" },
  diverged: { label: "方向分歧", className: "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400" },
};

/**
 * 台指期 Decision OS（台股本身）跟 Decision Lab（全球總經環境）是兩套獨立系統，這裡只做
 * 對照顯示、不合併算分——同一張卡片放在 /futures 跟 /macro 兩個頁面，讓使用者不管在哪一頁
 * 都看得到另一套系統目前怎麼說，自己判斷兩邊是互相確認還是背離。
 */
export function CrossSystemCheck({
  osSnapshot,
  labSnapshot,
}: {
  osSnapshot: DecisionOsSnapshotView | null;
  labSnapshot: DecisionLabSnapshotView | null;
}) {
  const result = computeCrossCheck(osSnapshot, labSnapshot);

  return (
    <Card>
      <SectionHeader
        icon={Scale}
        iconColor="violet"
        title="台指 × 總經 交叉檢查"
        tooltip={
          <InfoTooltip>
            兩套系統各自獨立運作、看不同市場（台指期 Decision OS 看 TAIEX，Decision Lab 看 SPX
            為主的全球環境），資料源、權重、校準方式都不同，這裡不合併算分，只做方向對照：
            兩邊都偏多/偏空代表訊心度較高，方向分歧則代表台股走勢可能背離全球環境，建議提高警覺。
          </InfoTooltip>
        }
      />

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-zinc-50/70 p-3 ring-1 ring-zinc-900/[0.04] dark:bg-white/[0.04] dark:ring-white/[0.06]">
          <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">台指期 Decision OS</p>
          <div className="mt-1 flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${result.osDirection ? DIRECTION_DOT[result.osDirection] : "bg-zinc-300 dark:bg-zinc-700"}`} />
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              {osSnapshot ? STANCE_LABEL[osSnapshot.finalStance] : "尚無今日快照"}
            </span>
          </div>
        </div>
        <div className="rounded-xl bg-zinc-50/70 p-3 ring-1 ring-zinc-900/[0.04] dark:bg-white/[0.04] dark:ring-white/[0.06]">
          <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">全球總經 Decision Lab</p>
          <div className="mt-1 flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${result.labDirection ? DIRECTION_DOT[result.labDirection] : "bg-zinc-300 dark:bg-zinc-700"}`} />
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              {labSnapshot ? REGIME_LABELS[labSnapshot.regime] : "尚無今日快照"}
            </span>
          </div>
        </div>
      </div>

      {result.alignment && (
        <span className={`mt-3 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${ALIGNMENT_BADGE[result.alignment].className}`}>
          {ALIGNMENT_BADGE[result.alignment].label}
        </span>
      )}

      <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{result.summary}</p>
    </Card>
  );
}
