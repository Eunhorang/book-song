#!/usr/bin/env python3
"""곡별 MP4 또는 YouTube 주소를 안전하게 연결한다."""

from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT=Path(__file__).resolve().parents[1]
TRACKS_PATH=ROOT/"data/tracks.json"
MEDIA_PATH=ROOT/"data/media.json"
MEDIA_DIR=ROOT/"media"
MAX_MP4_BYTES=95*1024*1024


def youtube_id(value: str) -> str:
    parsed=urlparse(value)
    host=parsed.netloc.lower().removeprefix("www.")
    candidate=""
    if host=="youtu.be":
        candidate=parsed.path.strip("/").split("/")[0]
    elif host in {"youtube.com","m.youtube.com","music.youtube.com"}:
        if parsed.path=="/watch":
            candidate=parse_qs(parsed.query).get("v",[""])[0]
        elif parsed.path.startswith(("/shorts/","/embed/","/live/")):
            candidate=parsed.path.strip("/").split("/")[1]
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}",candidate):
        raise ValueError("지원되는 YouTube 영상 주소가 아닙니다.")
    return candidate


def main() -> None:
    parser=argparse.ArgumentParser()
    parser.add_argument("--track",required=True,help="곡 번호, 예: 05")
    parser.add_argument("--mp4",help="연결할 MP4 파일")
    parser.add_argument("--youtube",help="YouTube 영상 주소")
    parser.add_argument("--clear-mp4",action="store_true")
    parser.add_argument("--clear-youtube",action="store_true")
    args=parser.parse_args()
    track_id=f"{int(args.track):02d}"
    tracks=json.loads(TRACKS_PATH.read_text(encoding="utf-8"))
    if track_id not in {track["id"] for track in tracks}:
        raise SystemExit(f"존재하지 않는 곡 번호입니다: {track_id}")
    media=json.loads(MEDIA_PATH.read_text(encoding="utf-8"))
    entry=media.setdefault(track_id,{"mp4":"","youtube":""})
    if args.clear_mp4:
        old=entry.get("mp4","")
        entry["mp4"]=""
        if old:
            old_path=ROOT/old
            if old_path.is_file():
                old_path.unlink()
    if args.mp4:
        source=Path(args.mp4).expanduser().resolve()
        if not source.is_file() or source.suffix.lower() != ".mp4":
            raise SystemExit("실제 MP4 파일을 지정해 주세요.")
        if source.stat().st_size > MAX_MP4_BYTES:
            raise SystemExit("MP4가 95MB를 넘습니다. 더 작게 압축하거나 YouTube 연결을 사용해 주세요.")
        MEDIA_DIR.mkdir(parents=True,exist_ok=True)
        target=MEDIA_DIR/f"{track_id}.mp4"
        shutil.copy2(source,target)
        entry["mp4"]=target.relative_to(ROOT).as_posix()
    if args.clear_youtube:
        entry["youtube"]=""
    if args.youtube:
        try:
            video_id=youtube_id(args.youtube)
        except ValueError as error:
            raise SystemExit(str(error)) from error
        entry["youtube"]=f"https://www.youtube.com/watch?v={video_id}"
    MEDIA_PATH.write_text(json.dumps(media,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"track":track_id,**entry},ensure_ascii=False,indent=2))


if __name__ == "__main__":
    main()
