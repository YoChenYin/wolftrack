import type { OhlcvBar } from "@/lib/trend/types";
import { sma } from "@/lib/trend/indicators";
import type { IndicatorScore, IndicatorScoreValue, LayerScore } from "../types";

function toStars(score: IndicatorScoreValue): 1 | 2 | 3 | 4 | 5 {
  return (score + 3) as 1 | 2 | 3 | 4 | 5;
}

/**
 * L3 台股環境評分。PRD 原始設計還包含漲跌家數比（廣度）與新台幣匯率，這兩項資料尚未整合
 * （見 docs/taifex-decision-os-prd.html 第15節），MVP 只用 TAIEX 現貨相對20日均線的位置與斜率。
 */
export function scoreL3TwMarket(taiexBars: OhlcvBar[]): LayerScore {
  const closes = taiexBars.map((b) => b.close);
  const ma20 = sma(closes, 20);
  const n = taiexBars.length;
  const last = n - 1;

  const indicators: IndicatorScore[] = [];
  const ma = ma20[last];
  const maPrev = ma20[last - 1] ?? null;
  if (ma !== null && maPrev !== null) {
    const close = closes[last];
    const above = close >= ma;
    const rising = ma >= maPrev;
    const score: IndicatorScoreValue = above && rising ? 2 : above ? 1 : !above && !rising ? -2 : -1;
    indicators.push({
      key: "taiexTrend",
      label: "TAIEX vs 20MA",
      score,
      stars: toStars(score),
      value: ma,
      detail: `加權指數${close.toFixed(0)} ${above ? "站上" : "跌破"}20MA(${ma.toFixed(0)})，均線${rising ? "上揚" : "下彎"}`,
    });
  }

  const score = indicators.length > 0 ? indicators.reduce((sum, s) => sum + s.score, 0) / indicators.length : null;
  return { layer: "L3", label: "台股環境", score, indicators };
}
