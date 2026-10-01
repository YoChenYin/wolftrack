import { findSwingPoints, type SwingPoint } from "./swingPoints";

/**
 * 底部反轉型態辨識（頭肩底/N字底，2026-08-20新增）——使用者看盤軟體上常見的兩種打底型態，
 * 邏輯：
 *
 * N字底：第1腳(轉折低點) → 反彈高點 → 第2腳(拉回但不破第1腳的轉折低點，「N」的第二筆) →
 *        突破反彈高點＝型態確認。目標價(量測移動法) = 反彈高點 + (反彈高點 - 第1腳)。
 *
 * 頭肩底：左肩(轉折低點) → 頸線1(轉折高點) → 頭部(比左肩更低的轉折低點) → 頸線2(轉折高點) →
 *         右肩(比頭部高的轉折低點) → 突破頸線＝型態確認。頸線簡化成頸線1/頸線2的平均值
 *         （沒有做真正的斜率內插，跟supportResistance.ts一樣是簡化選擇）。
 *         目標價 = 頸線 + (頸線 - 頭部)。
 *
 * 兩種型態都只有在「型態主體已經成形」（N字底的第2腳、頭肩底的右肩都已經是確認過的轉折點）
 * 才會有輸出結果，且只分兩個階段（見schema.prisma的BottomPatternStage說明）——比這更早期的
 * 「左肩剛形成」「頭部剛形成」都不輸出，因為那個階段型態會不會走完的不確定性太高，太早提示
 * 容易變成一堆沒有下文的假訊號。
 *
 * 這是主觀的圖形辨識，不是精確科學——下面所有百分比容忍度都是這次實作時的判斷，不是backtest
 * 出來的最佳參數，未來如果實測誤判率太高，這些常數都可以再調。
 *
 * 2026-09-30：對照Bulkowski（Encyclopedia of Chart Patterns）/StockCharts/台灣N字底教學修正
 * 突破確認方式，原本「收盤價高於突破價1分錢就算確認」太寬鬆：
 * - 時間過濾：要連續2天收盤站上突破價才算確認，單日站上只算「即將突破」，過濾假突破
 * - 量能過濾：突破那2天至少有一天成交量≥突破前20日均量×1.5倍，沒量的突破不算數
 * - 頭肩底頸線改成斜線（原本取兩個頸線點平均）：頸線往下斜時用斜線在當天的位置，往上斜時
 *   用右側頸線點（Bulkowski的定義），避免上斜頸線被平均值拉低、太早確認
 * - 確認狀態只維持CONFIRMED_VALID_DAYS個交易日，之後不再輸出——原本只要還在頸線上方就一直
 *   是「確認」，股價漲離頸線很遠了還掛在「底部出現」
 */

const LOOKBACK_TRADING_DAYS = 120;
/** 反彈/頭肩的兩個轉折高點至少要比前一個低點高這麼多%，太小的起伏不算數，避免盤整雜訊被誤認成型態。
 * 2026-08-20：第一版用5%，實測對278檔股票掃描命中率高達22%（見PR討論），代表門檻太鬆——
 * 一般股票在120天窗口內隨便一次正常回檔反彈就會超過5%，不是真正意義上的型態反轉。調到12%後
 * 命中率明顯降到個位數%，比較符合「這是相對少見的訊號」的預期 */
const MIN_BOUNCE_PCT = 12;
/** 頭部至少要比左右肩低這麼多%，才算是「頭」不是隨便一個低點 */
const MIN_HEAD_DEPTH_PCT = 5;
/** 左右肩價位容忍度：兩者價差在此範圍內都算「大致對稱」 */
const SHOULDER_TOLERANCE_PCT = 12;
/** 頸線兩個轉折高點的價位容忍度 */
const NECKLINE_TOLERANCE_PCT = 6;
/** 距離突破價位在此百分比以內，算「即將突破」(nearBreakout) */
const NEAR_BREAKOUT_THRESHOLD_PCT = 3;
/** 型態主體最後一個轉折點（N字底第2腳/頭肩底右肩）要在近多少個交易日內形成，太舊的型態
 * 已經不具參考價值（股價可能早就走去別的方向了） */
const FRESHNESS_TRADING_DAYS = 40;
/** 2026-08-20新增：型態起點（N字底第1腳/頭肩底左肩）之前，要有一個明顯更高的轉折高點，
 * 且跌幅至少這麼多%——沒有這個檢查，光靠「低-高-低」序列去抓，任何盤整或上升趨勢中段的
 * 正常拉回都會符合，不是真正意義上「跌了一段之後在打底」。這是實測278檔真實股票掃描後加的
 * （沒有這個檢查時命中率高達19-22%，明顯太高，不像是有意義的訊號） */
const MIN_PRIOR_DECLINE_PCT = 12;
/** 突破後要連續幾天收盤站上突破價才算確認（第1天只算即將突破） */
const BREAKOUT_CONFIRM_CLOSES = 2;
/** 突破確認那幾天，至少一天成交量要達到突破前20日均量的這個倍數 */
const BREAKOUT_VOLUME_MULTIPLE = 1.5;
const VOLUME_AVG_DAYS = 20;
/** 確認後幾個交易日內還算「底部出現」，超過代表已經是突破後的走勢，不是打底訊號了 */
const CONFIRMED_VALID_DAYS = 5;

export interface PatternBar {
  close: number;
  volume: number;
}

export interface BottomPatternResult {
  patternType: "headShoulders" | "nShape";
  stage: "nearBreakout" | "confirmed";
  breakoutLevel: number;
  targetPrice: number;
  description: string;
}

function pctDiff(a: number, b: number): number {
  return (Math.abs(a - b) / Math.min(a, b)) * 100;
}

/**
 * 從後往前找最近一組符合[low,high,low,...]型別序列的轉折點——不能直接假設「最後N個轉折點」
 * 就是型態本身，因為型態突破後股價可能繼續走（尤其confirmed階段），又冒出新的轉折高/低點，
 * 讓swings陣列在型態成形之後還繼續變長。搜尋回傳的是「型態最後一筆」(secondLeg/rightShoulder)
 * 在swings裡的index，呼叫端自己往前推對應筆數取出整組。
 */
function findMostRecentSequence(swings: SwingPoint[], typesFromEnd: ("low" | "high")[]): number {
  for (let end = swings.length - 1; end >= typesFromEnd.length - 1; end--) {
    let matched = true;
    for (let offset = 0; offset < typesFromEnd.length; offset++) {
      if (swings[end - offset].type !== typesFromEnd[typesFromEnd.length - 1 - offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return end;
  }
  return -1;
}

/** 型態起點之前要有明顯更高的轉折高點（見MIN_PRIOR_DECLINE_PCT說明）——patternStartIndex
 * 是型態起點（N字底第1腳/頭肩底左肩）在swings裡的index，前一筆(patternStartIndex-1)必須
 * 存在且是轉折高點，跌幅要夠大，否則代表這段區間之前只是平淡盤整，不是「打底」 */
function hasMeaningfulPriorDecline(swings: SwingPoint[], patternStartIndex: number): boolean {
  const priorHigh = swings[patternStartIndex - 1];
  if (!priorHigh || priorHigh.type !== "high") return false;
  const patternStartPrice = swings[patternStartIndex].price;
  return ((priorHigh.price - patternStartPrice) / priorHigh.price) * 100 >= MIN_PRIOR_DECLINE_PCT;
}

type BreakoutCheck =
  | { kind: "none" }
  | { kind: "firstDay" }
  | { kind: "confirmed"; confirmIndex: number }
  | { kind: "failed" };

/**
 * 從型態最後一個轉折點之後往後找第一次收盤站上突破價的那天，檢查時間+量能過濾：
 * - 還沒站上過：none
 * - 最新一天是第一次站上（還差一天確認）：firstDay
 * - 連續BREAKOUT_CONFIRM_CLOSES天站上且量能達標：confirmed
 * - 站上後隔天就跌回，或量能不足：failed（這次突破不算數，型態不再輸出）
 * levelAt(i)：第i天的突破價，頭肩底斜頸線每天不同，N字底是固定值
 */
function checkBreakout(bars: PatternBar[], afterIndex: number, levelAt: (i: number) => number): BreakoutCheck {
  const latestIndex = bars.length - 1;
  let first = -1;
  for (let i = afterIndex + 1; i <= latestIndex; i++) {
    if (bars[i].close > levelAt(i)) {
      first = i;
      break;
    }
  }
  if (first === -1) return { kind: "none" };

  const confirmIndex = first + BREAKOUT_CONFIRM_CLOSES - 1;
  if (confirmIndex > latestIndex) return { kind: "firstDay" };
  for (let i = first; i <= confirmIndex; i++) {
    if (bars[i].close <= levelAt(i)) return { kind: "failed" };
  }

  const prior = bars.slice(Math.max(0, first - VOLUME_AVG_DAYS), first);
  if (prior.length < VOLUME_AVG_DAYS) return { kind: "failed" };
  const avgVolume = prior.reduce((sum, b) => sum + b.volume, 0) / prior.length;
  const maxBreakoutVolume = Math.max(...bars.slice(first, confirmIndex + 1).map((b) => b.volume));
  if (avgVolume <= 0 || maxBreakoutVolume < avgVolume * BREAKOUT_VOLUME_MULTIPLE) return { kind: "failed" };

  return { kind: "confirmed", confirmIndex };
}

function detectNShape(swings: SwingPoint[], bars: PatternBar[]): BottomPatternResult | null {
  const latestIndex = bars.length - 1;
  const latestClose = bars[latestIndex].close;
  const end = findMostRecentSequence(swings, ["low", "high", "low"]);
  if (end === -1) return null;
  if (!hasMeaningfulPriorDecline(swings, end - 2)) return null;
  const [firstLeg, reboundHigh, secondLeg] = swings.slice(end - 2, end + 1);
  if (secondLeg.price <= firstLeg.price) return null; // 破了前低，N字型態不成立
  if (((reboundHigh.price - firstLeg.price) / firstLeg.price) * 100 < MIN_BOUNCE_PCT) return null; // 反彈幅度太小
  if (latestIndex - secondLeg.index > FRESHNESS_TRADING_DAYS) return null; // 型態太舊
  if (latestClose < firstLeg.price) return null; // 已經跌破整個型態的起點，宣告失敗

  const breakoutLevel = reboundHigh.price;
  const targetPrice = breakoutLevel + (breakoutLevel - firstLeg.price);
  const breakout = checkBreakout(bars, secondLeg.index, () => breakoutLevel);

  if (breakout.kind === "failed") return null;
  if (breakout.kind === "confirmed") {
    if (latestIndex - breakout.confirmIndex >= CONFIRMED_VALID_DAYS) return null;
    return {
      patternType: "nShape",
      stage: "confirmed",
      breakoutLevel,
      targetPrice,
      description: `N字底反轉：連續${BREAKOUT_CONFIRM_CLOSES}日收盤站上反彈高點${breakoutLevel.toFixed(2)}元且量增，型態確認，量測目標價約${targetPrice.toFixed(2)}元`,
    };
  }
  if (breakout.kind === "firstDay") {
    return {
      patternType: "nShape",
      stage: "nearBreakout",
      breakoutLevel,
      targetPrice,
      description: `N字底反轉：今日首度收盤站上反彈高點${breakoutLevel.toFixed(2)}元，需再一日站穩且量增才算確認`,
    };
  }
  const distPct = ((breakoutLevel - latestClose) / breakoutLevel) * 100;
  if (distPct > NEAR_BREAKOUT_THRESHOLD_PCT) return null;
  return {
    patternType: "nShape",
    stage: "nearBreakout",
    breakoutLevel,
    targetPrice,
    description: `N字底反轉：第2腳${secondLeg.price.toFixed(2)}元未破前低，距反彈高點${breakoutLevel.toFixed(2)}元僅${distPct.toFixed(1)}%，型態接近完成`,
  };
}

function detectHeadShoulders(swings: SwingPoint[], bars: PatternBar[]): BottomPatternResult | null {
  const latestIndex = bars.length - 1;
  const latestClose = bars[latestIndex].close;
  const end = findMostRecentSequence(swings, ["low", "high", "low", "high", "low"]);
  if (end === -1) return null;
  if (!hasMeaningfulPriorDecline(swings, end - 4)) return null;
  const [leftShoulder, neck1, head, neck2, rightShoulder] = swings.slice(end - 4, end + 1);
  if (head.price >= leftShoulder.price * (1 - MIN_HEAD_DEPTH_PCT / 100)) return null; // 頭部不夠深
  if (head.price >= rightShoulder.price * (1 - MIN_HEAD_DEPTH_PCT / 100)) return null;
  if (pctDiff(leftShoulder.price, rightShoulder.price) > SHOULDER_TOLERANCE_PCT) return null; // 左右肩不夠對稱
  if (pctDiff(neck1.price, neck2.price) > NECKLINE_TOLERANCE_PCT) return null; // 頸線斜率太陡
  if (latestIndex - rightShoulder.index > FRESHNESS_TRADING_DAYS) return null; // 型態太舊
  if (latestClose < head.price) return null; // 已經跌破頭部，宣告失敗

  // Bulkowski：頸線往下斜時用斜線本身，往上斜時用右側頸線點（水平），避免上斜頸線太早確認
  const slope = (neck2.price - neck1.price) / (neck2.index - neck1.index);
  const necklineAt = (i: number) => (slope >= 0 ? neck2.price : neck1.price + slope * (i - neck1.index));
  const depth = neck1.price + slope * (head.index - neck1.index) - head.price;

  const breakout = checkBreakout(bars, rightShoulder.index, necklineAt);
  if (breakout.kind === "failed") return null;
  if (breakout.kind === "confirmed") {
    if (latestIndex - breakout.confirmIndex >= CONFIRMED_VALID_DAYS) return null;
    const breakoutLevel = necklineAt(breakout.confirmIndex);
    const targetPrice = breakoutLevel + depth;
    return {
      patternType: "headShoulders",
      stage: "confirmed",
      breakoutLevel,
      targetPrice,
      description: `頭肩底反轉：連續${BREAKOUT_CONFIRM_CLOSES}日收盤站上頸線${breakoutLevel.toFixed(2)}元且量增，型態確認，量測目標價約${targetPrice.toFixed(2)}元`,
    };
  }

  const neckline = necklineAt(latestIndex);
  const targetPrice = neckline + depth;
  if (breakout.kind === "firstDay") {
    return {
      patternType: "headShoulders",
      stage: "nearBreakout",
      breakoutLevel: neckline,
      targetPrice,
      description: `頭肩底反轉：今日首度收盤站上頸線${neckline.toFixed(2)}元，需再一日站穩且量增才算確認`,
    };
  }
  const distPct = ((neckline - latestClose) / neckline) * 100;
  if (distPct > NEAR_BREAKOUT_THRESHOLD_PCT) return null;
  return {
    patternType: "headShoulders",
    stage: "nearBreakout",
    breakoutLevel: neckline,
    targetPrice,
    description: `頭肩底反轉：右肩${rightShoulder.price.toFixed(2)}元已成形，距頸線${neckline.toFixed(2)}元僅${distPct.toFixed(1)}%，型態接近完成`,
  };
}

/**
 * bars：日期升序排列的收盤價+成交量序列，最後一個元素是「今天」。兩種型態都嘗試偵測，
 * 如果同時符合就回傳階段更高（confirmed優先於nearBreakout）的那個，同階段則回傳頭肩底
 * （型態主體較完整，訊號可信度相對高）。
 */
export function detectBottomPattern(bars: PatternBar[]): BottomPatternResult | null {
  const windowed = bars.slice(-LOOKBACK_TRADING_DAYS);
  const swings = findSwingPoints(windowed.map((b) => b.close));

  const headShoulders = detectHeadShoulders(swings, windowed);
  const nShape = detectNShape(swings, windowed);

  if (headShoulders && nShape) {
    if (headShoulders.stage === nShape.stage) return headShoulders;
    return headShoulders.stage === "confirmed" ? headShoulders : nShape;
  }
  return headShoulders ?? nShape;
}
