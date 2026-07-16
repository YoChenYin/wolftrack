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
 * 這是使用者知情後接受的風險。scripts/youtube-transcribe.py本身也限制每次只處理1集
 * （MAX_VIDEOS_PER_RUN），避免長時間佔滿資源。
 *
 * isRunning guard：2026-07-15實測過，這支被連續觸發多次時，多個faster-whisper行程
 * 同時跑會讓網站完全無法回應（甚至連Zeabur後台的重啟指令都連不上）。用模組層級變數
 * 擋掉重複觸發——只在單一Node process內有效，這個服務目前沒有水平擴展多個instance，
 * 足夠用。
 */
let isRunning = false;

export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isRunning) {
    return NextResponse.json({ status: "already-running" }, { status: 409 });
  }
  isRunning = true;

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
    isRunning = false;
  });
  child.on("error", (err) => {
    console.error("[youtube-transcribe] failed to start:", err);
    isRunning = false;
  });

  return NextResponse.json({ status: "started" }, { status: 202 });
}
