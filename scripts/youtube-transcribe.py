#!/usr/bin/env python3
"""
給 .github/workflows/youtube-transcribe.yml 用：抓待處理的 YouTube 影片清單，
字幕優先（游庭皓頻道有自動字幕），沒字幕就下載音訊跑本地 faster-whisper 語音轉文字
（EBC/Gooaye兩個頻道），結果回傳給 app 的 ingest 端點。

跑在 GitHub Actions runner 上，不是 Zeabur 正式站——CPU密集的語音轉文字不該佔用
常駐 container（見 docs 說明）。
"""
import os
import re
import glob
import shutil
import tempfile

import requests
import yt_dlp

APP_URL = os.environ["APP_URL"].rstrip("/")
CRON_SECRET = os.environ["CRON_SECRET"]
HEADERS = {"Authorization": f"Bearer {CRON_SECRET}"}

CAPTION_LANGS = ["zh-Hant", "zh-TW", "zh"]
WHISPER_MODEL_SIZE = "small"


PENDING_BATCH_LIMIT = 10  # 對齊 pending-transcripts route.ts 的 MAX_LIMIT
MAX_ROUNDS = 50  # 安全上限，避免因為某種bug無限迴圈（正常情況遠遠用不到這麼多輪）


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
    res = requests.post(
        f"{APP_URL}/api/youtube/ingest-transcript",
        headers=HEADERS,
        json={"id": video_id, "failed": True},
        timeout=30,
    )
    res.raise_for_status()


def vtt_to_text(vtt_path: str) -> str:
    """VTT轉純文字：拿掉header/timestamp/cue設定行，去除連續重複行（自動字幕常見的滾動重複）。"""
    lines = []
    prev = None
    with open(vtt_path, encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line == "WEBVTT" or line.startswith("Kind:") or line.startswith("Language:"):
                continue
            if "-->" in line:
                continue
            if re.match(r"^\d+$", line):
                continue
            line = re.sub(r"<[^>]+>", "", line)  # 去除 <c> 之類的 inline tag
            if line != prev:
                lines.append(line)
                prev = line
    return " ".join(lines)


def try_fetch_captions(video_url: str, video_id: str, workdir: str) -> str | None:
    opts = {
        "writeautomaticsub": True,
        "writesubtitles": True,
        "subtitleslangs": CAPTION_LANGS,
        "subtitlesformat": "vtt",
        "skip_download": True,
        "outtmpl": os.path.join(workdir, f"{video_id}.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([video_url])
    except Exception as e:
        print(f"  caption download failed: {e}")
        return None

    vtt_files = glob.glob(os.path.join(workdir, f"{video_id}*.vtt"))
    if not vtt_files:
        return None
    text = vtt_to_text(vtt_files[0])
    return text if text.strip() else None


def download_audio(video_url: str, video_id: str, workdir: str) -> str | None:
    opts = {
        "format": "bestaudio/best",
        "outtmpl": os.path.join(workdir, f"{video_id}.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([video_url])
    except Exception as e:
        print(f"  audio download failed: {e}")
        return None

    audio_files = [
        f for f in glob.glob(os.path.join(workdir, f"{video_id}.*")) if not f.endswith(".vtt")
    ]
    return audio_files[0] if audio_files else None


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
    video_id = video["videoId"]
    video_url = f"https://www.youtube.com/watch?v={video_id}"
    print(f"Processing {video_id} - {video['title']}")

    workdir = tempfile.mkdtemp(prefix=f"yt-{video_id}-")
    try:
        caption_text = try_fetch_captions(video_url, video_id, workdir)
        if caption_text:
            print(f"  got captions ({len(caption_text)} chars)")
            ingest_success(video_id_int, caption_text, "caption")
            return

        print("  no captions, falling back to audio + whisper")
        audio_path = download_audio(video_url, video_id, workdir)
        if not audio_path:
            print("  audio download failed, giving up")
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
    每輪抓一批pending影片處理完，再抓下一批，直到抓回空清單為止——這樣「補過去一週累積的
    影片」只需要手動觸發一次workflow，不用因為pending-transcripts單次回傳筆數上限（10筆）
    而重複手動點好幾次。用MAX_ROUNDS當安全上限，實際會先被workflow本身的90分鐘timeout擋住。
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
    print(f"total processed: {total_processed}")


if __name__ == "__main__":
    main()
