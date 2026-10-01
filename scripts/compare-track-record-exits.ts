/**
 * 2026-10-01：選股績效驗證（/tw/track-record）出場規則比較——原本只有「反向訊號（投信轉賣/
 * 合賣）或持有滿20日」，反向訊號是單日翻轉、太容易被洗出場，也沒有停損/移動停利。這支把
 * 平台的進場訊號（投信轉買/合買/逢低布局/底部型態）回溯套用到歷史每一天（只用當天以前的資料），
 * 用trackRecordSim.ts（跟頁面同一份模擬邏輯）跑一組出場規則網格，比較每組的勝率/報酬分布。
 *
 * 防過度擬合：依進場日期把交易切成前後兩段，用前段（train）排名、只看後段（test）有沒有維持，
 * 不是直接挑全期數字最好看的那組。
 *
 * 用法：npx tsx scripts/compare-track-record-exits.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { computeChipFlowIndicators, classifyChipFlow } from "../src/lib/trend/tw/classifyChipFlow";
import { detectBottomPattern } from "../src/lib/trend/tw/detectBottomPattern";
import { isLimitMoveDay } from "../src/lib/trend/tw/limitMove";
import { simulateTrades, type SimBar, type SimDay } from "../src/lib/trend/tw/trackRecordSim";
import type { ExitRule } from "../src/lib/trend/tw/trackRecordMeta";
import type { InstitutionalDay } from "../src/lib/trend/tw/chipScore";
import type { OhlcvBar } from "../src/lib/trend/types";
import { sma } from "../src/lib/trend/indicators";

const WARMUP_DAYS = 210;
const BOTTOM_PATTERN_WINDOW = 130;
/** 交易成本：手續費0.1425%×2 + 證交稅0.3%，來回約0.585% */
const ROUND_TRIP_COST_PCT = 0.585;

interface TradeResult {
  entryDate: string;
  /** 同期加權指數報酬（進場開盤→出場成交日收盤，近似值），算超額報酬用 */
  taiexReturnPct: number | null;
  /** 進場當天加權指數在200日均線之下＝偏空環境，用來檢查規則在弱勢市場是否還成立 */
  bearRegime: boolean;
  entrySignal: string;
  exitSignal: string;
  returnPct: number;
  holdingDays: number;
}

async function loadBars(stockId: number): Promise<OhlcvBar[]> {
  const rows = await prisma.twDailyPrice.findMany({ where: { stockId }, orderBy: { tradeDate: "asc" } });
  return rows.map((r) => ({
    date: r.tradeDate.toISOString().slice(0, 10),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
  }));
}

async function loadInstitutional(stockId: number): Promise<InstitutionalDay[]> {
  const rows = await prisma.twInstitutionalTrading.findMany({ where: { stockId }, orderBy: { tradeDate: "asc" } });
  return rows.map((r) => ({
    date: r.tradeDate.toISOString().slice(0, 10),
    foreignNetBuyShares: Number(r.foreignNetBuyShares),
    investTrustNetBuyShares: Number(r.investTrustNetBuyShares),
    dealerNetBuyShares: Number(r.dealerNetBuyShares),
    totalVolumeShares: Number(r.totalVolumeShares),
  }));
}

/** 每天跑一次正式環境的分類邏輯，產生跟daily_trend_signals同樣形狀的訊號 */
function buildSignalDays(bars: OhlcvBar[], institutional: InstitutionalDay[]): Map<string, SimDay> {
  const indicators = computeChipFlowIndicators(bars);
  const days = new Map<string, SimDay>();
  for (let i = WARMUP_DAYS; i < bars.length; i++) {
    const isLimitMove = isLimitMoveDay(bars, i);
    const chip = classifyChipFlow(bars, indicators, i, institutional, isLimitMove);
    const bottom = detectBottomPattern(bars.slice(Math.max(0, i + 1 - BOTTOM_PATTERN_WINDOW), i + 1));
    days.set(bars[i].date, {
      status: isLimitMove ? "limitMove" : chip.status,
      triggerReason: chip.triggerReason,
      hasBottomPattern: bottom !== null,
      bottomPatternDescription: bottom?.description ?? null,
      bottomPatternTargetPrice: bottom?.targetPrice ?? null,
    });
  }
  return days;
}

function ruleLabel(r: ExitRule): string {
  const parts = [
    r.reverseSignal ? "反向訊號" : null,
    r.trustSellStreak !== null ? `投信連賣${r.trustSellStreak}` : null,
    r.stopLossPct !== null ? `停損${r.stopLossPct}%` : null,
    r.trailingMa !== null ? `跌破MA${r.trailingMa}(獲利${r.trailingActivatePct}%後)` : null,
    r.patternTakeProfit ? "型態目標價" : null,
    `最長${r.maxHoldingDays}日`,
  ].filter(Boolean);
  return parts.join("+");
}

function buildRuleGrid(): ExitRule[] {
  const rules: ExitRule[] = [];
  for (const maxHoldingDays of [20, 40, 60])
    for (const stopLossPct of [null, 6, 8, 10, 12, 15])
      for (const trailingMa of [null, 5, 10, 20])
        for (const reverse of ["none", "signal", "streak2", "streak3", "streak5"] as const)
          for (const patternTakeProfit of [false, true]) {
            rules.push({
              maxHoldingDays,
              reverseSignal: reverse === "signal",
              trustSellStreak: reverse.startsWith("streak") ? Number(reverse.slice(6)) : null,
              stopLossPct,
              trailingMa,
              trailingActivatePct: 5,
              patternTakeProfit,
            });
          }
  return rules;
}

interface Stats {
  n: number;
  excess: number;
  winRate: number;
  avg: number;
  median: number;
  profitFactor: number;
  avgHold: number;
  p10: number;
}

function stats(trades: TradeResult[]): Stats {
  const r = trades.map((t) => t.returnPct).sort((a, b) => a - b);
  const n = r.length;
  if (n === 0) return { n: 0, excess: NaN, winRate: NaN, avg: NaN, median: NaN, profitFactor: NaN, avgHold: NaN, p10: NaN };
  const gains = r.filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const losses = -r.filter((v) => v < 0).reduce((a, b) => a + b, 0);
  const ex = trades.filter((t) => t.taiexReturnPct !== null).map((t) => t.returnPct - (t.taiexReturnPct as number));
  return {
    n,
    excess: ex.length ? ex.reduce((a, b) => a + b, 0) / ex.length : NaN,
    winRate: (r.filter((v) => v > 0).length / n) * 100,
    avg: r.reduce((a, b) => a + b, 0) / n,
    median: r[Math.floor(n / 2)],
    profitFactor: losses === 0 ? Infinity : gains / losses,
    avgHold: trades.reduce((a, t) => a + t.holdingDays, 0) / n,
    p10: r[Math.floor(n * 0.1)],
  };
}

function fmt(s: Stats): string {
  return `N=${String(s.n).padStart(5)} 勝率${s.winRate.toFixed(1).padStart(5)}% 平均${s.avg.toFixed(2).padStart(6)}% 中位數${s.median.toFixed(2).padStart(6)}% 超額${s.excess.toFixed(2).padStart(6)}% PF${s.profitFactor.toFixed(2).padStart(5)} 最差10%${s.p10.toFixed(1).padStart(6)}% 持有${s.avgHold.toFixed(1).padStart(5)}日`;
}

async function main() {
  const stocks = await prisma.stock.findMany({
    where: { market: "TW", isActive: true, ticker: { not: "TAIEX" }, NOT: { industry: { contains: "ETF" } } },
    select: { id: true, ticker: true },
  });

  const taiexStock = await prisma.stock.findUnique({ where: { market_ticker: { market: "TW", ticker: "TAIEX" } } });
  const taiexBars = taiexStock ? await loadBars(taiexStock.id) : [];
  const taiexMa200 = sma(taiexBars.map((b) => b.close), 200);
  const taiexByDate = new Map(taiexBars.map((b, i) => [b.date, { bar: b, ma200: taiexMa200[i] }]));

  const rules = buildRuleGrid();
  const results: TradeResult[][] = rules.map(() => []);
  let processed = 0;

  for (const stock of stocks) {
    const bars = await loadBars(stock.id);
    if (bars.length < WARMUP_DAYS + 40) continue;
    const institutional = await loadInstitutional(stock.id);
    if (institutional.length === 0) continue;

    const days = buildSignalDays(bars, institutional);
    const trustNet = new Map(institutional.map((d) => [d.date, d.investTrustNetBuyShares]));
    const simBars: SimBar[] = bars;

    rules.forEach((rule, ri) => {
      for (const t of simulateTrades(simBars, days, trustNet, rule, WARMUP_DAYS)) {
        if (t.exitIndex === null || t.entryIndex === null || t.entryPrice === null || t.exitPrice === null) continue;
        const entryDate = bars[t.entryIndex].date;
        const tIn = taiexByDate.get(entryDate);
        const tOut = taiexByDate.get(bars[t.exitIndex].date);
        results[ri].push({
          entryDate,
          taiexReturnPct: tIn && tOut ? ((tOut.bar.close - tIn.bar.open) / tIn.bar.open) * 100 : null,
          bearRegime: tIn?.ma200 != null && tIn.bar.close < tIn.ma200,
          entrySignal: t.entrySignal,
          exitSignal: t.exitSignal!,
          returnPct: ((t.exitPrice - t.entryPrice) / t.entryPrice) * 100 - ROUND_TRIP_COST_PCT,
          holdingDays: t.exitIndex - t.entryIndex + (t.exitField === "open" ? 0 : 1),
        });
      }
    });
    processed++;
    if (processed % 50 === 0) console.error(`...${processed} 檔`);
  }

  // 依進場日期切前後兩段：用基準規則（現行）全部交易的中位數日期當分界
  const baselineIndex = rules.findIndex(
    (r) => r.maxHoldingDays === 20 && r.reverseSignal && r.stopLossPct === null && r.trailingMa === null && !r.patternTakeProfit
  );
  const dates = results[baselineIndex].map((t) => t.entryDate).sort();
  const splitDate = dates[Math.floor(dates.length / 2)];

  console.log(`處理 ${processed} 檔股票，報酬已扣來回交易成本${ROUND_TRIP_COST_PCT}%，train/test分界：${splitDate}\n`);
  console.log("【現行規則】", ruleLabel(rules[baselineIndex]));
  console.log("  全期 ", fmt(stats(results[baselineIndex])));
  console.log("  train", fmt(stats(results[baselineIndex].filter((t) => t.entryDate < splitDate))));
  console.log("  test ", fmt(stats(results[baselineIndex].filter((t) => t.entryDate >= splitDate))));

  // 用train段的「平均報酬」排名，但要求PF>1且樣本夠，避免挑到少數暴賺交易撐起來的組合
  const ranked = rules
    .map((rule, i) => ({
      rule,
      train: stats(results[i].filter((t) => t.entryDate < splitDate)),
      test: stats(results[i].filter((t) => t.entryDate >= splitDate)),
      all: stats(results[i]),
      exits: results[i],
    }))
    .filter((x) => x.train.n >= 200)
    .sort((a, b) => b.train.avg - a.train.avg);

  console.log(`\n【train平均報酬前15名，共${ranked.length}組】`);
  for (const x of ranked.slice(0, 15)) {
    console.log(`\n${ruleLabel(x.rule)}`);
    console.log("  train", fmt(x.train));
    console.log("  test ", fmt(x.test));
  }

  const best = ranked[0];
  console.log(`\n【train第1名：${ruleLabel(best.rule)}】出場原因分布（全期）`);
  const byExit = new Map<string, TradeResult[]>();
  for (const t of best.exits) byExit.set(t.exitSignal, [...(byExit.get(t.exitSignal) ?? []), t]);
  for (const [k, v] of byExit) console.log(`  ${k.padEnd(16)} ${fmt(stats(v))}`);
  console.log(`\n【train第1名】依進場訊號（全期）`);
  const byEntry = new Map<string, TradeResult[]>();
  for (const t of best.exits) byEntry.set(t.entrySignal, [...(byEntry.get(t.entrySignal) ?? []), t]);
  for (const [k, v] of byEntry) console.log(`  ${k.padEnd(16)} ${fmt(stats(v))}`);

  // 偏空環境（進場時加權指數在200日線下）的表現：多頭樣本為主的資料裡，這是唯一能看出
  // 規則在弱勢市場會不會出事的切片
  const show = (label: string, patch: Partial<ExitRule>) => {
    const target = { ...rules[baselineIndex], ...patch };
    const i = rules.findIndex((r) => JSON.stringify(r) === JSON.stringify(target));
    const all = results[i];
    console.log(`\n${label}：${ruleLabel(rules[i])}`);
    console.log("  全期 ", fmt(stats(all)));
    console.log("  train", fmt(stats(all.filter((t) => t.entryDate < splitDate))));
    console.log("  test ", fmt(stats(all.filter((t) => t.entryDate >= splitDate))));
    console.log("  偏空 ", fmt(stats(all.filter((t) => t.bearRegime))));
  };
  console.log("\n【候選規則：全期/train/test/偏空環境】");
  show("現行", {});
  show("A", { reverseSignal: false, trailingMa: 10, patternTakeProfit: true, maxHoldingDays: 60 });
  show("A+寬停損12%", { reverseSignal: false, trailingMa: 10, patternTakeProfit: true, maxHoldingDays: 60, stopLossPct: 12 });
  show("A+寬停損15%", { reverseSignal: false, trailingMa: 10, patternTakeProfit: true, maxHoldingDays: 60, stopLossPct: 15 });
  show("A+投信連賣5", { reverseSignal: false, trustSellStreak: 5, trailingMa: 10, patternTakeProfit: true, maxHoldingDays: 60 });
  show("A 最長40日", { reverseSignal: false, trailingMa: 10, patternTakeProfit: true, maxHoldingDays: 40 });
  show("A 最長40日+停損12%", { reverseSignal: false, trailingMa: 10, patternTakeProfit: true, maxHoldingDays: 40, stopLossPct: 12 });
  show("MA20版", { reverseSignal: false, trailingMa: 20, patternTakeProfit: true, maxHoldingDays: 60 });
  show("投信連賣3+MA10", { reverseSignal: false, trustSellStreak: 3, trailingMa: 10, patternTakeProfit: true, maxHoldingDays: 60 });

  // 單一因子的邊際效果：只改一個條件，其他維持現行規則
  console.log("\n【單一條件加到現行規則上的效果（全期）】");
  const tweak = (patch: Partial<ExitRule>) => {
    const target = { ...rules[baselineIndex], ...patch };
    const i = rules.findIndex((r) => JSON.stringify(r) === JSON.stringify(target));
    console.log(`  ${ruleLabel(rules[i]).padEnd(40)} ${fmt(stats(results[i]))}`);
  };
  tweak({});
  tweak({ stopLossPct: 8 });
  tweak({ trailingMa: 10 });
  tweak({ reverseSignal: false, trustSellStreak: 3 });
  tweak({ patternTakeProfit: true });
  tweak({ maxHoldingDays: 40 });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
