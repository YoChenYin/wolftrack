import { prisma } from "@/lib/prisma";
import { BACKTEST_HORIZONS, type BacktestCategory, type BacktestHorizon } from "./backtestWalkForward";

export interface HorizonStats {
  horizon: BacktestHorizon;
  sampleSize: number;
  winRatePct: number | null;
  avgReturnPct: number | null;
  medianReturnPct: number | null;
  /** 同一組事件日期，大盤本身同期的平均報酬——拿來跟avgReturnPct比，判斷訊號是不是
   * 只是「反正股票長期會漲/大盤同期也在漲」，不是訊號本身的邊際效益 */
  avgTaiexReturnPct: number | null;
  /** avgReturnPct - avgTaiexReturnPct，只在兩者都有值時才算 */
  excessReturnPct: number | null;
}

export interface CategoryBacktestSummary {
  category: BacktestCategory;
  totalEvents: number;
  horizons: HorizonStats[];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const HORIZON_FIELD: Record<BacktestHorizon, { own: string; taiex: string }> = {
  5: { own: "return5d", taiex: "taiexReturn5d" },
  10: { own: "return10d", taiex: "taiexReturn10d" },
  20: { own: "return20d", taiex: "taiexReturn20d" },
  40: { own: "return40d", taiex: "taiexReturn40d" },
  60: { own: "return60d", taiex: "taiexReturn60d" },
};

/**
 * 彙總戰術訊號回測結果（見backtestWalkForward.ts/runTwSignalBacktest.ts）：每個分類、每個
 * 持有期間的勝率/平均報酬/中位數報酬/樣本數，加上同期大盤報酬當比較基準。
 *
 * excludeEtf：預設排除ETF（industry="ETF"，例如0050元大台灣50）——ETF的法人籌碼流動態
 * （造市商/授權參與人的日常申贖套利）跟個股籌碼流訊號代表的意義完全不同，混進來會嚴重
 * 扭曲統計結果（實測0050單檔就貢獻了749筆事件，遠高於任何個股，會把整體樣本稀釋成主要在
 * 反映ETF套利行為而不是個股籌碼訊號）。
 */
export async function computeBacktestSummary(excludeEtf = true): Promise<CategoryBacktestSummary[]> {
  const events = await prisma.twSignalBacktestEvent.findMany({
    where: excludeEtf ? { stock: { industry: { not: "ETF" } } } : {},
    select: {
      category: true,
      return5d: true,
      return10d: true,
      return20d: true,
      return40d: true,
      return60d: true,
      taiexReturn5d: true,
      taiexReturn10d: true,
      taiexReturn20d: true,
      taiexReturn40d: true,
      taiexReturn60d: true,
    },
  });

  const byCategory = new Map<BacktestCategory, typeof events>();
  for (const e of events) {
    const list = byCategory.get(e.category) ?? [];
    list.push(e);
    byCategory.set(e.category, list);
  }

  const summaries: CategoryBacktestSummary[] = [];
  for (const [category, categoryEvents] of byCategory) {
    const horizons: HorizonStats[] = BACKTEST_HORIZONS.map((h) => {
      const field = HORIZON_FIELD[h];
      const ownValues = categoryEvents
        .map((e) => e[field.own as keyof typeof e])
        .filter((v): v is NonNullable<typeof v> => v !== null)
        .map((v) => Number(v));
      const taiexValues = categoryEvents
        .map((e) => e[field.taiex as keyof typeof e])
        .filter((v): v is NonNullable<typeof v> => v !== null)
        .map((v) => Number(v));

      const sampleSize = ownValues.length;
      const winRatePct = sampleSize > 0 ? round2((ownValues.filter((v) => v > 0).length / sampleSize) * 100) : null;
      const avgReturnPct = sampleSize > 0 ? round2(ownValues.reduce((a, b) => a + b, 0) / sampleSize) : null;
      const medianReturnPct = median(ownValues);
      const avgTaiexReturnPct =
        taiexValues.length > 0 ? round2(taiexValues.reduce((a, b) => a + b, 0) / taiexValues.length) : null;
      const excessReturnPct =
        avgReturnPct !== null && avgTaiexReturnPct !== null ? round2(avgReturnPct - avgTaiexReturnPct) : null;

      return {
        horizon: h,
        sampleSize,
        winRatePct,
        avgReturnPct,
        medianReturnPct: medianReturnPct !== null ? round2(medianReturnPct) : null,
        avgTaiexReturnPct,
        excessReturnPct,
      };
    });

    summaries.push({ category, totalEvents: categoryEvents.length, horizons });
  }

  return summaries;
}

/** 樣本數低於這個門檻，不當作「已經有統計意義」——實測headShoulders只有243筆（vs其他
 * 分類動輒2萬~9萬筆），數字噪音太大，UI上寧可繼續顯示「效果未驗證」也不要秀出不穩定的數字 */
const MIN_SAMPLE_SIZE_FOR_UI = 500;

export interface BadgeStats {
  category: BacktestCategory;
  sampleSize: number;
  winRatePct: number;
  excessReturnPct: number;
}

/**
 * 給選股清單tab標題的badge用（取代靜態的「效果未驗證」）——只查20日這個單一horizon、
 * 用SQL直接GROUP BY算好聚合值，不像computeBacktestSummary()那樣把全部事件（實測23萬+筆）
 * 撈進Node.js記憶體逐筆處理，這個查詢每次頁面載入都會跑，要控制成本。
 * 樣本數<MIN_SAMPLE_SIZE_FOR_UI的分類不會出現在回傳結果裡，呼叫端fallback回靜態「效果未驗證」。
 */
export async function getBacktestBadgeStats(): Promise<Map<BacktestCategory, BadgeStats>> {
  const rows = await prisma.$queryRaw<
    { category: BacktestCategory; sample_size: bigint; win_rate_pct: number | null; avg_return_pct: number | null; avg_taiex_return_pct: number | null }[]
  >`
    SELECT
      e.category,
      COUNT(*) FILTER (WHERE e.return_20d IS NOT NULL) AS sample_size,
      (COUNT(*) FILTER (WHERE e.return_20d > 0))::float * 100.0 / NULLIF(COUNT(*) FILTER (WHERE e.return_20d IS NOT NULL), 0) AS win_rate_pct,
      AVG(e.return_20d) AS avg_return_pct,
      AVG(e.taiex_return_20d) AS avg_taiex_return_pct
    FROM tw_signal_backtest_events e
    JOIN stocks s ON s.id = e.stock_id
    WHERE s.industry IS DISTINCT FROM 'ETF'
    GROUP BY e.category
  `;

  const result = new Map<BacktestCategory, BadgeStats>();
  for (const row of rows) {
    const sampleSize = Number(row.sample_size);
    if (sampleSize < MIN_SAMPLE_SIZE_FOR_UI || row.avg_return_pct === null || row.avg_taiex_return_pct === null || row.win_rate_pct === null) {
      continue;
    }
    result.set(row.category, {
      category: row.category,
      sampleSize,
      winRatePct: round2(row.win_rate_pct),
      excessReturnPct: round2(row.avg_return_pct - row.avg_taiex_return_pct),
    });
  }
  return result;
}
