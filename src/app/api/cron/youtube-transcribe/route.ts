import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { spawn } from "node:child_process";
import path from "node:path";

/**
 * 排程觸發：跑 scripts/youtube-transcribe.py（下載Podcast MP3 + faster-whisper轉錄）。
 *
 * 這支腳本原本用yt-dlp直接抓YouTube，但YouTube的反機器人機制在雲端環境（GitHub Actions、
 * Zeabur）一律擋下（cookies、偽裝手機App用戶端、PO Token provider都試過仍被擋），最後
 * 改成從這些節目的Podcast RSS feed抓（沒有反爬蟲機制），跑在這個container內、用子行程
 * 執行、不阻塞這支API本身的回應。
 *
 * 已知取捨：faster-whisper轉錄很吃CPU，會跟同一個container上的網頁請求搶運算資源，
 * 這是使用者知情後接受的風險。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scriptPath = path.join(process.cwd(), "scripts", "youtube-transcribe.py");
  const port = process.env.PORT ?? "3000";

  const child = spawn("python3", [scriptPath], {
    env: {
      ...process.env,
      APP_URL: `http://127.0.0.1:${port}`,
      CRON_SECRET: process.env.CRON_SECRET ?? "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk: Buffer) => {
    console.log(`[youtube-transcribe] ${chunk.toString().trim()}`);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    console.error(`[youtube-transcribe] ${chunk.toString().trim()}`);
  });
  child.on("close", (code) => {
    console.log(`[youtube-transcribe] process exited with code ${code}`);
  });
  child.on("error", (err) => {
    console.error("[youtube-transcribe] failed to start:", err);
  });

  return NextResponse.json({ status: "started" }, { status: 202 });
}
