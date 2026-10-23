import { prisma } from "@/lib/prisma";
import { getChainStagesWithThemes, listAllChainNames } from "./groupConfig";
import { sanitizeRevenueSeries } from "@/lib/trend/tw/revenueMomentum";

/**
 * 2026-10-14：產業鏈營收傳導——把每條產業鏈每一層（上中下游/支援層）成分股的月營收加總，
 * 看各層的營收動能，以及「某一層先轉強、另一層幾個月後才跟上」的領先落後關係。零LLM成本。
 *
 * 加總方式：每個月只用「當月跟去年同期3個月都有營收資料」的成分股（同一批公司比同一批公司），
 * 避免成分股上市/下市、資料回補範圍不同造成的假成長。營收先經過sanitizeRevenueSeries清掉
 * FinMind的單月單位錯誤。
 */

export interface StageMonth {
  month: string;
  /** 該層近3月合計營收年增率% */
  yoy3Pct: number;
  /** 這個月實際納入計算的成分股數 */
  memberCount: number;
}

export interface StageRevenueSeries {
  chainName: string;
  stageKey: string;
  label: string;
  memberTickers: string[];
  months: StageMonth[];
}

function addMonths(month: string, n: number): string {
  const d = new Date(`${month}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** 一層至少要有幾家公司有資料，該月才算數（樣本太少的月份只反映一兩家公司的狀況） */
const MIN_MEMBERS_PER_MONTH = 3;

export function computeStageSeries(memberRevenue: Map<string, Map<string, number>>): StageMonth[] {
  const allMonths = new Set<string>();
  for (const series of memberRevenue.values()) for (const m of series.keys()) allMonths.add(m);
  const result: StageMonth[] = [];
  for (const month of [...allMonths].sort()) {
    let recent = 0;
    let prior = 0;
    let count = 0;
    for (const series of memberRevenue.values()) {
      let r = 0;
      let p = 0;
      let complete = true;
      for (let i = 0; i < 3 && complete; i++) {
        const cur = series.get(addMonths(month, -i));
        const last = series.get(addMonths(month, -12 - i));
        if (cur === undefined || last === undefined || cur <= 0 || last <= 0) complete = false;
        else {
          r += cur;
          p += last;
        }
      }
      if (!complete) continue;
      recent += r;
      prior += p;
      count++;
    }
    if (count >= MIN_MEMBERS_PER_MONTH && prior > 0) {
      result.push({ month, yoy3Pct: Math.round(((recent - prior) / prior) * 10000) / 100, memberCount: count });
    }
  }
  return result;
}

/** 讀出全部產業鏈每一層的營收序列；sinceMonth用來限制UI只撈近幾年（研究腳本傳null撈全部） */
export async function loadChainStageSeries(sinceMonth: string | null): Promise<StageRevenueSeries[]> {
  const stages = listAllChainNames().flatMap((chainName) =>
    (getChainStagesWithThemes(chainName) ?? []).map((s) => ({
      chainName,
      stageKey: s.stageKey,
      label: s.label,
      tickers: [...new Set(s.themes.flatMap((t) => t.members))],
    }))
  );
  const allTickers = [...new Set(stages.flatMap((s) => s.tickers))];
  const stocks = await prisma.stock.findMany({ where: { market: "TW", ticker: { in: allTickers } }, select: { id: true, ticker: true } });
  const tickerById = new Map(stocks.map((s) => [s.id, s.ticker]));
  // 年增率要往前多抓15個月（去年同期3個月）
  const from = sinceMonth ? new Date(`${addMonths(sinceMonth, -15)}T00:00:00Z`) : undefined;
  const rows = await prisma.twMonthlyRevenue.findMany({
    where: { stockId: { in: stocks.map((s) => s.id) }, ...(from ? { revenueMonth: { gte: from } } : {}) },
    orderBy: [{ stockId: "asc" }, { revenueMonth: "asc" }],
    select: { stockId: true, revenueMonth: true, revenue: true },
  });

  const rawByTicker = new Map<string, { month: string; revenue: number }[]>();
  for (const r of rows) {
    const ticker = tickerById.get(r.stockId)!;
    const list = rawByTicker.get(ticker) ?? [];
    list.push({ month: r.revenueMonth.toISOString().slice(0, 10), revenue: Number(r.revenue) });
    rawByTicker.set(ticker, list);
  }
  const cleanByTicker = new Map<string, Map<string, number>>();
  for (const [ticker, series] of rawByTicker) {
    cleanByTicker.set(ticker, new Map(sanitizeRevenueSeries(series).map((x) => [x.month, x.revenue])));
  }

  return stages.map((s) => {
    const members = new Map<string, Map<string, number>>();
    for (const t of s.tickers) {
      const series = cleanByTicker.get(t);
      if (series) members.set(t, series);
    }
    const months = computeStageSeries(members).filter((m) => !sinceMonth || m.month >= sinceMonth);
    return { chainName: s.chainName, stageKey: s.stageKey, label: s.label, memberTickers: s.tickers, months };
  });
}

/**
 * 領先落後：A層第t月的營收動能變化（近3月年增率 vs 3個月前）跟B層第t+lag月的動能變化之間的
 * 相關係數。正相關且lag>0＝A層的轉折會在lag個月後出現在B層。monthFilter用來切train/test。
 */
export function leadLagCorrelation(
  a: StageMonth[],
  b: StageMonth[],
  lag: number,
  monthFilter: (month: string) => boolean = () => true
): { corr: number; n: number } | null {
  const delta = (series: StageMonth[]) => {
    const byMonth = new Map(series.map((m) => [m.month, m.yoy3Pct]));
    const out = new Map<string, number>();
    for (const m of series) {
      const before = byMonth.get(addMonths(m.month, -3));
      if (before !== undefined) out.set(m.month, m.yoy3Pct - before);
    }
    return out;
  };
  const da = delta(a);
  const db = delta(b);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [month, x] of da) {
    if (!monthFilter(month)) continue;
    const y = db.get(addMonths(month, lag));
    if (y === undefined) continue;
    xs.push(x);
    ys.push(y);
  }
  const n = xs.length;
  if (n < 12) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    cov += (xs[i] - mx) * (ys[i] - my);
    vx += (xs[i] - mx) ** 2;
    vy += (ys[i] - my) ** 2;
  }
  if (vx === 0 || vy === 0) return null;
  return { corr: cov / Math.sqrt(vx * vy), n };
}
