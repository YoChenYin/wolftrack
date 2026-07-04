import type { OhlcvBar } from "@/lib/trend/types";

/**
 * 一次除權/除息事件。adjustmentFactor 是「除權息基準日之前」的股價要乘上的調整係數，
 * 讓還原後的歷史價格序列跟現在的股價尺度一致，避免除權息當天出現假跳空
 * （被誤判成均線跌破 / 假反轉訊號，見 docs/wolftrack-tw-spec.md 第二章第1點）。
 *
 * 現金股利：adjustmentFactor = (除權息前一日收盤價 - 每股股利) / 除權息前一日收盤價
 * 股票分割/減資：adjustmentFactor = 1 / 分割或縮股比例
 */
export interface CorporateAction {
  /** 除權/除息基準日 (YYYY-MM-DD) */
  exDate: string;
  adjustmentFactor: number;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * 還原股價（前復權：保留最新價格不變，往回調整歷史價格）。
 * 所有均線/RSI/ADX/漲跌幅計算前都要先跑這個，否則除權息當天會被誤判為「反轉雷達」。
 *
 * ⚠️假設：採用前復權，非後復權。
 * TODO: 待資料團隊確認（docs/wolftrack-tw-spec.md 待確認清單第5項）。
 */
export function adjustPrice(bars: OhlcvBar[], actions: CorporateAction[]): OhlcvBar[] {
  if (actions.length === 0) return bars;

  return bars.map((bar) => {
    let factor = 1;
    for (const action of actions) {
      if (bar.date < action.exDate) {
        factor *= action.adjustmentFactor;
      }
    }
    if (factor === 1) return bar;
    return {
      ...bar,
      open: round4(bar.open * factor),
      high: round4(bar.high * factor),
      low: round4(bar.low * factor),
      close: round4(bar.close * factor),
      // volume 不調整；股票分割理論上會影響張數，MVP 階段先不處理
      // TODO: 待接上真實除權息資料時，確認分割事件是否需要一併還原成交量
    };
  });
}
