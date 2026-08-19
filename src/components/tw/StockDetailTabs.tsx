"use client";

import { useState, type ReactNode } from "react";

export interface StockDetailTab {
  key: string;
  label: string;
  /** 已經render好的icon元素（例如<Gauge className="h-3.5 w-3.5" />），不是component reference——
   * 這個組件是client component，父層（個股頁，server component）傳icon進來時只能傳「已經渲染好的
   * 元素」，不能傳function reference跨server/client邊界 */
  icon: ReactNode;
  content: ReactNode;
}

/**
 * 2026-08-19新增：個股頁原本是Core Score/股價走勢/三大法人/籌碼集中度/月營收/法說會/媒體提及/
 * 同業比較全部直向堆疊，一路往下捲很長。改成tab分頁，比照一般券商APP的個股頁呈現方式（總覽/
 * 走勢/籌碼/基本面等分頁切換，不是一次全部攤開）。每個分頁本身內容不變（各自還是自己的Card），
 * 這裡只負責tab列切換，不吃掉子組件既有的卡片外觀。
 */
export function StockDetailTabs({ tabs }: { tabs: StockDetailTab[] }) {
  const [activeKey, setActiveKey] = useState(tabs[0]?.key);
  const activeTab = tabs.find((t) => t.key === activeKey) ?? tabs[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-white/10">
        {tabs.map((tab) => {
          const active = tab.key === activeTab?.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveKey(tab.key)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                  : "border-transparent text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab?.content}
    </div>
  );
}
