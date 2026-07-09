import Link from "next/link";
import type { SectorTrendItem } from "@/lib/trend/sectorTrendsQuery";
import { stripCompanySuffix } from "@/lib/formatCompanyName";
import { InfoTooltip } from "../InfoTooltip";

/**
 * 「籌碼領先」觀察名單：技術面還沒觸發任何戰術分類，但籌碼集中度已經加速轉強
 * （見 calculateTwDailySignal.ts 的 isChipLeadingCandidate）。刻意跟主要三欄的視覺份量拉開，
 * 標題用「⏳待確認」而不是雷達/穩健這種確定語氣，避免使用者誤以為可信度跟反轉雷達一樣。
 */
export function ChipLeadingList({ items }: { items: SectorTrendItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/60 p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-600">
        ⏳ 籌碼領先 · 待確認
        <InfoTooltip>
          技術面尚未觸發反轉雷達/蓄勢待發/趨勢穩健任何一種分類，但籌碼集中度呈現「5日&gt;10日&gt;20日」加速轉強、且籌碼分數達門檻——可能是法人剛開始布局、股價還沒真的發動。可信度天生比其他三欄低（少了技術面確認），是觀察名單不是進場訊號。
        </InfoTooltip>
      </h2>
      <p className="mt-0.5 text-xs text-zinc-400">股價還沒動，但籌碼集中度已經加速轉強 — 先觀察，別急著追</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <Link
            key={item.ticker}
            href={`/tw/stock/${item.ticker}`}
            className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs hover:border-zinc-400"
          >
            <span className="font-semibold text-zinc-800">{item.ticker}</span>
            <span className="text-zinc-500">{stripCompanySuffix(item.companyName)}</span>
            <span className="rounded bg-zinc-100 px-1 py-0.5 text-[10px] font-medium text-zinc-500">
              籌碼 {item.chipScore?.toFixed(0)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
