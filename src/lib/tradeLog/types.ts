export const SIGNAL_SOURCE_LABELS: Record<string, string> = {
  twTrendEntry: "台股趨勢／進場",
  twTrendBuyDip: "台股趨勢／逢低布局",
  twTrendReversal: "台股趨勢／反轉雷達",
  twTrendPullback: "台股趨勢／蓄勢待發",
  twTrendBullish: "台股趨勢／趨勢穩健",
  decisionOsFutures: "台指期 Decision OS",
  decisionLabGlobal: "總經 Decision Lab",
  expectationGap: "預期差研究判斷",
  manual: "自行判斷（無訊號依據）",
};

export const SIDE_LABELS: Record<string, string> = { long: "做多", short: "做空" };
export const STATUS_LABELS: Record<string, string> = { open: "持有中", closed: "已平倉", cancelled: "已取消" };
