/**
 * 支撐/壓力參考價（2026-08-19新增，給選股清單+個股頁的「進出場參考」用）：用近60個交易日
 * （不含當天）收盤價的最低/最高點當支撐/壓力——不含當天是刻意的，這樣才能判斷「今天有沒有
 * 突破近期高低點」，如果把當天也算進窗口，今天創新高時壓力價會直接等於今天股價，變成
 * 恆真、沒有參考意義的定義。
 *
 * 這是最簡單、不需要額外資料源的區間操作參考法，跟均線/布林通道等其他技術指標互為佐證，
 * 不是精準的價位預測——如果股價正處於強勢創新高的趨勢，壓力價可能很貼近目前股價，這時候
 * 這個方法本身的參考意義會降低（見UI tooltip說明）。
 *
 * 建議進場點＝支撐價、建議停利點＝壓力價：最基本的「回檔找買點、漲到壓力附近停利」邏輯，
 * 不猜測突破後還會漲多少，只在已知的歷史區間內操作。
 */
const LOOKBACK_TRADING_DAYS = 60;

export interface SupportResistanceResult {
  support: number;
  resistance: number;
  /** aboveResistance=今天收盤價突破近60日高點，belowSupport=跌破近60日低點，
   * withinRange=還在區間內——前兩種狀態代表這個方法本身的參考意義降低，UI要標注 */
  priceStatus: "aboveResistance" | "belowSupport" | "withinRange";
}

/** closes依日期由舊到新排序，最後一筆是「今天」 */
export function calculateSupportResistance(closes: number[]): SupportResistanceResult | null {
  if (closes.length < 2) return null;

  const latest = closes[closes.length - 1];
  const priorCloses = closes.slice(0, -1).slice(-LOOKBACK_TRADING_DAYS);
  if (priorCloses.length === 0) return null;

  const support = Math.min(...priorCloses);
  const resistance = Math.max(...priorCloses);
  const priceStatus = latest > resistance ? "aboveResistance" : latest < support ? "belowSupport" : "withinRange";

  return { support, resistance, priceStatus };
}
