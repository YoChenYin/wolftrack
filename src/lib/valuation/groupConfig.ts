import groupConfigJson from "@/config/group_config.json";

export interface GroupTheme {
  theme_name: string;
  leader: string[];
  members: string[];
}

export interface GroupConfig {
  industry_concepts: Record<string, GroupTheme[]>;
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
