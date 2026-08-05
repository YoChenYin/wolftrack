import type { IndicatorScore, IndicatorScoreValue, LayerScore } from "../types";

function toStars(score: IndicatorScoreValue): 1 | 2 | 3 | 4 | 5 {
  return (score + 3) as 1 | 2 | 3 | 4 | 5;
}

/**
 * L4 法人籌碼評分。PRD 原始設計還包含「外資台指期未平倉」與「融資餘額變化」兩項，
 * 但這兩支資料源目前都還沒有排程每日累積歷史（見 docs/taifex-decision-os-prd.html 第15節），
 * MVP 只用已經上線的選擇權 PCR 未平倉量比——不假裝有資料去湊分數。
 */
export function scoreL4Flow(putCallOiRatioPct: number | null): LayerScore {
  const indicators: IndicatorScore[] = [];

  if (putCallOiRatioPct !== null) {
    let score: IndicatorScoreValue;
    let detail: string;
    if (putCallOiRatioPct >= 100 && putCallOiRatioPct <= 120) {
      score = 2;
      detail = `PCR未平倉量比${putCallOiRatioPct.toFixed(1)}%，避險需求適度偏高但未過熱`;
    } else if (putCallOiRatioPct >= 90) {
      score = 1;
      detail = `PCR未平倉量比${putCallOiRatioPct.toFixed(1)}%，溫和偏多`;
    } else if (putCallOiRatioPct > 70) {
      score = -1;
      detail = `PCR未平倉量比${putCallOiRatioPct.toFixed(1)}%，避險需求偏低`;
    } else {
      score = -2;
      detail = `PCR未平倉量比${putCallOiRatioPct.toFixed(1)}%，市場過度樂觀（反指標偏空）`;
    }
    indicators.push({ key: "pcr", label: "選擇權PCR(籌碼傾向)", score, stars: toStars(score), value: putCallOiRatioPct, detail });
  }

  const score = indicators.length > 0 ? indicators.reduce((sum, s) => sum + s.score, 0) / indicators.length : null;
  return { layer: "L4", label: "法人籌碼", score, indicators };
}
