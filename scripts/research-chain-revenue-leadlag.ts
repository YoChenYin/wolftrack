/**
 * 2026-10-14：產業鏈營收傳導研究——每條鏈的每兩層之間，A層營收動能轉變之後，B層是不是在
 * 1~6個月後跟著轉變（見chainRevenueFlow.ts的leadLagCorrelation）。要在train/test兩段都成立、
 * 而且領先效果比「同一個月一起動」更強，才算真的有傳導，才會在產業鏈頁面上講「X層領先Y層」。
 *
 * 判斷標準（印在輸出最後）：lag≥1、train跟test的相關係數都≥MIN_CORR、而且都高於lag=0的同期相關。
 *
 * 用法：npx tsx scripts/research-chain-revenue-leadlag.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { leadLagCorrelation, loadChainStageSeries } from "../src/lib/valuation/chainRevenueFlow";

const MAX_LAG = 6;
const MIN_CORR = 0.3;

async function main() {
  const series = await loadChainStageSeries(null);
  for (const s of series) {
    const first = s.months[0];
    const last = s.months.at(-1);
    console.log(
      `${s.chainName} ${s.stageKey}（${s.label}）：成分股${s.memberTickers.length}檔，有效月份${s.months.length}（${first?.month ?? "-"}~${last?.month ?? "-"}），最新近3月年增${last?.yoy3Pct ?? "-"}%（${last?.memberCount ?? 0}檔）`
    );
  }

  const allMonths = [...new Set(series.flatMap((s) => s.months.map((m) => m.month)))].sort();
  const split = allMonths[Math.floor(allMonths.length / 2)];
  console.log(`\ntrain/test 分界：${split}\n`);

  const robust: string[] = [];
  const chains = [...new Set(series.map((s) => s.chainName))];
  for (const chain of chains) {
    const stages = series.filter((s) => s.chainName === chain);
    console.log(`==== ${chain} ====`);
    for (const a of stages) {
      for (const b of stages) {
        if (a === b) continue;
        const same = leadLagCorrelation(a.months, b.months, 0);
        let best: { lag: number; train: number; test: number; all: number } | null = null;
        for (let lag = 1; lag <= MAX_LAG; lag++) {
          const all = leadLagCorrelation(a.months, b.months, lag);
          const train = leadLagCorrelation(a.months, b.months, lag, (m) => m < split);
          const test = leadLagCorrelation(a.months, b.months, lag, (m) => m >= split);
          if (!all || !train || !test) continue;
          if (!best || all.corr > best.all) best = { lag, train: train.corr, test: test.corr, all: all.corr };
        }
        if (!best) continue;
        const sameTrain = leadLagCorrelation(a.months, b.months, 0, (m) => m < split)?.corr ?? 0;
        const sameTest = leadLagCorrelation(a.months, b.months, 0, (m) => m >= split)?.corr ?? 0;
        const isRobust = best.train >= MIN_CORR && best.test >= MIN_CORR && best.train > sameTrain && best.test > sameTest;
        console.log(
          `  ${a.stageKey.padEnd(10)}→ ${b.stageKey.padEnd(10)} 最佳領先${best.lag}月 相關${best.all.toFixed(2)}（train ${best.train.toFixed(2)} / test ${best.test.toFixed(2)}），同月相關${same?.corr.toFixed(2) ?? "-"}${isRobust ? "  ✔ 穩定領先" : ""}`
        );
        if (isRobust) robust.push(`${chain}：${a.label} 領先 ${b.label} 約${best.lag}個月（train ${best.train.toFixed(2)} / test ${best.test.toFixed(2)}）`);
      }
    }
  }

  console.log(`\n==== 穩定的領先關係（lag≥1、train/test相關都≥${MIN_CORR}且高於同月相關）====`);
  if (robust.length === 0) console.log("（沒有）");
  for (const r of robust) console.log(r);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
