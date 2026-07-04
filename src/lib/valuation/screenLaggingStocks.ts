/** ⚠️假設：估值後段班門檻，spec 4.2 用 <=30%。TODO: 待業務端確認是否需回測校準。 */
const DEFAULT_PERCENTILE_THRESHOLD = 30;

export interface LaggingStockCandidate {
  ticker: string;
  pePercentile: number | null;
  pbPercentile: number | null;
  /** 該股近20日報酬率(%) */
  return20d: number;
}

export interface ScreenLaggingStocksParams {
  groupName: string;
  members: LaggingStockCandidate[];
  /** 族群平均近20日漲幅(%) */
  groupAvgReturn20d: number;
  /** 大盤平均近20日漲幅(%) */
  marketAvgReturn20d: number;
  percentileThreshold?: number;
}

export interface LaggingStockResult {
  ticker: string;
  groupName: string;
  pePercentileInGroup: number | null;
  pbPercentileInGroup: number | null;
  groupAvgReturn20d: number;
  stockReturn20d: number;
  /** groupAvgReturn20d - stockReturn20d，數字越大代表補漲空間理論上越大 */
  returnGapPct: number;
  /** 同族群其他成員（不含自己），方便使用者直接比較 */
  peerList: string[];
}

/**
 * 供應鏈落後股篩選（docs/wolftrack-tw-spec.md 4.2）：
 * IF (估值百分位 <= threshold，族群內後段班)
 *    AND (族群平均近20日漲幅 > 大盤平均漲幅，代表這條供應鏈題材正熱)
 *    AND (該股自己近20日漲幅 < 族群平均漲幅，代表還沒補漲)
 * THEN 標記為「供應鏈落後股」
 *
 * 純函式，不接資料源：PE/PB、20日報酬率、大盤報酬率都由呼叫端提供。
 */
export function screenLaggingStocks(params: ScreenLaggingStocksParams): LaggingStockResult[] {
  const { groupName, members, groupAvgReturn20d, marketAvgReturn20d, percentileThreshold = DEFAULT_PERCENTILE_THRESHOLD } =
    params;

  // 族群平均漲幅要贏大盤，這是「整條供應鏈題材正熱」的族群層級前提，不成立就整組沒有落後股可言
  if (groupAvgReturn20d <= marketAvgReturn20d) return [];

  return members
    .filter((m) => {
      // ⚠️假設：PE 優先，沒有 PE 資料才退而求其次看 PB（spec 沒有明確定義兩者衝突時怎麼選）
      const percentile = m.pePercentile ?? m.pbPercentile;
      if (percentile === null) return false;
      return percentile <= percentileThreshold && m.return20d < groupAvgReturn20d;
    })
    .map((m) => ({
      ticker: m.ticker,
      groupName,
      pePercentileInGroup: m.pePercentile,
      pbPercentileInGroup: m.pbPercentile,
      groupAvgReturn20d,
      stockReturn20d: m.return20d,
      returnGapPct: Math.round((groupAvgReturn20d - m.return20d) * 100) / 100,
      peerList: members.filter((peer) => peer.ticker !== m.ticker).map((peer) => peer.ticker),
    }));
}
