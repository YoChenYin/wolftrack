import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { runYoutubeDiscovery } from "@/lib/youtube/runYoutubeDiscovery";

/**
 * 排程觸發：掃描3個固定YouTube頻道的RSS feed，把新影片存成待處理的stub row。
 * 字幕/語音轉文字由另一個獨立的GitHub Actions workflow（youtube-transcribe.yml）處理，
 * 這支只負責「發現新影片」，跑得很輕量。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  runYoutubeDiscovery()
    .then((result) => {
      console.log(`[cron/youtube-discovery] done: checked=${result.checked}, newVideos=${result.newVideos}`);
    })
    .catch((err) => {
      console.error("[cron/youtube-discovery] failed:", err);
    });

  return NextResponse.json({ status: "started" }, { status: 202 });
}
