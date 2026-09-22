import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { computeThemeResearchBrief } from "@/lib/valuation/computeThemeResearchBrief";
import { ThemeBriefSections } from "@/components/tw/ThemeBriefSections";

export const dynamic = "force-dynamic";

export default async function ThemeResearchBriefPage({ params }: { params: Promise<{ themeName: string }> }) {
  const { themeName } = await params;
  const brief = await computeThemeResearchBrief(decodeURIComponent(themeName));
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
      <h1 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">主題研究簡報</h1>
      <div className="mt-4">
        <ThemeBriefSections brief={brief} standalone />
      </div>
    </div>
  );
}
