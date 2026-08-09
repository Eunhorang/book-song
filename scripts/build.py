#!/usr/bin/env python3
"""GitHub Pages에 올릴 최소 공개 패키지를 dist/에 만든다."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DIST=ROOT/"dist"
FILES=["index.html","styles.css","app.js","site.webmanifest",".nojekyll"]
DIRS=["assets","fonts","icons"]


def copy_file(relative: str) -> None:
    source=ROOT/relative
    if not source.is_file():
        raise SystemExit(f"필수 파일이 없습니다: {relative}")
    target=DIST/relative
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(source,target)


def main() -> None:
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)
    for relative in FILES:
        copy_file(relative)
    for directory in DIRS:
        source=ROOT/directory
        if not source.is_dir():
            raise SystemExit(f"필수 폴더가 없습니다: {directory}")
        shutil.copytree(source,DIST/directory)
    for relative in ["data/tracks.json"]:
        copy_file(relative)
    tracks=json.loads((ROOT/"data/tracks.json").read_text(encoding="utf-8"))
    media=json.loads((ROOT/"data/media.json").read_text(encoding="utf-8"))
    merged_media={}
    media_count=0
    for track in tracks:
        track_id=track["id"]
        entry=dict(media.get(track_id,{"mp4":"","youtube":""}))
        conventional=ROOT/"media"/f"{track_id}.mp4"
        explicit=entry.get("mp4","")
        if conventional.is_file():
            entry["mp4"]=f"media/{track_id}.mp4"
        elif explicit:
            source=ROOT/explicit
            if not source.is_file():
                raise SystemExit(f"연결된 MP4가 없습니다: {explicit}")
        else:
            entry["mp4"]=""
        if entry["mp4"]:
            copy_file(entry["mp4"])
            media_count+=1
        merged_media[track_id]=entry
    media_target=DIST/"data/media.json"
    media_target.parent.mkdir(parents=True,exist_ok=True)
    media_target.write_text(json.dumps(merged_media,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    shutil.copy2(DIST/"index.html",DIST/"404.html")
    print(f"공개 패키지 생성: {len(tracks)}곡, MP4 {media_count}개 → {DIST}")


if __name__ == "__main__":
    main()
