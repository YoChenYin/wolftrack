import { TACTICAL_STATUS_META } from "@/lib/trend/tacticalStatusMeta";
import type {
  CategoryTransition,
  BreakoutEvent,
  CostBasisCrossoverEvent,
  BottomPatternTransitionEvent,
  CategoryStreak,
} from "@/lib/trend/tw/dailyMarketDiff";
import type { BottomPatternType } from "@/generated/prisma/enums";

/**
 * 每日異動報告v1的文案層：把dailyMarketDiff.ts算出來的「事實」轉成中文句子。
 *
 * 語言規則（法遵防線，見docs/progress-status.md「每日異動報告」設計討論）：
 * - 只用「轉為」「站上」「跌破」「新增」「移出」這類客觀狀態描述動詞
 * - 禁止「建議買進/賣出」「目標價」「應該」「值得進場」這類指示性用語
 * - 不做「明天會漲/跌」的預測，只呈現「今天發生了什麼」
 * 之後想加v3 LLM潤飾層，輸入必須是這裡產出的句子（或更上游的結構化事實），不能讓LLM
 * 自己決定要不要下建議、要不要新增內容範圍以外的判斷。
 */

function categoryLabel(category: string): string {
  return TACTICAL_STATUS_META[category as keyof typeof TACTICAL_STATUS_META]?.title ?? category;
}

/** category_transitions是Json欄位，資料庫裡的舊資料列可能是price欄位還沒存在時寫入的
 * （見docs/progress-status.md每日異動報告章節）——欄位本身沒有schema強制，缺price時
 * 退化成不顯示價格，而不是讓.toFixed()炸掉整頁 */
export function describeCategoryTransition(t: CategoryTransition): string {
  const hasPrice = typeof t.price === "number" && Number.isFinite(t.price);
  const prefix = hasPrice ? `${t.ticker} ${t.name} 今天收盤價${t.price.toFixed(2)}元` : `${t.ticker} ${t.name}`;
  if (t.fromCategory === null && t.toCategory !== null) {
    return `${prefix}，新增至「${categoryLabel(t.toCategory)}」${t.triggerReason ? `（${t.triggerReason}）` : ""}`;
  }
  if (t.fromCategory !== null && t.toCategory === null) {
    return `${prefix}，移出「${categoryLabel(t.fromCategory)}」`;
  }
  return `${prefix}，從「${categoryLabel(t.fromCategory!)}」轉為「${categoryLabel(t.toCategory!)}」${t.triggerReason ? `（${t.triggerReason}）` : ""}`;
}

export function describeBreakout(b: BreakoutEvent): string {
  return b.direction === "aboveResistance"
    ? `${b.ticker} ${b.name} 今天收盤價${b.price.toFixed(2)}元，站上近60日壓力價${b.level.toFixed(2)}元（前一交易日還在區間內）`
    : `${b.ticker} ${b.name} 今天收盤價${b.price.toFixed(2)}元，跌破近60日支撐價${b.level.toFixed(2)}元（前一交易日還在區間內）`;
}

export function describeCostBasisCrossover(c: CostBasisCrossoverEvent): string {
  const whoLabel = c.who === "foreign" ? "外資" : "投信";
  return c.direction === "priceBelowCost"
    ? `${c.ticker} ${c.name} 今天收盤價${c.price.toFixed(2)}元，跌破${whoLabel}近60日加權平均成本價${c.costBasis.toFixed(2)}元`
    : `${c.ticker} ${c.name} 今天收盤價${c.price.toFixed(2)}元，站上${whoLabel}近60日加權平均成本價${c.costBasis.toFixed(2)}元`;
}

const BOTTOM_PATTERN_TYPE_LABEL: Record<BottomPatternType, string> = {
  headShoulders: "頭肩底",
  nShape: "N字底",
};

/** 底部反轉型態階段變化（v2新增，見dailyMarketDiff.ts的computeBottomPatternTransitions）。
 * toStage有值時直接沿用detectBottomPattern.ts算好的description（已經包含頸線/反彈高點價位、
 * 目標價等細節，不用重複組字）；toStage是null（型態消失，多半是股價拉回跌破型態關鍵價位）
 * 才需要自己組一句客觀描述。 */
export function describeBottomPatternTransition(t: BottomPatternTransitionEvent): string {
  const hasPrice = typeof t.price === "number" && Number.isFinite(t.price);
  const prefix = hasPrice ? `${t.ticker} ${t.name} 今天收盤價${t.price.toFixed(2)}元` : `${t.ticker} ${t.name}`;
  if (t.toStage !== null && t.description) {
    return `${prefix}，${t.description}`;
  }
  if (t.toStage === null) {
    return `${prefix}，${BOTTOM_PATTERN_TYPE_LABEL[t.patternType]}型態不再符合條件（型態關鍵價位已跌破）`;
  }
  return `${prefix}，出現${BOTTOM_PATTERN_TYPE_LABEL[t.patternType]}型態`;
}

/** 目前仍在同一個戰術分類已經連續N天（v2新增）——跟describeCategoryTransition()互補，
 * 那邊講「今天變成什麼」，這裡講「已經維持多久」 */
export function describeCategoryStreak(s: CategoryStreak): string {
  return `${s.ticker} ${s.name} 已連續${s.streakDays}個交易日處於「${categoryLabel(s.category)}」`;
}

export const REPORT_DISCLAIMER = "本報告僅呈現資料庫裡可觀察到的客觀狀態變化，不構成投資建議，也不代表任何投顧意見，操作前請自行判斷並留意風險。";
