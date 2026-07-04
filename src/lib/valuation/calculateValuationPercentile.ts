export interface GroupMemberValuation {
  ticker: string;
  pe: number | null;
  pb: number | null;
}

export interface ValuationPercentileResult {
  ticker: string;
  /** 0-100，越低代表在族群裡越便宜；null 表示該股沒有 PE 資料無法排名 */
  pePercentile: number | null;
  pbPercentile: number | null;
}

/**
 * 把一組數值換算成組內百分位（0=最低/最便宜，100=最高/最貴），並列（tie）用平均名次處理。
 * 只有 0 或 1 檔有效資料時無法算「相對」百分位，回傳 50（中性，不代表任何排名意義）。
 */
function percentileRank(values: (number | null)[]): (number | null)[] {
  const valid = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v !== null);

  if (valid.length <= 1) {
    return values.map((v) => (v === null ? null : 50));
  }

  const sorted = [...valid].sort((a, b) => a.v - b.v);
  const rankByIndex = new Map<number, number>();

  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].v === sorted[i].v) j++;
    const avgRank = (i + j) / 2; // 0-based 平均名次（並列用平均，避免任意排序偏差）
    for (let k = i; k <= j; k++) rankByIndex.set(sorted[k].i, avgRank);
    i = j + 1;
  }

  const n = sorted.length;
  return values.map((v, idx) => {
    if (v === null) return null;
    const rank = rankByIndex.get(idx)!;
    return Math.round((rank / (n - 1)) * 10000) / 100;
  });
}

/**
 * 輸入某族群所有成員的 PE/PB，算出每檔股票在族群內的估值百分位。
 * docs/wolftrack-tw-spec.md 第四章：百分位越低 = 相對族群其他成員越便宜。
 */
export function calculateValuationPercentile(members: GroupMemberValuation[]): ValuationPercentileResult[] {
  const pePercentiles = percentileRank(members.map((m) => m.pe));
  const pbPercentiles = percentileRank(members.map((m) => m.pb));

  return members.map((m, i) => ({
    ticker: m.ticker,
    pePercentile: pePercentiles[i],
    pbPercentile: pbPercentiles[i],
  }));
}
