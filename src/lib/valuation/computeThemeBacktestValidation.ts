import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { round2, type CategoryBacktestSummary, type HorizonStats } from "@/lib/trend/tw/backtestSummary";
import { BACKTEST_HORIZONS, type BacktestCategory, type BacktestHorizon } from "@/lib/trend/tw/backtestWalkForward";

const HORIZON_COLUMNS: Record<BacktestHorizon, { own: string; taiex: string }> = {
  5: { own: "return_5d", taiex: "taiex_return_5d" },
  10: { own: "return_10d", taiex: "taiex_return_10d" },
  20: { own: "return_20d", taiex: "taiex_return_20d" },
  40: { own: "return_40d", taiex: "taiex_return_40d" },
  60: { own: "return_60d", taiex: "taiex_return_60d" },
};

type RawRow = {
  category: BacktestCategory;
  total_events: bigint;
} & {
  [K in `n${BacktestHorizon}` | `win${BacktestHorizon}` | `avg${BacktestHorizon}` | `median${BacktestHorizon}` | `taiex${BacktestHorizon}`]: number | null;
};

/**
 * 共用聚合邏輯：stockIds=null 代表不過濾（全市場基準），有傳則只算這些股票——
 * 用SQL FILTER聚合直接在DB端算完，不是把事件整批拉進Node記憶體逐筆處理，全市場範圍時
 * 這點格外重要（243,000+筆事件，見computeBacktestSummary()註解自己提到的效能考量）。
 */
async function computeBacktestSummaryByStockIds(stockIds: number[] | null, excludeEtf: boolean): Promise<CategoryBacktestSummary[]> {
  if (stockIds !== null && stockIds.length === 0) return [];

  const horizonSelects = BACKTEST_HORIZONS.map((h) => {
    const { own, taiex } = HORIZON_COLUMNS[h];
    return Prisma.sql`
      COUNT(*) FILTER (WHERE e.${Prisma.raw(own)} IS NOT NULL) AS ${Prisma.raw(`n${h}`)},
      (COUNT(*) FILTER (WHERE e.${Prisma.raw(own)} > 0))::float * 100.0
        / NULLIF(COUNT(*) FILTER (WHERE e.${Prisma.raw(own)} IS NOT NULL), 0) AS ${Prisma.raw(`win${h}`)},
      AVG(e.${Prisma.raw(own)}) AS ${Prisma.raw(`avg${h}`)},
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY e.${Prisma.raw(own)})
        FILTER (WHERE e.${Prisma.raw(own)} IS NOT NULL) AS ${Prisma.raw(`median${h}`)},
      AVG(e.${Prisma.raw(taiex)}) AS ${Prisma.raw(`taiex${h}`)}
    `;
  });

  const etfFilter = excludeEtf ? Prisma.sql`AND s.industry IS DISTINCT FROM 'ETF'` : Prisma.sql``;
  const stockIdFilter = stockIds !== null ? Prisma.sql`AND e.stock_id IN (${Prisma.join(stockIds)})` : Prisma.sql``;

  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT
      e.category::text AS category,
      COUNT(*) AS total_events,
      ${Prisma.join(horizonSelects, ",\n")}
    FROM tw_signal_backtest_events e
    JOIN stocks s ON s.id = e.stock_id
    WHERE TRUE
      ${stockIdFilter}
      ${etfFilter}
    GROUP BY e.category
  `);

  return rows.map((row) => {
    const horizons: HorizonStats[] = BACKTEST_HORIZONS.map((h) => {
      const sampleSize = Number(row[`n${h}`] ?? 0);
      const avgReturnPct = row[`avg${h}`] !== null ? round2(Number(row[`avg${h}`])) : null;
      const avgTaiexReturnPct = row[`taiex${h}`] !== null ? round2(Number(row[`taiex${h}`])) : null;
      return {
        horizon: h,
        sampleSize,
        winRatePct: row[`win${h}`] !== null ? round2(Number(row[`win${h}`])) : null,
        avgReturnPct,
        medianReturnPct: row[`median${h}`] !== null ? round2(Number(row[`median${h}`])) : null,
        avgTaiexReturnPct,
        excessReturnPct: avgReturnPct !== null && avgTaiexReturnPct !== null ? round2(avgReturnPct - avgTaiexReturnPct) : null,
      };
    });

    return { category: row.category, totalEvents: Number(row.total_events), horizons };
  });
}

/**
 * 依 ticker 清單（theme/產業鏈階段範圍）算戰術訊號回測統計——跟 backtestSummary.ts 的
 * computeBacktestSummary() 算法一致（勝率/平均/中位數報酬+同期大盤報酬當基準），但範圍限縮到
 * 傳入的股票。單一產業鏈階段（例如半導體/upstream）就有近3萬筆事件，用SQL FILTER聚合
 * （見computeBacktestSummaryByStockIds）比逐筆處理划算。
 */
export async function computeBacktestValidationForTickers(
  tickers: string[],
  excludeEtf = true
): Promise<CategoryBacktestSummary[]> {
  if (tickers.length === 0) return [];

  const stocks = await prisma.stock.findMany({
    where: { market: "TW", ticker: { in: tickers } },
    select: { id: true },
  });
  const stockIds = stocks.map((s) => s.id);
  if (stockIds.length === 0) return [];

  return computeBacktestSummaryByStockIds(stockIds, excludeEtf);
}

/**
 * 全市場基準（不限任何theme），給研究簡報並排對照用——判斷一個theme的訊號是不是真的比
 * 全市場同類訊號更有效，不只是「訊號本身有沒有效」。跟backtestSummary.ts的
 * computeBacktestSummary() 算的是同一件事，但用SQL聚合而不是把事件整批拉進Node記憶體
 * （243,000+筆事件全部逐筆處理，在一個會被同一次chain研究簡報請求呼叫好幾次的函式裡
 * 尤其划不來）。
 */
export async function computeMarketBacktestBaseline(excludeEtf = true): Promise<CategoryBacktestSummary[]> {
  return computeBacktestSummaryByStockIds(null, excludeEtf);
}
