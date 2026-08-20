import { TACTICAL_STATUS_META } from "@/lib/trend/tacticalStatusMeta";
import type { CategoryTransition, BreakoutEvent, CostBasisCrossoverEvent } from "@/lib/trend/tw/dailyMarketDiff";

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

export function describeCategoryTransition(t: CategoryTransition): string {
  const priceText = `今天收盤價${t.price.toFixed(2)}元`;
  if (t.fromCategory === null && t.toCategory !== null) {
    return `${t.ticker} ${t.name} ${priceText}，新增至「${categoryLabel(t.toCategory)}」${t.triggerReason ? `（${t.triggerReason}）` : ""}`;
  }
  if (t.fromCategory !== null && t.toCategory === null) {
    return `${t.ticker} ${t.name} ${priceText}，移出「${categoryLabel(t.fromCategory)}」`;
  }
  return `${t.ticker} ${t.name} ${priceText}，從「${categoryLabel(t.fromCategory!)}」轉為「${categoryLabel(t.toCategory!)}」${t.triggerReason ? `（${t.triggerReason}）` : ""}`;
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

export const REPORT_DISCLAIMER = "本報告僅呈現資料庫裡可觀察到的客觀狀態變化，不構成投資建議，也不代表任何投顧意見，操作前請自行判斷並留意風險。";
