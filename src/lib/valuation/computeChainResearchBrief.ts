import { getChainStagesWithThemes, getChain } from "./groupConfig";
import { computeThemeResearchBrief, type ThemeResearchBrief } from "./computeThemeResearchBrief";

export interface ChainResearchBriefStage {
  stageKey: string;
  label: string;
  themes: ThemeResearchBrief[];
}

export interface ChainResearchBrief {
  chainName: string;
  chainNameFull: string;
  stages: ChainResearchBriefStage[];
}

/**
 * 產業鏈層級的研究簡報：依階段把每個theme的研究簡報（computeThemeResearchBrief.ts）組裝起來。
 * 一條鏈通常只有幾個theme（目前最多的半導體鏈也才11個），不特別批次優化查詢——之後如果
 * 實測頁面載入太慢再回來改。
 */
export async function computeChainResearchBrief(chainName: string): Promise<ChainResearchBrief | null> {
  const chain = getChain(chainName);
  const stagesWithThemes = getChainStagesWithThemes(chainName);
  if (!chain || !stagesWithThemes) return null;

  const stages: ChainResearchBriefStage[] = await Promise.all(
    stagesWithThemes.map(async (stage) => {
      const themes = await Promise.all(stage.themes.map((t) => computeThemeResearchBrief(t.theme_name)));
      return {
        stageKey: stage.stageKey,
        label: stage.label,
        themes: themes.filter((t): t is ThemeResearchBrief => t !== null),
      };
    })
  );

  return { chainName, chainNameFull: chain.chainNameFull, stages };
}
