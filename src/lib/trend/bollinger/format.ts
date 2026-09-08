import type { BollingerDayResult } from "./types";

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function slopeLabel(direction: BollingerDayResult["ma20Slope"]): string {
  if (direction === "up") return "Rising";
  if (direction === "down") return "Falling";
  if (direction === "flat") return "Flat";
  return "N/A";
}

const SIGN_BY_SCORE: Record<BollingerDayResult["score"], string> = {
  "-2": "-2",
  "-1": "-1",
  "0": "0",
  "1": "+1",
  "2": "+2",
};

/** 依需求文件「八、輸出格式」把單日結果格式化成純文字報表 */
export function formatBollingerDayResult(result: BollingerDayResult): string {
  const lines = [result.date];

  if (!result.bands) {
    lines.push(`Close: ${result.close}`);
    lines.push("Bands: warming up (not enough history yet)");
    lines.push(`Trend: ${result.trendLabel}`);
    lines.push(`Signal: ${result.signalLabel}`);
    lines.push(`Score: ${SIGN_BY_SCORE[result.score]}`);
    lines.push("Reasons:");
    result.reasons.forEach((r) => lines.push(`* ${r}`));
    return lines.join("\n");
  }

  lines.push(`Close: ${result.close}`);
  lines.push(`MA20: ${result.bands.middle.toFixed(2)}`);
  lines.push(`Upper: ${result.bands.upper.toFixed(2)}`);
  lines.push(`Lower: ${result.bands.lower.toFixed(2)}`);
  lines.push(`Band Width: ${pct(result.bands.bandwidth)}`);
  lines.push(`MA20 Slope: ${slopeLabel(result.ma20Slope)}`);
  lines.push(`Trend: ${result.trendLabel}`);
  lines.push(`Signal: ${result.signalLabel}`);
  lines.push(`Score: ${SIGN_BY_SCORE[result.score]}`);
  lines.push("Reasons:");
  result.reasons.forEach((r) => lines.push(`* ${r}`));

  return lines.join("\n");
}

export function formatBollingerReport(results: BollingerDayResult[]): string {
  return results.map(formatBollingerDayResult).join("\n\n");
}
