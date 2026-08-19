import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { computeDailyMarketDiff } from "@/lib/trend/tw/dailyMarketDiff";

export interface GenerateDailyReportResult {
  status: "written" | "insufficient-history";
  reportDate?: string;
  categoryTransitions?: number;
  breakouts?: number;
  costBasisCrossovers?: number;
}

/**
 * 排程/CLI用：算今天的異動diff，upsert進tw_daily_market_report。冪等（同一天重跑會覆蓋
 * 掉舊資料，跟其他cron script一樣安全）。
 */
export async function generateDailyReport(explicitDates?: {
  reportDate: string;
  prevTradeDate: string;
}): Promise<GenerateDailyReportResult> {
  const diff = await computeDailyMarketDiff(explicitDates);
  if (!diff) return { status: "insufficient-history" };

  await prisma.twDailyMarketReport.upsert({
    where: { reportDate: new Date(diff.reportDate) },
    update: {
      prevTradeDate: new Date(diff.prevTradeDate),
      taiexClose: diff.taiex?.close ?? null,
      taiexChangePct: diff.taiex?.changePct ?? null,
      categoryTransitions: diff.categoryTransitions as unknown as Prisma.InputJsonValue,
      breakouts: diff.breakouts as unknown as Prisma.InputJsonValue,
      costBasisCrossovers: diff.costBasisCrossovers as unknown as Prisma.InputJsonValue,
    },
    create: {
      reportDate: new Date(diff.reportDate),
      prevTradeDate: new Date(diff.prevTradeDate),
      taiexClose: diff.taiex?.close ?? null,
      taiexChangePct: diff.taiex?.changePct ?? null,
      categoryTransitions: diff.categoryTransitions as unknown as Prisma.InputJsonValue,
      breakouts: diff.breakouts as unknown as Prisma.InputJsonValue,
      costBasisCrossovers: diff.costBasisCrossovers as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    status: "written",
    reportDate: diff.reportDate,
    categoryTransitions: diff.categoryTransitions.length,
    breakouts: diff.breakouts.length,
    costBasisCrossovers: diff.costBasisCrossovers.length,
  };
}
