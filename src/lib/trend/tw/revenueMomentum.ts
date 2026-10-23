/**
 * 2026-10-14：月營收動能（零LLM成本的量化基本面），給選股表「營收加速」標記跟營收×籌碼共振回測
 * （scripts/backtest-revenue-chip.ts）共用。全部用營收金額自己算，不用tw_monthly_revenue上的
 * yoy_growth_pct欄位——那個欄位在FinMind回補/OpenAPI兩種來源交界處曾經因為單位混用而不可靠
 * （見migration 20261014120000_normalize_revenue_units_to_thousands）。
 *
 * 時間點：台股月營收規定次月10日前公布，某月的營收從「次月11日」起才算已知（保守估計，
 * 多數公司更早公布）。回測跟正式環境都用availableFrom判斷，避免拿到當時還沒公布的營收。
 */

export interface RevenueMonth {
  /** 該月第一天，YYYY-MM-01 */
  month: string;
  /** 千元 */
  revenue: number;
}

export interface RevenueMomentum {
  month: string;
  /** 這個月營收從哪天起算已公布（次月11日） */
  availableFrom: string;
  revenue: number;
  /** 單月年增率% */
  yoyPct: number | null;
  /** 近3個月合計 vs 去年同期3個月合計的年增率%（比單月穩定，不受單月出貨時點干擾） */
  yoy3Pct: number | null;
  /** 近12個月合計 vs 前12個月合計的年增率% */
  yoy12Pct: number | null;
  /** 營收加速：近3月年增率>0，且比近12月年增率高ACCELERATION_MARGIN_PP個百分點以上 */
  accelerating: boolean;
  /** 營收減速：近3月年增率<0，且比近12月年增率低ACCELERATION_MARGIN_PP個百分點以上 */
  decelerating: boolean;
  /** 同期新高：這個月營收高於過去每一年的同月份（至少要有2年同月資料比較） */
  sameMonthHigh: boolean;
  /** 歷史新高：高於之前所有月份（至少要有24個月歷史） */
  allTimeHigh: boolean;
  /**
   * 2026-10-14新增：營收驚喜（給「營收公布後市場沒反應」雷達用）——預期營收＝去年同月營收×
   * 「這個月之前3個月」的年增倍數，同時考慮季節性（去年同月）跟公布前就已知的近期趨勢，
   * 只用這個月公布前就能知道的資料。驚喜%＝實際/預期−1。
   */
  expectedRevenue: number | null;
  surprisePct: number | null;
}

/** 近3月跟近12月年增率差多少百分點才算「加速/減速」，避免兩者只差一點點的雜訊 */
export const ACCELERATION_MARGIN_PP = 5;
/** 營收狀態最多沿用多久：最新已公布月份的公布日距今超過這個天數就視為資料過舊，不給狀態 */
const MAX_STALENESS_DAYS = 70;

function addMonths(month: string, n: number): string {
  const d = new Date(`${month}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

export function revenueAvailableFrom(month: string): string {
  return addMonths(month, 1).slice(0, 8) + "11";
}

function growthPct(current: number, prior: number): number | null {
  if (prior <= 0 || current < 0) return null;
  return Math.round(((current - prior) / prior) * 10000) / 100;
}

/** 連續N個月都有資料才加總，缺任何一個月回傳null（不拿不完整的區間硬算） */
function sumMonths(byMonth: Map<string, number>, endMonth: string, count: number): number | null {
  let total = 0;
  for (let i = 0; i < count; i++) {
    const v = byMonth.get(addMonths(endMonth, -i));
    // 金控/保險等公司的月營收可能是負數，年增率沒有意義，不硬算
    if (v === undefined || v <= 0) return null;
    total += v;
  }
  return total;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** 跟前12個月中位數差這麼多倍以上，才懷疑是單位錯誤 */
const UNIT_GLITCH_RATIO = 100;

/**
 * FinMind偶爾有單一月份的單位錯誤（實測1727 2021-11、2317 2017-09等月份只剩前後月的1/1000，
 * 下個月又跳回來），一個月出錯會讓之後24個月的近12月年增率全部失真。跟「前12個月」的中位數
 * 比較（只看過去，回測不會偷看未來），差100倍以上、而且×1000或÷1000之後剛好落在合理範圍
 * （中位數的1/10~10倍）才修正，真的暴增暴減的營收不會被誤改。
 */
export function sanitizeRevenueSeries(series: RevenueMonth[]): RevenueMonth[] {
  const sorted = [...series].sort((a, b) => a.month.localeCompare(b.month));
  const result: RevenueMonth[] = [];
  for (const r of sorted) {
    const trailing = result.slice(-12).map((x) => x.revenue).filter((v) => v > 0);
    let revenue = r.revenue;
    if (revenue > 0 && trailing.length >= 6) {
      const m = median(trailing);
      const inRange = (v: number) => v >= m / 10 && v <= m * 10;
      if (revenue * UNIT_GLITCH_RATIO < m && inRange(revenue * 1000)) revenue *= 1000;
      else if (revenue > m * UNIT_GLITCH_RATIO && inRange(revenue / 1000)) revenue = Math.round(revenue / 1000);
    }
    result.push({ month: r.month, revenue });
  }
  return result;
}

export function computeRevenueMomentum(series: RevenueMonth[]): RevenueMomentum[] {
  const sorted = sanitizeRevenueSeries(series);
  const byMonth = new Map(sorted.map((r) => [r.month, r.revenue]));
  const result: RevenueMomentum[] = [];
  let maxSoFar = -Infinity;
  let monthsSeen = 0;

  for (const r of sorted) {
    const lastYear = byMonth.get(addMonths(r.month, -12));
    const yoyPct = lastYear !== undefined ? growthPct(r.revenue, lastYear) : null;

    const recent3 = sumMonths(byMonth, r.month, 3);
    const prior3 = sumMonths(byMonth, addMonths(r.month, -12), 3);
    const yoy3Pct = recent3 !== null && prior3 !== null ? growthPct(recent3, prior3) : null;

    const recent12 = sumMonths(byMonth, r.month, 12);
    const prior12 = sumMonths(byMonth, addMonths(r.month, -12), 12);
    const yoy12Pct = recent12 !== null && prior12 !== null ? growthPct(recent12, prior12) : null;

    const before3 = sumMonths(byMonth, addMonths(r.month, -1), 3);
    const before3LastYear = sumMonths(byMonth, addMonths(r.month, -13), 3);
    const expectedRevenue =
      lastYear !== undefined && lastYear > 0 && before3 !== null && before3LastYear !== null
        ? lastYear * (before3 / before3LastYear)
        : null;
    const surprisePct = expectedRevenue !== null && r.revenue >= 0 ? growthPct(r.revenue, expectedRevenue) : null;

    const sameMonthPrior: number[] = [];
    for (let y = 1; ; y++) {
      const v = byMonth.get(addMonths(r.month, -12 * y));
      if (v === undefined) break;
      sameMonthPrior.push(v);
    }

    result.push({
      month: r.month,
      availableFrom: revenueAvailableFrom(r.month),
      revenue: r.revenue,
      yoyPct,
      yoy3Pct,
      yoy12Pct,
      accelerating: yoy3Pct !== null && yoy12Pct !== null && yoy3Pct > 0 && yoy3Pct - yoy12Pct >= ACCELERATION_MARGIN_PP,
      decelerating: yoy3Pct !== null && yoy12Pct !== null && yoy3Pct < 0 && yoy12Pct - yoy3Pct >= ACCELERATION_MARGIN_PP,
      sameMonthHigh: r.revenue > 0 && sameMonthPrior.length >= 2 && r.revenue > Math.max(...sameMonthPrior),
      allTimeHigh: r.revenue > 0 && monthsSeen >= 24 && r.revenue > maxSoFar,
      expectedRevenue,
      surprisePct,
    });

    maxSoFar = Math.max(maxSoFar, r.revenue);
    monthsSeen++;
  }
  return result;
}

/** 在date當天已經公布的最新一期營收動能；資料過舊（超過MAX_STALENESS_DAYS）回傳null */
export function momentumAsOf(momentum: RevenueMomentum[], date: string): RevenueMomentum | null {
  let lo = 0;
  let hi = momentum.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (momentum[mid].availableFrom <= date) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found === -1) return null;
  const m = momentum[found];
  const ageDays = (new Date(date).getTime() - new Date(m.availableFrom).getTime()) / 86_400_000;
  return ageDays <= MAX_STALENESS_DAYS ? m : null;
}
