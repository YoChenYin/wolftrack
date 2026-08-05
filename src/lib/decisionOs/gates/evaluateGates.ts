import type { OhlcvBar } from "@/lib/trend/types";

export interface GateResult {
  gateNumber: number;
  gateName: string;
  action: string;
  detail: string;
}

/**
 * Gate 引擎，PRD 第7節共35項。這支函式實作純市場日K就能算的項目：#13,#15,#20,#21,#22,#23,#24。
 * #12(ATR過高)、#25(布林帶寬過窄) 用 scoreL6Technical() 已經算好的 regime 資訊判斷，
 * 在 runDecisionOsDaily.ts 組裝，不在這裡重複算一次 ATR/布林通道。
 *
 * 其餘沒實作的原因都寫在這裡，不是漏掉：
 * - #1-#8（事件行事曆）：需要 MacroEvent 資料表有內容，目前是空的，schema已建但沒有資料維護流程。
 * - #9,#10,#11,#14（VIX/隔夜美股）：L1全球市場資料源還缺（見PRD第15節）。
 * - #16-#19（部分流動性）：需要委買委賣價差等逐筆資料，本專案只有日K，沒有這個顆粒度。
 * - #26,#27（停損/風報比）：由 riskEngine.ts 在計算部位時一併檢查，不在這裡重複。
 * - #28-#32（帳戶風控狀態）：需要交易紀錄/持倉狀態表，本專案還沒有交易紀錄功能。
 * - #33-#35（跨市場一致性）：需要NASDAQ/SOX/美元指數，同樣卡在L1資料源缺口。
 */
export function evaluateGates(bars: OhlcvBar[]): GateResult[] {
  const n = bars.length;
  if (n < 25) return [];
  const last = n - 1;
  const today = bars[last];
  const prev = bars[last - 1];
  const results: GateResult[] = [];

  // #13 開盤跳空 > 1.5%
  const gapPct = ((today.open - prev.close) / prev.close) * 100;
  if (Math.abs(gapPct) > 1.5) {
    results.push({
      gateNumber: 13,
      gateName: "恐慌性跳空",
      action: "禁止追價",
      detail: `開盤跳空${gapPct >= 0 ? "+" : ""}${gapPct.toFixed(2)}%，建議等回測後再進場`,
    });
  }

  // #15 成交量 < 20日均量 70%
  const last20Volumes = bars.slice(last - 19, last + 1).map((b) => b.volume);
  const avgVolume20 = last20Volumes.reduce((a, b) => a + b, 0) / last20Volumes.length;
  if (avgVolume20 > 0) {
    const volRatio = (today.volume / avgVolume20) * 100;
    if (volRatio < 70) {
      results.push({
        gateNumber: 15,
        gateName: "量縮",
        action: "禁止追價",
        detail: `成交量為20日均量的${volRatio.toFixed(0)}%，量能不足`,
      });
    }
  }

  // #20 / #21 距離前高／前低 < 1%（前高前低取近60個交易日，不含今天）
  const lookback = bars.slice(Math.max(0, last - 60), last);
  if (lookback.length > 0) {
    const priorHigh = Math.max(...lookback.map((b) => b.high));
    const priorLow = Math.min(...lookback.map((b) => b.low));
    const distToHighPct = ((priorHigh - today.close) / today.close) * 100;
    const distToLowPct = ((today.close - priorLow) / today.close) * 100;
    if (distToHighPct >= 0 && distToHighPct < 1) {
      results.push({
        gateNumber: 20,
        gateName: "接近前高",
        action: "禁止追多",
        detail: `距60日高點${priorHigh.toFixed(0)}僅${distToHighPct.toFixed(2)}%`,
      });
    }
    if (distToLowPct >= 0 && distToLowPct < 1) {
      results.push({
        gateNumber: 21,
        gateName: "接近前低",
        action: "禁止追空",
        detail: `距60日低點${priorLow.toFixed(0)}僅${distToLowPct.toFixed(2)}%`,
      });
    }
  }

  // #22 / #23 連續上漲/下跌 >= 5 日
  let consecutiveUp = 0;
  let consecutiveDown = 0;
  for (let i = last; i > 0 && i > last - 10; i--) {
    const change = bars[i].close - bars[i - 1].close;
    if (change > 0) {
      if (consecutiveDown > 0) break;
      consecutiveUp++;
    } else if (change < 0) {
      if (consecutiveUp > 0) break;
      consecutiveDown++;
    } else break;
  }
  if (consecutiveUp >= 5) {
    results.push({
      gateNumber: 22,
      gateName: "連續上漲過久",
      action: "禁止追多，需等拉回",
      detail: `已連續上漲${consecutiveUp}個交易日`,
    });
  }
  if (consecutiveDown >= 5) {
    results.push({
      gateNumber: 23,
      gateName: "連續下跌過久",
      action: "禁止追空，需等反彈",
      detail: `已連續下跌${consecutiveDown}個交易日`,
    });
  }

  // #24 價格處於重大整數關卡 ±0.3%（每1000點一個關卡）
  const nearestRound = Math.round(today.close / 1000) * 1000;
  const distToRoundPct = (Math.abs(today.close - nearestRound) / today.close) * 100;
  if (distToRoundPct < 0.3) {
    results.push({
      gateNumber: 24,
      gateName: "接近整數關卡",
      action: "等突破確認，暫緩進場",
      detail: `貼近${nearestRound}點整數關卡（${distToRoundPct.toFixed(2)}%）`,
    });
  }

  return results;
}
