import type { OhlcvBar } from "@/lib/trend/types";
import { sma } from "@/lib/trend/indicators";
import { calculateChipConcentration } from "./chipConcentration";
import type { InstitutionalDay } from "./chipScore";

/**
 * 2026-08-17：多空分開的三大法人籌碼流策略，取代 2026-07-23 版的技術面+籌碼面混合
 * entry/exit/buyDip（原本的isEntry/isExit已經拿掉，historical資料的entry/exit狀態
 * 還留在TrendStatus enum裡只是給舊資料顯示用，不會再有新資料寫入這兩個值）。
 *
 * 多方（3類，優先序：投信轉買 > 投信外資合買 > 逢低布局）：
 * - 投信轉買：投信由賣轉買的翻轉日（今日淨買超>0、昨日<=0）
 * - 投信外資合買：外資+投信「今天同時」淨買超，連續天數當「第幾天」標註
 * - 逢低布局：沿用2026-07-23版backtest驗證過的參數（季線容忍帶1.5%、集中度門檻15%），
 *   是這整套策略裡目前唯一有backtest證據支持的訊號，見scripts/backtest-custom-strategy.ts
 *
 * 空方（2類，優先序：投信轉賣 > 投信外資合賣，沒有逢低布局的空方對應概念）：
 * - 投信轉賣：投信由買轉賣的翻轉日
 * - 投信外資合賣：外資+投信「今天同時」淨賣超，連續天數當「第幾天」標註
 *
 * 多空兩組條件在同一天結構上互斥（轉買要求投信今日>0、轉賣要求<0，合買要求雙方>0、
 * 合賣要求雙方<0），不會同一天同時符合多方跟空方條件，判斷順序只在同一側內有意義。
 *
 * 2026-08-18：轉買/轉賣/合買/合賣都加了資料新鮮度檢查（MAX_INSTITUTIONAL_DATA_GAP_DAYS），
 * 不是單純「跳過週末」——用陣列裡最近一筆當「今天/昨天」，如果那筆資料離目標交易日太遠
 * （例如中間缺了兩週的資料，不是只缺週末），不該被當成有效的翻轉/合買合賣比較基準，見
 * 該常數上方的詳細說明（萬潤/6187案例）。
 */

const BUY_DIP_BAND_PCT = 1.5;
const BUY_DIP_CONCENTRATION_THRESHOLD = 15;
/** 找「這個訊號連續成立幾天」的錨點時，最多往回找幾天（避免極端情況掃全部歷史） */
const MAX_STREAK_LOOKBACK_DAYS = 90;
/**
 * 2026-08-18：轉買/轉賣/合買/合賣都要求「今天」的三大法人資料離目標交易日夠近，不能拿
 * 陳舊資料當「今天」、也不能把「昨日」拿去比對一筆其實是好幾週前的舊資料——法人買賣超
 * 資料正常一個交易日發布一次，5天足以涵蓋週末(2天)+最多再抓寬一點的單一國定假日缺口，
 * 但抓不住像萬潤(6187)那種8/3~8/17中間缺了兩週資料的情況（這不是週末造成的缺口，是
 * 資料源本身有缺，見對話紀錄的診斷：804檔裡有188檔法人資料超過5天沒更新）——這種情況下
 * 硬要拿「陣列裡最近一筆」當「昨日/今日」比對，會產生假的翻轉訊號，也會讓這檔股票錯誤地
 * 卡在轉買/轉賣分類、輪不到後面的合買/合賣判斷（萬潤的案例：8/17真正符合的其實是合買，
 * 卻因為跟8/3的舊資料比較出「轉買」而被攔在前面）。單純的「跳過週末」做不到這件事——
 * 週末只是缺口眾多成因之一，真正該檢查的是「資料到底夠不夠新」，不是「今天是不是週一」。
 */
const MAX_INSTITUTIONAL_DATA_GAP_DAYS = 5;

function calendarDaysBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}

export interface ChipFlowIndicators {
  /** 逢低布局唯一需要的技術指標（股價貼近季線） */
  ma60: (number | null)[];
}

export function computeChipFlowIndicators(bars: OhlcvBar[]): ChipFlowIndicators {
  const closes = bars.map((b) => b.close);
  return { ma60: sma(closes, 60) };
}

function formatLots(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value).toLocaleString()}張`;
}

/** institutionalDaysUpToDate已經是「截止到目標日期(含)」的陣列，最後一筆理論上就是當天——
 * 但要求它離asOfDate不能太遠，避免拿陳舊資料當「今天」（見MAX_INSTITUTIONAL_DATA_GAP_DAYS說明） */
function today(institutionalDaysUpToDate: InstitutionalDay[], asOfDate: string): InstitutionalDay | null {
  const n = institutionalDaysUpToDate.length;
  if (n < 1) return null;
  const t = institutionalDaysUpToDate[n - 1];
  if (calendarDaysBetween(t.date, asOfDate) > MAX_INSTITUTIONAL_DATA_GAP_DAYS) return null;
  return t;
}

/** 「昨天」除了要存在，跟「今天」的間隔也不能太大，避免把跨了好幾週的舊資料當成翻轉比較基準 */
function todayAndYesterday(institutionalDaysUpToDate: InstitutionalDay[], asOfDate: string): [InstitutionalDay, InstitutionalDay] | null {
  const t = today(institutionalDaysUpToDate, asOfDate);
  const n = institutionalDaysUpToDate.length;
  if (!t || n < 2) return null;
  const y = institutionalDaysUpToDate[n - 2];
  if (calendarDaysBetween(t.date, y.date) > MAX_INSTITUTIONAL_DATA_GAP_DAYS) return null;
  return [t, y];
}

function isTrustTurnBuy(institutionalDaysUpToDate: InstitutionalDay[], asOfDate: string): boolean {
  const pair = todayAndYesterday(institutionalDaysUpToDate, asOfDate);
  if (!pair) return false;
  const [t, y] = pair;
  return t.investTrustNetBuyShares > 0 && y.investTrustNetBuyShares <= 0;
}

function isTrustTurnSell(institutionalDaysUpToDate: InstitutionalDay[], asOfDate: string): boolean {
  const pair = todayAndYesterday(institutionalDaysUpToDate, asOfDate);
  if (!pair) return false;
  const [t, y] = pair;
  return t.investTrustNetBuyShares < 0 && y.investTrustNetBuyShares >= 0;
}

function isCombinedBuy(institutionalDaysUpToDate: InstitutionalDay[], asOfDate: string): boolean {
  const t = today(institutionalDaysUpToDate, asOfDate);
  if (!t) return false;
  return t.foreignNetBuyShares > 0 && t.investTrustNetBuyShares > 0;
}

function isCombinedSell(institutionalDaysUpToDate: InstitutionalDay[], asOfDate: string): boolean {
  const t = today(institutionalDaysUpToDate, asOfDate);
  if (!t) return false;
  return t.foreignNetBuyShares < 0 && t.investTrustNetBuyShares < 0;
}

function isBuyDip(idx: number, bars: OhlcvBar[], ind: ChipFlowIndicators, institutionalDaysUpToDate: InstitutionalDay[]): boolean {
  const m60 = ind.ma60[idx];
  if (m60 === null) return false;
  const close = bars[idx].close;
  if (Math.abs((close - m60) / m60) * 100 > BUY_DIP_BAND_PCT) return false;
  return calculateChipConcentration(institutionalDaysUpToDate).concentration5 >= BUY_DIP_CONCENTRATION_THRESHOLD;
}

function describeTrustTurnBuyReason(institutionalDaysUpToDate: InstitutionalDay[], asOfDate: string): string {
  const pair = todayAndYesterday(institutionalDaysUpToDate, asOfDate);
  if (!pair) return "投信由賣轉買";
  const [t, y] = pair;
  return `投信由賣轉買：昨日${formatLots(y.investTrustNetBuyShares)}→今日${formatLots(t.investTrustNetBuyShares)}`;
}

function describeTrustTurnSellReason(institutionalDaysUpToDate: InstitutionalDay[], asOfDate: string): string {
  const pair = todayAndYesterday(institutionalDaysUpToDate, asOfDate);
  if (!pair) return "投信由買轉賣";
  const [t, y] = pair;
  return `投信由買轉賣：昨日${formatLots(y.investTrustNetBuyShares)}→今日${formatLots(t.investTrustNetBuyShares)}`;
}

function describeCombinedBuyReason(institutionalDaysUpToDate: InstitutionalDay[], asOfDate: string, streakDays: number): string {
  const t = today(institutionalDaysUpToDate, asOfDate);
  if (!t) return "投信外資同時買超";
  return `投信外資同時買超第${streakDays}天（外資${formatLots(t.foreignNetBuyShares)}、投信${formatLots(t.investTrustNetBuyShares)}）`;
}

function describeCombinedSellReason(institutionalDaysUpToDate: InstitutionalDay[], asOfDate: string, streakDays: number): string {
  const t = today(institutionalDaysUpToDate, asOfDate);
  if (!t) return "投信外資同時賣超";
  return `投信外資同時賣超第${streakDays}天（外資${formatLots(t.foreignNetBuyShares)}、投信${formatLots(t.investTrustNetBuyShares)}）`;
}

function describeBuyDipReason(idx: number, bars: OhlcvBar[], ind: ChipFlowIndicators, institutionalDaysUpToDate: InstitutionalDay[]): string {
  const m60 = ind.ma60[idx];
  const close = bars[idx].close;
  const distPct = m60 !== null ? ((close - m60) / m60) * 100 : null;
  const concentration5 = calculateChipConcentration(institutionalDaysUpToDate).concentration5;
  return `股價貼近季線MA60${distPct !== null ? `（距離${distPct >= 0 ? "+" : ""}${distPct.toFixed(1)}%）` : ""}；近5日籌碼集中度${concentration5.toFixed(1)}%（門檻${BUY_DIP_CONCENTRATION_THRESHOLD}%）`;
}

export interface ChipFlowClassificationResult {
  status: "trustTurnBuy" | "combinedBuy" | "buyDip" | "trustTurnSell" | "combinedSell" | "none";
  /** 這個狀態連續成立的第一天（不是MA交叉錨點，是條件streak的起點），配合priceAtSignal算「訊號後漲跌幅」 */
  signalPointDate: string | null;
  priceAtSignal: number | null;
  /** 用targetIndex(今天)當下的實際數值描述觸發原因，不是anchor day的——使用者想知道「今天為什麼還在這個分類」 */
  triggerReason: string | null;
}

/** 往回找同一個condition連續成立的最早一天，當作「訊號從哪天開始」的錨點，
 * 回傳值也用來算「合買/合賣第幾天」（targetIndex - anchorIdx + 1） */
function findStreakStart(
  targetIndex: number,
  condition: (idx: number) => boolean,
  maxLookback = MAX_STREAK_LOOKBACK_DAYS
): number {
  let start = targetIndex;
  const floor = Math.max(0, targetIndex - maxLookback);
  for (let i = targetIndex - 1; i >= floor; i--) {
    if (!condition(i)) break;
    start = i;
  }
  return start;
}

/**
 * 台股籌碼流五段式分類（多方：投信轉買/投信外資合買/逢低布局；空方：投信轉賣/投信外資合賣）。
 * 同一天只會落入一個分類，先符合先算——多方三類優先於空方兩類（結構上互斥，順序不影響
 * 判斷結果，只是程式碼裡先寫多方後寫空方）。
 */
export function classifyChipFlow(
  bars: OhlcvBar[],
  indicators: ChipFlowIndicators,
  targetIndex: number,
  institutionalDays: InstitutionalDay[],
  isLimitMove: boolean
): ChipFlowClassificationResult {
  if (isLimitMove) {
    return { status: "none", signalPointDate: null, priceAtSignal: null, triggerReason: null };
  }

  const institutionalDaysUpToDate = institutionalDays.filter((d) => d.date <= bars[targetIndex].date);
  const institutionalDaysUpToIndex = (idx: number) => institutionalDays.filter((d) => d.date <= bars[idx].date);
  const asOfDate = bars[targetIndex].date;

  if (isTrustTurnBuy(institutionalDaysUpToDate, asOfDate)) {
    const anchorIdx = findStreakStart(targetIndex, (i) => isTrustTurnBuy(institutionalDaysUpToIndex(i), bars[i].date));
    return {
      status: "trustTurnBuy",
      signalPointDate: bars[anchorIdx].date,
      priceAtSignal: bars[anchorIdx].close,
      triggerReason: describeTrustTurnBuyReason(institutionalDaysUpToDate, asOfDate),
    };
  }

  if (isCombinedBuy(institutionalDaysUpToDate, asOfDate)) {
    const anchorIdx = findStreakStart(targetIndex, (i) => isCombinedBuy(institutionalDaysUpToIndex(i), bars[i].date));
    return {
      status: "combinedBuy",
      signalPointDate: bars[anchorIdx].date,
      priceAtSignal: bars[anchorIdx].close,
      triggerReason: describeCombinedBuyReason(institutionalDaysUpToDate, asOfDate, targetIndex - anchorIdx + 1),
    };
  }

  if (isBuyDip(targetIndex, bars, indicators, institutionalDaysUpToDate)) {
    const anchorIdx = findStreakStart(targetIndex, (i) => isBuyDip(i, bars, indicators, institutionalDaysUpToIndex(i)));
    return {
      status: "buyDip",
      signalPointDate: bars[anchorIdx].date,
      priceAtSignal: bars[anchorIdx].close,
      triggerReason: describeBuyDipReason(targetIndex, bars, indicators, institutionalDaysUpToDate),
    };
  }

  if (isTrustTurnSell(institutionalDaysUpToDate, asOfDate)) {
    const anchorIdx = findStreakStart(targetIndex, (i) => isTrustTurnSell(institutionalDaysUpToIndex(i), bars[i].date));
    return {
      status: "trustTurnSell",
      signalPointDate: bars[anchorIdx].date,
      priceAtSignal: bars[anchorIdx].close,
      triggerReason: describeTrustTurnSellReason(institutionalDaysUpToDate, asOfDate),
    };
  }

  if (isCombinedSell(institutionalDaysUpToDate, asOfDate)) {
    const anchorIdx = findStreakStart(targetIndex, (i) => isCombinedSell(institutionalDaysUpToIndex(i), bars[i].date));
    return {
      status: "combinedSell",
      signalPointDate: bars[anchorIdx].date,
      priceAtSignal: bars[anchorIdx].close,
      triggerReason: describeCombinedSellReason(institutionalDaysUpToDate, asOfDate, targetIndex - anchorIdx + 1),
    };
  }

  return { status: "none", signalPointDate: null, priceAtSignal: null, triggerReason: null };
}
