# Zeabur原本用自動偵測的Node建置方式，這裡改成自訂Dockerfile，是因為YouTube分析功能
# 需要在同一個container裡跑Python + faster-whisper（見
# src/app/api/cron/youtube-transcribe/route.ts 和 scripts/youtube-transcribe.py）。
#
# 背景：這個轉錄步驟原本用yt-dlp直接抓YouTube影片/字幕，但YouTube的反機器人機制在
# 雲端環境（GitHub Actions、Zeabur）一律擋下（"Sign in to confirm you're not a bot"）——
# cookies、偽裝手機App用戶端、PO Token provider都試過仍被擋，最後查出這3個節目都有
# 對應的Podcast RSS feed（SoundOn/SoundCloud等標準podcast host），音檔直接HTTP下載
# 即可、沒有反爬蟲機制，於是完全移除yt-dlp，改成單純requests下載MP3 + faster-whisper
# 轉錄（見docs/progress-status.md的完整排查記錄）。
#
# 已知取捨：faster-whisper轉錄很吃CPU，這些工作會跟正式站的網頁請求共用同一個
# container的運算資源，重轉錄期間有可能影響網站回應速度——這是使用者知情後接受的風險。
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先裝Node依賴（package.json的postinstall會跑`prisma generate`，schema要先進去）
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# Python依賴裝在虛擬環境（Debian新版系統Python預設不給直接pip install，PEP668限制）
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"
RUN pip install --no-cache-dir faster-whisper requests

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start"]
