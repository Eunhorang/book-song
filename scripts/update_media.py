#!/usr/bin/env python3
"""곡별 오디오·명시적 영상·YouTube 주소를 안전하게 연결한다."""

from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
TRACKS_PATH = ROOT / "data/tracks.json"
MEDIA_PATH = ROOT / "data/media.json"
MEDIA_DIR = ROOT / "media"
MAX_MEDIA_BYTES = 95 * 1024 * 1024
AUDIO_EXTENSIONS = {".mp3", ".mp4"}


def youtube_id(value: str) -> str:
    parsed = urlparse(value)
    host = parsed.netloc.lower().removeprefix("www.")
    candidate = ""
    if host == "youtu.be":
        candidate = parsed.path.strip("/").split("/")[0]
    elif host in {"youtube.com", "m.youtube.com", "music.youtube.com"}:
        if parsed.path == "/watch":
            candidate = parse_qs(parsed.query).get("v", [""])[0]
        elif parsed.path.startswith(("/shorts/", "/embed/", "/live/")):
            candidate = parsed.path.strip("/").split("/")[1]
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", candidate):
        raise ValueError("지원되는 YouTube 영상 주소가 아닙니다.")
    return candidate


def checked_source(value: str, extensions: set[str], label: str) -> Path:
    source = Path(value).expanduser().resolve()
    if not source.is_file() or source.suffix.lower() not in extensions:
        allowed = ", ".join(sorted(extensions))
        raise SystemExit(f"실제 {label} 파일({allowed})을 지정해 주세요.")
    if source.stat().st_size > MAX_MEDIA_BYTES:
        raise SystemExit(f"{label} 파일이 95MB를 넘습니다. 더 작게 압축해 주세요.")
    return source


def copy_if_needed(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if source != target.resolve():
        shutil.copy2(source, target)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--track", required=True, help="곡 번호, 예: 05")
    parser.add_argument("--audio", "--mp4", dest="audio", help="음악만 재생할 MP3 또는 MP4 파일")
    parser.add_argument("--video", help="명시적으로 화면에 표시할 MP4 영상 파일")
    parser.add_argument("--youtube", help="명시적으로 표시할 YouTube 영상 주소")
    parser.add_argument(
        "--clear-audio",
        "--clear-mp4",
        dest="clear_audio",
        action="store_true",
        help="오디오 매핑만 비움(파일은 삭제하지 않음)",
    )
    parser.add_argument("--clear-video", action="store_true", help="영상 매핑만 비움(파일은 삭제하지 않음)")
    parser.add_argument("--clear-youtube", action="store_true")
    args = parser.parse_args()

    track_id = f"{int(args.track):02d}"
    tracks = json.loads(TRACKS_PATH.read_text(encoding="utf-8"))
    if track_id not in {track["id"] for track in tracks}:
        raise SystemExit(f"존재하지 않는 곡 번호입니다: {track_id}")

    media = json.loads(MEDIA_PATH.read_text(encoding="utf-8"))
    previous = media.get(track_id, {})
    entry = {
        "audio": previous.get("audio", previous.get("mp4", "")),
        "video": previous.get("video", ""),
        "youtube": previous.get("youtube", ""),
    }

    if args.clear_audio:
        entry["audio"] = ""
    if args.audio:
        source = checked_source(args.audio, AUDIO_EXTENSIONS, "오디오")
        target = MEDIA_DIR / f"{track_id}{source.suffix.lower()}"
        copy_if_needed(source, target)
        entry["audio"] = target.relative_to(ROOT).as_posix()

    if args.clear_video:
        entry["video"] = ""
    if args.video:
        source = checked_source(args.video, {".mp4"}, "영상")
        target = MEDIA_DIR / f"{track_id}-video.mp4"
        copy_if_needed(source, target)
        entry["video"] = target.relative_to(ROOT).as_posix()

    if args.clear_youtube:
        entry["youtube"] = ""
    if args.youtube:
        try:
            video_id = youtube_id(args.youtube)
        except ValueError as error:
            raise SystemExit(str(error)) from error
        entry["youtube"] = f"https://www.youtube.com/watch?v={video_id}"

    media[track_id] = entry
    MEDIA_PATH.write_text(
        json.dumps(media, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"track": track_id, **entry}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
