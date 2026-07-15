import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { prisma } from "@/lib/prisma";

const DEFAULT_MAX_AGE_DAYS = 7;

/**
 * 維護用：刪掉「還沒成功過、而且發布時間已經超過N天」的stub row。用途：
 * runYoutubeDiscovery.ts改成只抓近期集數之前，曾經一次性把Podcast RSS的整個歷史
 * （上千集）都discovery進來；也用來清掉改用Podcast來源之前、YouTube格式的舊stub row
 * （videoId是YouTube格式、沒有audioUrl，永遠不會被處理）。只刪從沒成功過的（transcript
 * 仍是null），不會動到已經有transcript/mentions的紀錄。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const maxAgeDaysParam = Number(request.nextUrl.searchParams.get("maxAgeDays"));
  const maxAgeDays = Number.isFinite(maxAgeDaysParam) && maxAgeDaysParam > 0 ? maxAgeDaysParam : DEFAULT_MAX_AGE_DAYS;
  const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000);

  const result = await prisma.youtubeVideo.deleteMany({
    where: { transcript: null, publishedAt: { lt: cutoff } },
  });

  return NextResponse.json({ deleted: result.count });
}
