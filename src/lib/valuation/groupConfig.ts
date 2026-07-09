import groupConfigJson from "@/config/group_config.json";

/** 一個 theme 在某條產業鏈裡的位置，見 GroupConfig.chains 說明 */
export interface ThemeChainStage {
  chainName: string;
  stageKey: string;
  label: string;
}

export interface GroupTheme {
  theme_name: string;
  leader: string[];
  members: string[];
  /**
   * 2026-07-10：這個 theme 在產業鏈裡的上中下游位置（直接標在 theme 物件上、不用另外查
   * chains 交叉索引），資料來源是 group_config.json 生成時把 chains 結構「連動」寫回每個 theme，
   * 不是每個 theme 都有——只有屬於六條主力鏈其中一條的才會有值。
   */
  chainStages?: ThemeChainStage[];
}

/** 2026-07-10：產業鏈上中下游結構，見 groupConfig.ts 底部的 getChainForTheme() 等存取函式說明 */
export interface ChainStage {
  label: string;
  themes: string[];
}

export interface Chain {
  chainNameFull: string;
  /** key 是階段代號（upstream/midstream/downstream/support），不是每條鏈都有全部四階段 */
  stages: Record<string, ChainStage>;
}

export interface GroupConfig {
  industry_concepts: Record<string, GroupTheme[]>;
  /**
   * 產業鏈上中下游（2026-07-10 新增，只涵蓋半導體/AI伺服器/被動元件/記憶體/電動車/光通訊
   * 六條主力鏈——不是每個 industry_concepts 分類都套得上「供應鏈」概念，金融消費/ETF/景氣循環
   * 這種不是製造業供應鏈的分類刻意不勉強套用，維持扁平結構）。
   * 跟 industry_concepts 是獨立的交叉索引：一個 theme 可以同時屬於某個 industry_concepts 分類、
   * 又屬於某條 chain 的某個階段，兩邊互不影響，改這裡不會動到既有的板塊篩選/估值比較邏輯。
   */
  chains?: Record<string, Chain>;
}

/**
 * group_config.json 用 `import` 讀進來（不是 fs.readFileSync），
 * Node/Next.js 的模組系統本來就只會在第一次載入時 parse 一次、之後每個 import 端共用同一份記憶體物件，
 * 等於自動達成「啟動時載入記憶體快取」，不需要自己再寫一層 lazy-singleton cache。
 * 缺點：改 config 檔要重新部署/重啟 process 才會生效，不能做到「不重啟即時更新」。
 */
const groupConfig = groupConfigJson as GroupConfig;

export function getGroupConfig(): GroupConfig {
  return groupConfig;
}

/**
 * 找出某檔股票所屬的所有「產業概念」族群。
 * 2026-07-09：原本還有 group_concepts（集團概念/國際供應鏈）欄位，但程式碼從未讀取過
 * （spec 第四章邏輯提醒集團股權關係不適合拿來做同業估值比較），已確認無用並移除。
 */
export function findIndustryThemesForTicker(ticker: string): GroupTheme[] {
  const result: GroupTheme[] = [];
  for (const themes of Object.values(groupConfig.industry_concepts)) {
    for (const theme of themes) {
      if (theme.members.includes(ticker) || theme.leader.includes(ticker)) {
        result.push(theme);
      }
    }
  }
  return result;
}

export function findIndustryThemeByName(themeName: string): GroupTheme | undefined {
  for (const themes of Object.values(groupConfig.industry_concepts)) {
    const found = themes.find((t) => t.theme_name === themeName);
    if (found) return found;
  }
  return undefined;
}

/** 2026-07-09：首頁板塊改用 group_config.json 的 theme_name（見 sectorTrendsQuery.ts） */
export const UNCATEGORIZED_THEME_CODE = "__uncategorized__";

/** 列出全部 theme（跨 industry_concepts 各分類），theme_name 本身當代號用（已確認 43 個全部不重複） */
export function listAllThemeNames(): string[] {
  const names: string[] = [];
  for (const themes of Object.values(groupConfig.industry_concepts)) {
    for (const theme of themes) names.push(theme.theme_name);
  }
  return names;
}

/** 跨所有 theme 的不重複股票代號聯集，用來算「未分類」= 有追蹤但沒被任何 theme 收錄的股票 */
export function getAllThemedTickers(): Set<string> {
  const result = new Set<string>();
  for (const themes of Object.values(groupConfig.industry_concepts)) {
    for (const theme of themes) {
      for (const t of theme.members) result.add(t);
    }
  }
  return result;
}

/** 列出全部產業鏈名稱（半導體/AI伺服器/被動元件/記憶體/電動車/光通訊，見 GroupConfig.chains 說明） */
export function listAllChainNames(): string[] {
  return Object.keys(groupConfig.chains ?? {});
}

export function getChain(chainName: string): Chain | undefined {
  return groupConfig.chains?.[chainName];
}

/**
 * 展開某條產業鏈的每個階段，把 theme 名稱換成實際的 GroupTheme（含 leader/members），
 * 方便呼叫端直接拿去跑 computeGroupValuation() 或算報酬率，不用自己再查一次 findIndustryThemeByName。
 */
export function getChainStagesWithThemes(
  chainName: string
): { stageKey: string; label: string; themes: GroupTheme[] }[] | undefined {
  const chain = getChain(chainName);
  if (!chain) return undefined;
  return Object.entries(chain.stages).map(([stageKey, stage]) => ({
    stageKey,
    label: stage.label,
    themes: stage.themes.map((name) => findIndustryThemeByName(name)).filter((t): t is GroupTheme => t !== undefined),
  }));
}

/**
 * 找出某個 theme_name 屬於哪些鏈的哪個階段。直接讀 GroupTheme.chainStages（group_config.json
 * 生成時已經把 chains 結構寫回每個 theme），不用每次呼叫都重新掃一遍 chains 交叉索引。
 */
export function findChainStagesForTheme(themeName: string): ThemeChainStage[] {
  return findIndustryThemeByName(themeName)?.chainStages ?? [];
}
