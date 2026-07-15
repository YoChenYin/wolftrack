import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { spawn } from "node:child_process";
import path from "node:path";

/**
 * 排程觸發：跑 scripts/youtube-transcribe.py（字幕優先，沒字幕就下載音訊跑faster-whisper）。
 *
 * 這支腳本原本是在GitHub Actions runner上跑，但YouTube的反機器人機制會擋GitHub Actions
 * 的IP（"Sign in to confirm you're not a bot"），cookies跟偽裝手機App用戶端兩種常見繞過
 * 方式都試過仍被擋，改成直接在這個container內跑（見repo根目錄Dockerfile），用子行程
 * 執行、不阻塞這支API本身的回應。
 *
 * 已知取捨：faster-whisper轉錄很吃CPU，會跟同一個container上的網頁請求搶運算資源，
 * 這是使用者知情後接受的風險（原本選GitHub Actions就是為了避免這個問題，但GitHub
 * Actions的IP被擋，兩害相權取其輕）。
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
