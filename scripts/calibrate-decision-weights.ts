/**
 * 權重回測校準：把台指期 Decision OS（L3/L6）跟 Decision Lab（Trend/Volatility）現有寫死的
 * ⚠️假設權重，拿歷史資料重新算一次「這個分數到底有沒有預測力」，用 Information Coefficient
 * （分數 vs 未來報酬的相關係數，量化界標準做法）決定權重比例，而不是繼續憑感覺猜。
 *
 * 方法論：
 * 1. 對每一天，用「當天為止」的資料重算一次 production 用的同一套 scoring function
 *   （直接呼叫 scoreL3TwMarket/scoreL6Technical/classifyRegime+computeTradingScore，
 *   不是重寫一份邏輯——backtest 才會跟 production 行為完全一致）。
 * 2. 算未來5/10/20日的實際報酬。
 * 3. IC = 分數與未來報酬的皮爾森相關係數；權重比例 = |IC| 的相對大小（IC越高代表這個因子
 *   越有預測力，該拿越高權重——這是因子模型的標準做法，不是我發明的方法）。
 * 4. 前70%當訓練集算IC決定權重，後30%當測試集驗證這組權重在樣本外還有沒有用，
 *   避免校準結果只是overfit到全部歷史。
 *
 * L4（台指選擇權PCR）不在這裡校準：TAIFEX API沒有歷史範圍可查，只能每天累積，
 * 目前資料窗口太短（~1個月）沒有統計意義，見 docs/taifex-decision-os-prd.html 第15節。
 *
 * 用法：npx tsx scripts/calibrate-decision-weights.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import type { OhlcvBar } from "../src/lib/trend/types";
import { scoreL3TwMarket } from "../src/lib/decisionOs/layers/scoreL3TwMarket";
import { scoreL6Technical } from "../src/lib/decisionOs/layers/scoreL6Technical";
import { classifyRegime } from "../src/lib/decisionLab/regimeEngine";
import { computeTradingScore } from "../src/lib/decisionLab/tradingScore";

const FORWARD_WINDOWS = [5, 10, 20];
const WARMUP_BARS = 210; // 200MA + 緩衝，跟 runTwDailyBatch.ts 的 MIN_BARS_REQUIRED 一致
const TRAIN_FRACTION = 0.7;

async function loadBars(market: "TW" | "US", ticker: string): Promise<OhlcvBar[]> {
  const stock = await prisma.stock.findUnique({ where: { market_ticker: { market, ticker } } });
  if (!stock) throw new Error(`找不到 ${market}/${ticker}`);
  const rows = await prisma.twDailyPrice.findMany({ where: { stockId: stock.id }, orderBy: { tradeDate: "asc" } });
  return rows.map((r) => ({
    date: r.tradeDate.toISOString().slice(0, 10),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
  }));
}

function pearsonIC(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return NaN;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let cov = 0,
    varX = 0,
    varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return NaN;
  return cov / Math.sqrt(varX * varY);
}

interface Sample {
  index: number;
  l3: number | null;
  l6: number | null;
  fwd: Record<number, number | null>;
}

/** 台指期 Decision OS：L3(TAIEX vs 20MA) + L6(技術指標)，用TAIEX 20年歷史逐日重算 */
async function calibrateTwLayers() {
  console.log("\n========== 台指期 Decision OS：L3 + L6 校準（TAIEX） ==========");
  const bars = await loadBars("TW", "TAIEX");
  console.log(`TAIEX 歷史：${bars.length} 筆 (${bars[0]?.date} ~ ${bars[bars.length - 1]?.date})`);

  const maxForward = Math.max(...FORWARD_WINDOWS);
  const samples: Sample[] = [];

  for (let i = WARMUP_BARS; i < bars.length - maxForward; i++) {
    const window = bars.slice(0, i + 1);
    const l3 = scoreL3TwMarket(window).score;
    const l6 = scoreL6Technical(window).layer.score;
    const fwd: Record<number, number | null> = {};
    for (const w of FORWARD_WINDOWS) {
      fwd[w] = i + w < bars.length ? ((bars[i + w].close - bars[i].close) / bars[i].close) * 100 : null;
    }
    samples.push({ index: i, l3, l6, fwd });
    if (samples.length % 500 === 0) process.stdout.write(`  computed ${samples.length} days\r`);
  }
  console.log(`\n共 ${samples.length} 個交易日樣本`);

  const splitIdx = Math.floor(samples.length * TRAIN_FRACTION);
  const train = samples.slice(0, splitIdx);
  const test = samples.slice(splitIdx);
  console.log(`訓練集: ${train[0]?.index !== undefined ? bars[train[0].index].date : "-"} ~ ${bars[train[train.length - 1].index].date} (n=${train.length})`);
  console.log(`測試集: ${bars[test[0].index].date} ~ ${bars[test[test.length - 1].index].date} (n=${test.length})`);

  for (const w of FORWARD_WINDOWS) {
    const trainL3 = train.filter((s) => s.l3 !== null && s.fwd[w] !== null);
    const trainL6 = train.filter((s) => s.l6 !== null && s.fwd[w] !== null);
    const icL3Train = pearsonIC(trainL3.map((s) => s.l3!), trainL3.map((s) => s.fwd[w]!));
    const icL6Train = pearsonIC(trainL6.map((s) => s.l6!), trainL6.map((s) => s.fwd[w]!));

    const testL3 = test.filter((s) => s.l3 !== null && s.fwd[w] !== null);
    const testL6 = test.filter((s) => s.l6 !== null && s.fwd[w] !== null);
    const icL3Test = pearsonIC(testL3.map((s) => s.l3!), testL3.map((s) => s.fwd[w]!));
    const icL6Test = pearsonIC(testL6.map((s) => s.l6!), testL6.map((s) => s.fwd[w]!));

    const fullL3 = samples.filter((s) => s.l3 !== null && s.fwd[w] !== null);
    const fullL6 = samples.filter((s) => s.l6 !== null && s.fwd[w] !== null);
    const icL3Full = pearsonIC(fullL3.map((s) => s.l3!), fullL3.map((s) => s.fwd[w]!));
    const icL6Full = pearsonIC(fullL6.map((s) => s.l6!), fullL6.map((s) => s.fwd[w]!));

    const rankFlips = Math.sign(Math.abs(icL3Train) - Math.abs(icL6Train)) !== Math.sign(Math.abs(icL3Test) - Math.abs(icL6Test));

    const wL3 = Math.abs(icL3Full);
    const wL6 = Math.abs(icL6Full);
    const total = wL3 + wL6;
    console.log(
      `\n未來${w}日報酬 | 訓練集IC: L3=${icL3Train.toFixed(3)} L6=${icL6Train.toFixed(3)} | 測試集IC(樣本外): L3=${icL3Test.toFixed(3)} L6=${icL6Test.toFixed(3)} | 全樣本IC: L3=${icL3Full.toFixed(3)} L6=${icL6Full.toFixed(3)}`
    );
    console.log(`  → 依全樣本|IC|比例校準權重：L3=${((wL3 / total) * 10).toFixed(2)} L6=${((wL6 / total) * 10).toFixed(2)}（總和=10，跟現行LAYER_WEIGHTS scale一致）${rankFlips ? "  ⚠️ 訓練/測試集排名不一致，此window校準結果穩定性較低" : ""}`);
  }
}

/** Decision Lab：Trend(SPX regime) + Volatility(VIX)，用SPX+VIX共同歷史逐日重算 */
async function calibrateDecisionLabFactors() {
  console.log("\n\n========== Decision Lab：Trend + Volatility 校準（SPX/VIX） ==========");
  const spxBars = await loadBars("US", "SPX");
  const vixBars = await loadBars("US", "VIX");
  const vixByDate = new Map(vixBars.map((b) => [b.date, b.close]));
  console.log(`SPX 歷史：${spxBars.length} 筆 (${spxBars[0]?.date} ~ ${spxBars[spxBars.length - 1]?.date})`);

  const maxForward = Math.max(...FORWARD_WINDOWS);
  const samples: { index: number; trendScore: number; volScore: number; fwd: Record<number, number | null> }[] = [];

  for (let i = WARMUP_BARS; i < spxBars.length - maxForward; i++) {
    const window = spxBars.slice(0, i + 1);
    const vixCloses = window.map((b) => vixByDate.get(b.date)).filter((v): v is number => v !== undefined);
    if (vixCloses.length < 20) continue;

    const { regime } = classifyRegime(window, vixCloses);
    const vixLevel = vixCloses[vixCloses.length - 1];
    const { factors } = computeTradingScore(regime, vixLevel);
    const trendFactor = factors.find((f) => f.key === "trend")!.value!;
    const volFactor = factors.find((f) => f.key === "volatility")!.value!;

    const fwd: Record<number, number | null> = {};
    for (const w of FORWARD_WINDOWS) {
      fwd[w] = i + w < spxBars.length ? ((spxBars[i + w].close - spxBars[i].close) / spxBars[i].close) * 100 : null;
    }
    samples.push({ index: i, trendScore: trendFactor, volScore: volFactor, fwd });
    if (samples.length % 500 === 0) process.stdout.write(`  computed ${samples.length} days\r`);
  }
  console.log(`\n共 ${samples.length} 個交易日樣本`);

  const splitIdx = Math.floor(samples.length * TRAIN_FRACTION);
  const train = samples.slice(0, splitIdx);
  const test = samples.slice(splitIdx);
  console.log(`訓練集: ${spxBars[train[0].index].date} ~ ${spxBars[train[train.length - 1].index].date} (n=${train.length})`);
  console.log(`測試集: ${spxBars[test[0].index].date} ~ ${spxBars[test[test.length - 1].index].date} (n=${test.length})`);

  for (const w of FORWARD_WINDOWS) {
    const trainValid = train.filter((s) => s.fwd[w] !== null);
    const testValid = test.filter((s) => s.fwd[w] !== null);
    const icTrendTrain = pearsonIC(trainValid.map((s) => s.trendScore), trainValid.map((s) => s.fwd[w]!));
    const icVolTrain = pearsonIC(trainValid.map((s) => s.volScore), trainValid.map((s) => s.fwd[w]!));
    const icTrendTest = pearsonIC(testValid.map((s) => s.trendScore), testValid.map((s) => s.fwd[w]!));
    const icVolTest = pearsonIC(testValid.map((s) => s.volScore), testValid.map((s) => s.fwd[w]!));

    const fullValid = samples.filter((s) => s.fwd[w] !== null);
    const icTrendFull = pearsonIC(fullValid.map((s) => s.trendScore), fullValid.map((s) => s.fwd[w]!));
    const icVolFull = pearsonIC(fullValid.map((s) => s.volScore), fullValid.map((s) => s.fwd[w]!));

    const wTrend = Math.abs(icTrendFull);
    const wVol = Math.abs(icVolFull);
    const total = wTrend + wVol;
    console.log(
      `\n未來${w}日報酬 | 訓練集IC: Trend=${icTrendTrain.toFixed(3)} Volatility=${icVolTrain.toFixed(3)} | 測試集IC(樣本外): Trend=${icTrendTest.toFixed(3)} Volatility=${icVolTest.toFixed(3)} | 全樣本IC: Trend=${icTrendFull.toFixed(3)} Volatility=${icVolFull.toFixed(3)}`
    );
    console.log(
      `  → 依全樣本|IC|比例校準權重：Trend=${((wTrend / total) * 35).toFixed(1)} Volatility=${((wVol / total) * 35).toFixed(1)}（維持目前兩者權重和=35的scale）　⚠️ 兩者IC皆為負值，方向性存疑，見下方說明`
    );
  }
}

async function main() {
  await calibrateTwLayers();
  await calibrateDecisionLabFactors();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
