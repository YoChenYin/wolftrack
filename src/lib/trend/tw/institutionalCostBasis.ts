/**
 * 外資/投信成本價（2026-08-19新增）：回推法人近60個交易日持續買超部位的加權平均成本，
 * 業界（XQ/Goodinfo等）常見的「法人成本」演算法——逐日累加淨買超(股數×收盤價)，遇到
 * 淨賣超時，假設是依「目前已經算出來的加權平均成本」賣出（標準的加權平均法存貨/部位
 * 計價邏輯，不是假設用當天市價賣出），依比例減少累計部位；賣超超過目前部位或還沒有任何
 * 部位時，這個簡化模型不會讓部位變負（賣的是這個時間窗口之外、更早以前累積的部位，不在
 * 追蹤範圍內，直接忽略那筆賣超對這個窗口的影響）。
 *
 * 跟支撐/壓力（supportResistance.ts）用同一個60個交易日窗口，方便使用者一起解讀「法人在
 * 這段區間的持續買超部位」跟「這段區間的價格區間」。
 */
const LOOKBACK_TRADING_DAYS = 60;

export interface InstitutionalCostBasisDay {
  closePrice: number;
  netBuyShares: number;
}

export interface CostBasisResult {
  /** 加權平均成本，null=這個窗口內法人淨部位從未轉正（一直在賣超或沒有買超) */
  costBasis: number | null;
  /** 窗口結束時的累計淨部位（張），僅供除錯/理解用，不一定要顯示在UI上 */
  netPositionShares: number;
}

export function calculateInstitutionalCostBasis(days: InstitutionalCostBasisDay[]): CostBasisResult {
  const window = days.slice(-LOOKBACK_TRADING_DAYS);

  let cumulativeShares = 0;
  let cumulativeCost = 0;

  for (const day of window) {
    if (day.netBuyShares > 0) {
      cumulativeCost += day.netBuyShares * day.closePrice;
      cumulativeShares += day.netBuyShares;
    } else if (day.netBuyShares < 0 && cumulativeShares > 0) {
      const avgCost = cumulativeCost / cumulativeShares;
      const sellShares = Math.min(-day.netBuyShares, cumulativeShares);
      cumulativeCost -= avgCost * sellShares;
      cumulativeShares -= sellShares;
    }
  }

  return {
    costBasis: cumulativeShares > 0 ? Math.round((cumulativeCost / cumulativeShares) * 100) / 100 : null,
    netPositionShares: Math.round(cumulativeShares),
  };
}
