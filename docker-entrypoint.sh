#!/bin/sh
set -e

# PO Token provider（見Dockerfile說明）在背景跑，yt-dlp的python plugin會自動連
# 127.0.0.1:4416 去要token。這是輔助服務，不是主行程，容器收到終止訊號時被單獨
# 留下也無妨——Docker會連同整個container的process group一起清掉。
node /opt/bgutil-provider/server/build/main.js &

exec npm run start
