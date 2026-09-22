import Link from "next/link";
import { Compass } from "lucide-react";
import { listAllThemeNames, findChainStagesForTheme } from "@/lib/valuation/groupConfig";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { InfoTooltip } from "../InfoTooltip";

/**
 * 列出目前還沒被收進任何產業鏈的theme（48個theme裡目前22個是孤兒）——每個連到獨立的
 * theme研究簡報頁，方便逐一檢視驗證數字/敘事面之後，再決定要不要人工把它收編進
 * group_config.json的chains（見docs/wolftrack-tw-spec.md §4.3，這塊設計上是手動維護）。
 */
export function OrphanThemesCard() {
  const orphanThemes = listAllThemeNames().filter((name) => findChainStagesForTheme(name).length === 0);
  if (orphanThemes.length === 0) return null;

  return (
    <Card>
      <SectionHeader
        icon={Compass}
        iconColor="amber"
        title="尚未分類進產業鏈的主題"
        tooltip={<InfoTooltip>這些theme已經有成分股清單，但還沒被收進任何產業鏈的上中下游結構。點進去看研究簡報（歷史驗證+敘事面），再決定要不要人工收編。</InfoTooltip>}
      />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {orphanThemes.map((name) => (
          <Link
            key={name}
            href={`/tw/chains/theme/${encodeURIComponent(name)}`}
            className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10"
          >
            {name}
          </Link>
        ))}
      </div>
    </Card>
  );
}
