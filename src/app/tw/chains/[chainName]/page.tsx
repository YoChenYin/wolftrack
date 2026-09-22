import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { computeChainResearchBrief } from "@/lib/valuation/computeChainResearchBrief";
import { ThemeBriefSections } from "@/components/tw/ThemeBriefSections";

export const dynamic = "force-dynamic";

export default async function ChainResearchBriefPage({ params }: { params: Promise<{ chainName: string }> }) {
  const { chainName } = await params;
  const brief = await computeChainResearchBrief(decodeURIComponent(chainName));
  if (!brief) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Link
        href="/tw/chains"
        className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.25} />
        回產業鏈總覽
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{brief.chainNameFull} 研究簡報</h1>

      <div className="mt-4 flex flex-col gap-6">
        {brief.stages.map((stage) => (
          <div key={stage.stageKey}>
            <h2 className="mb-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400">{stage.label}</h2>
            {stage.themes.length === 0 ? (
              <p className="text-xs text-zinc-400 dark:text-zinc-500">這個階段目前沒有可用的theme資料。</p>
            ) : (
              <div className="flex flex-col gap-4">
                {stage.themes.map((theme) => (
                  <ThemeBriefSections key={theme.themeName} brief={theme} standalone={false} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
