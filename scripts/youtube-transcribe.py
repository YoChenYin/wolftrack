#!/usr/bin/env python3
"""
給 .github/workflows/youtube-transcribe.yml 用：抓待處理的節目集數清單，下載Podcast
MP3音檔，跑本地faster-whisper語音轉文字，結果回傳給app的ingest端點。

跑在GitHub Actions runner上，不是Zeabur正式站——2026-07-15實測過，即使只轉錄1集、
把faster-whisper限制成1個CPU執行緒，Zeabur那個container還是會完全無法回應長達10分鐘
以上（資源比預期緊繃很多），所以CPU密集的語音轉文字不該跑在跟正式站共用的container上。
GitHub Actions runner有獨立的2 vCPU，不會影響正式站。

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
PENDING_BATCH_LIMIT = 10  # 對齊 pending-transcripts route.ts 的 MAX_LIMIT
MAX_ROUNDS = 50  # 安全上限，避免因為某種bug無限迴圈（正常情況遠遠用不到這麼多輪）
DOWNLOAD_TIMEOUT = 120


def fetch_pending():
    res = requests.get(
        f"{APP_URL}/api/youtube/pending-transcripts",
        headers=HEADERS,
        params={"limit": PENDING_BATCH_LIMIT},
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
    # 這支呼叫本身失敗（例如暫時性502）不該讓整個batch中斷——寧可這支影片的
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

        _whisper_model = WhisperModel(WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")
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
    每輪抓一批pending集數處理完，再抓下一批，直到抓回空清單為止——這樣「補過去累積的
    集數」只需要觸發一次，不用因為pending-transcripts單次回傳筆數上限（10筆）而重複觸發
    好幾次。用MAX_ROUNDS當安全上限，實際會先被workflow本身的timeout擋住。每支之間加
    隨機延遲，降低被誤判成異常流量的機率（雖然podcast CDN本來就沒有反爬蟲機制）。
    """
    total_processed = 0
    for round_num in range(1, MAX_ROUNDS + 1):
        videos = fetch_pending()
        if not videos:
            print(f"round {round_num}: no more pending videos, done")
            break
        print(f"round {round_num}: {len(videos)} pending video(s)")
        for video in videos:
            process_video(video)
            total_processed += 1
            delay = random.uniform(5, 10)
            print(f"  sleeping {delay:.1f}s before next video")
            time.sleep(delay)
    print(f"total processed: {total_processed}")


if __name__ == "__main__":
    main()
