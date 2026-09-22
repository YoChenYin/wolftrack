import { findIndustryThemeByName, findChainStagesForTheme, type ThemeChainStage } from "./groupConfig";
import { computeGroupValuation, type GroupValuationResult } from "./computeGroupValuation";
import { computeBacktestValidationForTickers, computeMarketBacktestBaseline } from "./computeThemeBacktestValidation";
import type { CategoryBacktestSummary } from "@/lib/trend/tw/backtestSummary";
import { queryThemeNarrative, type ThemeNarrativeResult } from "./computeThemeNarrative";

export interface ThemeResearchBrief {
  themeName: string;
  leader: string[];
  members: string[];
  /** findChainStagesForTheme()結果——空陣列=孤兒theme，還沒被任何產業鏈收編 */
  chainStages: ThemeChainStage[];
  valuation: GroupValuationResult;
  /** 範圍=這個theme的members，見computeThemeBacktestValidation.ts */
  backtest: CategoryBacktestSummary[];
  /** 全市場對照組（不限這個theme），跟backtest並排比較才知道這個theme是不是真的比大盤同類訊號更有效 */
  marketBaseline: CategoryBacktestSummary[];
  narrative: ThemeNarrativeResult;
}

/**
 * 單一 theme 的完整研究簡報——固定欄位（結構/估值/歷史驗證/敘事面），不管這個 theme 目前有沒有
 * 被收進任何產業鏈都能單獨產生，讓孤兒 theme（目前48個裡有22個還沒被收進chains）也能先看驗證
 * 數字再決定要不要升級成新產業鏈階段。computeChainResearchBrief.ts 是把這個函式依階段組裝起來。
 */
export async function computeThemeResearchBrief(themeName: string): Promise<ThemeResearchBrief | null> {
  const theme = findIndustryThemeByName(themeName);
  if (!theme) return null;

  const tickers = theme.members;

  const [valuation, backtest, marketBaseline, narrative] = await Promise.all([
    computeGroupValuation(theme),
    computeBacktestValidationForTickers(tickers),
    computeMarketBacktestBaseline(),
    queryThemeNarrative(tickers),
  ]);

  return {
    themeName: theme.theme_name,
    leader: theme.leader,
    members: theme.members,
    chainStages: findChainStagesForTheme(themeName),
    valuation,
    backtest,
    marketBaseline,
    narrative,
  };
}
