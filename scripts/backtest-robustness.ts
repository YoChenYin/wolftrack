/**
 * 2026-10-23：戰術訊號回測（tw_signal_backtest_events）的穩健度檢查，回答三個問題：
 *
 * 1. 股票池偏差／存活者偏差：回測只涵蓋「現在還在追蹤」的股票，這批股票本來就系統性跑贏大盤
 *    （見docs/us-quant-strategy-research.md）。所以訊號報酬要跟兩種基準比：
 *    - 扣同股：同一檔股票「任意一天進場」的超額報酬（扣掉個股本身長期強勢）
 *    - 扣同日：股票池全部股票「同一天進場」的平均報酬（同時扣掉股票池偏差跟當時的市場狀態，
 *      最嚴格；事件集中在多頭期間時，扣同股會高估訊號貢獻）
 * 2. 多空頭：訊號日加權指數在200日均線上/下分開算，加上逐年拆解。樣本以2024-2026多頭為主，
 *    空頭期的結論可能完全不同。
 * 3. 樣本數門檻：UI用MIN_SAMPLE_SIZE_FOR_UI=500決定要不要秀回測數字。訊號事件在時間上高度
 *    聚集（同一天很多檔一起觸發），一般bootstrap會低估誤差，這裡用「依訊號月份整月重抽」的
 *    cluster bootstrap算信賴區間，並看不同樣本數下平均超額報酬的波動範圍。
 *
 * 唯讀，不寫DB。本機DB事件很少，結論要在production資料上跑才有意義：
 *   DATABASE_URL="<production>" npx tsx scripts/backtest-robustness.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const HORIZONS = [20, 60] as const;
const BOOTSTRAP_ROUNDS = 1000;
const SUBSAMPLE_SIZES = [100, 200, 500, 1000];
/** 訊號事件最早從這天開始（跟回測事件同一段期間），隨機日基準也用同一段 */
const BASELINE_START = "2015-01-01";

interface EventRow {
  stock_id: number;
  category: string;
  signal_date: Date;
  r20: number | null;
  t20: number | null;
  r60: number | null;
  t60: number | null;
  bull: boolean | null;
}

interface DateBaselineRow {
  trade_date: Date;
  r20: number | null;
  r60: number | null;
}

interface BaselineRow {
  stock_id: number;
  excess20: number | null;
  excess60: number | null;
}

/** headShoulders/nShape在UI上合併成「底部出現」，這裡比照合併 */
function displayCategory(c: string): string {
  return c === "headShoulders" || c === "nShape" ? "bottomPattern" : c;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

/** 固定種子的亂數，讓每次跑出來的bootstrap結果一致 */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const fmt = (x: number | null) => (x === null || Number.isNaN(x) ? "   n/a" : `${x >= 0 ? "+" : ""}${x.toFixed(2)}%`.padStart(7));

interface Sample {
  month: string;
  /** 訊號超額報酬（扣同期加權指數） */
  excess: number;
  /** 再扣掉同一檔股票隨機日的超額報酬 */
  matched: number;
  /** 扣掉股票池全部股票同一天進場的平均報酬 */
  sameDay: number;
  ret: number;
}

function summarize(label: string, xs: Sample[]): string {
  if (xs.length === 0) return `  ${label.padEnd(14)} N=     0`;
  const win = (xs.filter((x) => x.ret > 0).length / xs.length) * 100;
  return `  ${label.padEnd(14)} N=${String(xs.length).padStart(6)} 報酬${fmt(mean(xs.map((x) => x.ret)))} 超額${fmt(mean(xs.map((x) => x.excess)))} 扣同股${fmt(mean(xs.map((x) => x.matched)))} 扣同日${fmt(mean(xs.map((x) => x.sameDay)))} 勝率${win.toFixed(0).padStart(3)}%`;
}

/** 依月份整月重抽，回傳「扣同日」平均值的5%/95%分位 */
function clusterBootstrap(xs: Sample[], rng: () => number): [number, number] {
  const byMonth = new Map<string, Sample[]>();
  for (const x of xs) {
    const list = byMonth.get(x.month) ?? [];
    list.push(x);
    byMonth.set(x.month, list);
  }
  const months = [...byMonth.values()];
  const means: number[] = [];
  for (let b = 0; b < BOOTSTRAP_ROUNDS; b++) {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < months.length; i++) {
      const m = months[Math.floor(rng() * months.length)];
      for (const x of m) sum += x.sameDay;
      n += m.length;
    }
    means.push(sum / n);
  }
  means.sort((a, b) => a - b);
  return [percentile(means, 0.05), percentile(means, 0.95)];
}

/** 隨機抽n筆（不放回），重複多次，回傳「扣同日」平均值的5%/95%分位 */
function subsampleSpread(xs: Sample[], n: number, rng: () => number): [number, number] | null {
  if (xs.length < n * 2) return null;
  const means: number[] = [];
  const pool = [...xs];
  for (let b = 0; b < BOOTSTRAP_ROUNDS; b++) {
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(rng() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    let sum = 0;
    for (let i = 0; i < n; i++) sum += pool[i].sameDay;
    means.push(sum / n);
  }
  means.sort((a, b) => a - b);
  return [percentile(means, 0.05), percentile(means, 0.95)];
}

async function main() {
  const taiex = await prisma.stock.findFirst({ where: { market: "TW", ticker: "TAIEX" }, select: { id: true } });
  if (!taiex) throw new Error("找不到TAIEX");

  // 訊號日當天加權指數是否在200日均線之上（多頭）
  const events = await prisma.$queryRawUnsafe<EventRow[]>(
    `
    WITH taiex AS (
      SELECT trade_date, close,
             AVG(close) OVER (ORDER BY trade_date ROWS BETWEEN 199 PRECEDING AND CURRENT ROW) AS ma200,
             ROW_NUMBER() OVER (ORDER BY trade_date) AS rn
      FROM tw_daily_price WHERE stock_id = $1
    )
    SELECT e.stock_id, e.category::text AS category, e.signal_date,
           e.return_20d::float AS r20, e.taiex_return_20d::float AS t20,
           e.return_60d::float AS r60, e.taiex_return_60d::float AS t60,
           CASE WHEN t.rn >= 200 THEN t.close > t.ma200 END AS bull
    FROM tw_signal_backtest_events e
    JOIN stocks s ON s.id = e.stock_id
    LEFT JOIN taiex t ON t.trade_date = e.signal_date
    WHERE s.industry IS DISTINCT FROM 'ETF'`,
    taiex.id
  );

  // 每檔股票「任意一天進場」的平均超額報酬（同樣是收盤對收盤、扣同期加權指數）
  const stockIds = [...new Set(events.map((e) => e.stock_id))];
  const baselines = await prisma.$queryRawUnsafe<BaselineRow[]>(
    `
    WITH t AS (
      SELECT trade_date, close,
             LEAD(close, 20) OVER (ORDER BY trade_date) AS c20,
             LEAD(close, 60) OVER (ORDER BY trade_date) AS c60
      FROM tw_daily_price WHERE stock_id = $1
    ),
    p AS (
      SELECT stock_id, trade_date, close,
             LEAD(close, 20) OVER (PARTITION BY stock_id ORDER BY trade_date) AS c20,
             LEAD(close, 60) OVER (PARTITION BY stock_id ORDER BY trade_date) AS c60
      FROM tw_daily_price WHERE stock_id = ANY($2::int[]) AND trade_date >= $3::date
    )
    SELECT p.stock_id,
           AVG((p.c20 / p.close - t.c20 / t.close) * 100)::float AS excess20,
           AVG((p.c60 / p.close - t.c60 / t.close) * 100)::float AS excess60
    FROM p JOIN t ON t.trade_date = p.trade_date
    WHERE p.close > 0 AND t.close > 0
    GROUP BY p.stock_id`,
    taiex.id,
    stockIds,
    BASELINE_START
  );
  const baselineByStock = new Map(baselines.map((b) => [b.stock_id, b]));

  // 股票池全部（非ETF、非TAIEX）股票同一天進場的平均報酬
  const dateBaselines = await prisma.$queryRawUnsafe<DateBaselineRow[]>(
    `
    WITH p AS (
      SELECT d.trade_date, d.close,
             LEAD(d.close, 20) OVER (PARTITION BY d.stock_id ORDER BY d.trade_date) AS c20,
             LEAD(d.close, 60) OVER (PARTITION BY d.stock_id ORDER BY d.trade_date) AS c60
      FROM tw_daily_price d JOIN stocks s ON s.id = d.stock_id
      WHERE s.market = 'TW' AND s.id <> $1 AND s.industry IS DISTINCT FROM 'ETF' AND d.trade_date >= $2::date
    )
    SELECT trade_date, AVG((c20 / close - 1) * 100)::float AS r20, AVG((c60 / close - 1) * 100)::float AS r60
    FROM p WHERE close > 0 GROUP BY trade_date`,
    taiex.id,
    BASELINE_START
  );
  const dateBaseline = new Map(dateBaselines.map((d) => [d.trade_date.toISOString().slice(0, 10), d]));

  // 最新一筆價格離全域最新日太久的股票＝可能已下市／停止更新，看看回測裡有沒有這類股票
  const [{ latest }] = await prisma.$queryRawUnsafe<{ latest: Date }[]>(`SELECT MAX(trade_date) AS latest FROM tw_daily_price`);
  const stale = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*)::int AS n FROM (SELECT stock_id, MAX(trade_date) AS d FROM tw_daily_price WHERE stock_id = ANY($1::int[]) GROUP BY stock_id) x WHERE x.d < $2::date - INTERVAL '30 days'`,
    stockIds,
    latest
  );

  const allBaseline20 = baselines.map((b) => b.excess20).filter((x): x is number => x !== null);
  const allBaseline60 = baselines.map((b) => b.excess60).filter((x): x is number => x !== null);
  console.log(`訊號事件 ${events.length} 筆、${stockIds.length} 檔股票（排除ETF），價格資料最新 ${latest.toISOString().slice(0, 10)}`);
  console.log(`股票池偏差：這批股票「任意一天進場」平均超額報酬 20日${fmt(mean(allBaseline20))}、60日${fmt(mean(allBaseline60))}（等權平均，>0代表股票池本身就跑贏大盤）`);
  console.log(`其中 ${stale[0].n} 檔最新價格比全域最新日早30天以上（疑似下市/停止更新）；已下市股票本來就不在股票池裡，這部分偏差無法從資料庫修正`);
  console.log(`「扣同股」＝訊號超額報酬 − 同一檔股票任意一天進場的超額報酬；「扣同日」＝訊號報酬 − 股票池全部股票同一天進場的平均報酬（最嚴格，信賴區間跟逐年都用這個）`);
  console.log(`賣出訊號（trustTurnSell/combinedSell）的「扣同日」應該要是負的才算有效\n`);

  const rng = makeRng(20261023);
  const categories = [...new Set(events.map((e) => displayCategory(e.category)))].sort();

  for (const h of HORIZONS) {
    console.log(`==================== ${h}日 ====================`);
    for (const category of categories) {
      const samples: (Sample & { bull: boolean | null; year: string })[] = [];
      for (const e of events) {
        if (displayCategory(e.category) !== category) continue;
        const ret = h === 20 ? e.r20 : e.r60;
        const tx = h === 20 ? e.t20 : e.t60;
        const base = baselineByStock.get(e.stock_id);
        const baseExcess = h === 20 ? base?.excess20 : base?.excess60;
        const iso = e.signal_date.toISOString();
        const day = dateBaseline.get(iso.slice(0, 10));
        const dayRet = h === 20 ? day?.r20 : day?.r60;
        if (ret === null || tx === null || baseExcess === null || baseExcess === undefined || dayRet === null || dayRet === undefined) continue;
        samples.push({ month: iso.slice(0, 7), year: iso.slice(0, 4), excess: ret - tx, matched: ret - tx - baseExcess, sameDay: ret - dayRet, ret, bull: e.bull });
      }
      if (samples.length === 0) continue;

      console.log(`\n【${category}】`);
      console.log(summarize("全部", samples));
      console.log(summarize("大盤多頭", samples.filter((s) => s.bull === true)));
      console.log(summarize("大盤空頭", samples.filter((s) => s.bull === false)));

      const years = [...new Set(samples.map((s) => s.year))].sort();
      const yearLine = years
        .map((y) => {
          const ys = samples.filter((s) => s.year === y);
          return `${y}:${fmt(mean(ys.map((s) => s.sameDay))).trim()}(${ys.length})`;
        })
        .join("  ");
      console.log(`  逐年扣同日      ${yearLine}`);

      const [lo, hi] = clusterBootstrap(samples, rng);
      const months = new Set(samples.map((s) => s.month)).size;
      console.log(`  扣同日90%信賴區間（依月份cluster bootstrap，${months}個月）：${fmt(lo)} ~ ${fmt(hi)}${lo > 0 ? "  → 穩定為正" : hi < 0 ? "  → 穩定為負" : "  → 跨過0，不顯著"}`);

      const spreads = SUBSAMPLE_SIZES.map((n) => {
        const s = subsampleSpread(samples, n, rng);
        return s ? `N=${n}: ${fmt(s[0]).trim()}~${fmt(s[1]).trim()}` : null;
      }).filter(Boolean);
      if (spreads.length > 0) console.log(`  隨機抽N筆時扣同日平均的90%範圍  ${spreads.join("  ")}`);
    }
    console.log("");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
