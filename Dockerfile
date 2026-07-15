# Zeabur原本用自動偵測的Node建置方式，這裡改成自訂Dockerfile，是因為YouTube分析功能
# 需要在同一個container裡跑Python + yt-dlp + faster-whisper（見
# src/app/api/cron/youtube-transcribe/route.ts 和 scripts/youtube-transcribe.py）。
#
# 背景：這個抓取/轉錄步驟原本跑在GitHub Actions runner上，但YouTube的反機器人機制會擋
# GitHub Actions的IP（"Sign in to confirm you're not a bot"），cookies跟偽裝手機App
# 用戶端兩種常見繞過方式都試過仍被擋，改成跑在Zeabur這個container上測試IP是否不受阻擋。
#
# 已知取捨：faster-whisper轉錄很吃CPU，這些工作現在會跟正式站的網頁請求共用同一個
# container的運算資源，重轉錄期間有可能影響網站回應速度——這是使用者知情後接受的風險。
#
# 2026-07-15追加：改跑在Zeabur上之後發現IP還是被擋，查出來YouTube從2024-2026開始
# 強制要求BotGuard attestation + PO Token驗證，不是單純cookies/client偽裝能繞過的
# （見 https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide）。改裝bgutil-ytdlp-pot-provider
# （yt-dlp官方文件推薦的PO Token產生方案）：一個Node.js寫的本地HTTP server負責產生token，
# 搭配對應的yt-dlp python plugin，兩者裝在同一個container裡。
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv ffmpeg ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先裝Node依賴（package.json的postinstall會跑`prisma generate`，schema要先進去）
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# Python依賴裝在虛擬環境（Debian新版系統Python預設不給直接pip install，PEP668限制）
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"
RUN pip install --no-cache-dir yt-dlp faster-whisper requests bgutil-ytdlp-pot-provider

# PO Token provider server：獨立於/app之外的Node.js服務，預設監聽127.0.0.1:4416，
# yt-dlp的python plugin會自動去問它要token，不需要額外的extractor-args設定
RUN git clone --depth 1 --single-branch --branch 1.3.1 \
    https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /opt/bgutil-provider \
    && cd /opt/bgutil-provider/server \
    && npm ci \
    && npx tsc

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
CMD ["/app/docker-entrypoint.sh"]
