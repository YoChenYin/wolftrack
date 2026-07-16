#!/usr/bin/env python3
"""
給 src/app/api/cron/youtube-transcribe/route.ts 用：抓待處理的節目集數清單，下載Podcast
MP3音檔，跑本地faster-whisper語音轉文字，結果回傳給app的ingest端點。

2026-07-15改版：原本用yt-dlp直接抓YouTube影片/字幕，但YouTube在雲端環境（GitHub Actions、
Zeabur）一律用反機器人機制擋下（cookies、偽裝手機App用戶端、PO Token provider都試過仍被
擋，見docs/progress-status.md），改成從這些節目對應的Podcast RSS feed（SoundOn/SoundCloud
等標準podcast host）抓——這些MP3是直接放在CDN上給podcast app訂閱用的，沒有反爬蟲機制，
單純HTTP GET就能下載，不再需要yt-dlp/cookies/PO Token這些複雜設定。
"""
import os
import random
import shutil
import tempfile
import time

import requests

APP_URL = os.environ["APP_URL"].rstrip("/")
CRON_SECRET = os.environ["CRON_SECRET"]
HEADERS = {"Authorization": f"Bearer {CRON_SECRET}"}

WHISPER_MODEL_SIZE = "small"
# 這支腳本跟正式站網頁共用同一個container的CPU/記憶體。一次處理太多集（曾經一次丟37集）
# 會讓faster-whisper長時間佔滿運算資源，導致Next.js完全無法回應請求（2026-07-15實測發生
# 過，網站整個卡死，連Zeabur後台的重啟都連不上）。改成每次呼叫只處理極少量，靠排程自然
# 分散負載，累積的backlog會在後續多次排程執行中逐漸清完，而不是一次全部処理。
MAX_VIDEOS_PER_RUN = 1
DOWNLOAD_TIMEOUT = 120


def fetch_pending():
    res = requests.get(
        f"{APP_URL}/api/youtube/pending-transcripts",
        headers=HEADERS,
        params={"limit": MAX_VIDEOS_PER_RUN},
        timeout=30,
    )
    res.raise_for_status()
    return res.json()["videos"]


def ingest_success(video_id: int, transcript: str, source: str):
    res = requests.post(
        f"{APP_URL}/api/youtube/ingest-transcript",
        headers=HEADERS,
        json={"id": video_id, "transcript": transcript, "transcriptSource": source},
        timeout=30,
    )
    res.raise_for_status()


def ingest_failure(video_id: int):
    # 這支呼叫本身失敗（例如Zeabur暫時性502）不該讓整個batch中斷——寧可這支影片的
    # transcriptAttempts沒累加成功（下次還會被retry），也不要讓後面幾十支影片完全沒被處理到。
    try:
        res = requests.post(
            f"{APP_URL}/api/youtube/ingest-transcript",
            headers=HEADERS,
            json={"id": video_id, "failed": True},
            timeout=30,
        )
        res.raise_for_status()
    except Exception as e:
        print(f"  (also failed to report failure for video {video_id}, will be retried next run: {e})")


def download_audio(audio_url: str, workdir: str) -> str | None:
    dest = os.path.join(workdir, "audio")
    try:
        with requests.get(audio_url, stream=True, timeout=DOWNLOAD_TIMEOUT) as res:
            res.raise_for_status()
            with open(dest, "wb") as f:
                for chunk in res.iter_content(chunk_size=1 << 20):
                    f.write(chunk)
        return dest
    except Exception as e:
        print(f"  audio download failed: {e}")
        return None


_whisper_model = None


def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel

        # cpu_threads限制成1：這個container同時跑著Next.js網頁服務，Whisper預設會盡量
        # 吃滿所有可用CPU執行緒，2026-07-15實測過這樣會讓網頁完全無法回應。犧牲一點轉錄
        # 速度換取網站不被拖死。
        _whisper_model = WhisperModel(WHISPER_MODEL_SIZE, device="cpu", compute_type="int8", cpu_threads=1)
    return _whisper_model


def transcribe_audio(audio_path: str) -> str:
    model = get_whisper_model()
    segments, _info = model.transcribe(audio_path, language="zh")
    return " ".join(segment.text.strip() for segment in segments)


def process_video(video: dict):
    video_id_int = video["id"]
    audio_url = video["audioUrl"]
    print(f"Processing {video['videoId']} - {video['title']}")

    workdir = tempfile.mkdtemp(prefix=f"podcast-{video_id_int}-")
    try:
        audio_path = download_audio(audio_url, workdir)
        if not audio_path:
            print("  giving up")
            ingest_failure(video_id_int)
            return

        transcript = transcribe_audio(audio_path)
        if not transcript.strip():
            print("  whisper produced empty transcript, giving up")
            ingest_failure(video_id_int)
            return

        print(f"  got whisper transcript ({len(transcript)} chars)")
        ingest_success(video_id_int, transcript, "whisper")
    except Exception as e:
        print(f"  unexpected error, giving up: {e}")
        ingest_failure(video_id_int)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def main():
    """
    每次呼叫只處理最多MAX_VIDEOS_PER_RUN集就結束（不是把整個pending佇列一次處理完）。
    這支跟正式站網頁共用同一個container，處理太多集會長時間佔滿CPU/記憶體讓網站無法
    回應（見上面MAX_VIDEOS_PER_RUN的說明）。累積的backlog靠排程多次觸發自然清完。
    """
    videos = fetch_pending()
    if not videos:
        print("no pending videos, done")
        return
    print(f"{len(videos)} pending video(s) this run")
    for i, video in enumerate(videos):
        process_video(video)
        if i < len(videos) - 1:
            delay = random.uniform(5, 10)
            print(f"  sleeping {delay:.1f}s before next video")
            time.sleep(delay)
    print(f"total processed: {len(videos)}")


if __name__ == "__main__":
    main()
