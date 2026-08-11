#!/usr/bin/env python3
"""GitHub Pages에 올릴 최소 공개 패키지를 dist/에 만든다."""

from __future__ import annotations

import json
import shutil
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
FILES = ["index.html", "styles.css", "app.js", "site.webmanifest", ".nojekyll"]
DIRS = ["assets", "fonts", "icons"]
AUDIO_EXTENSIONS = {".mp3", ".mp4"}
VIDEO_EXTENSIONS = {".mp4"}
PUBLIC_SITE_URL = "https://eunhorang.github.io/book-song/"


def copy_file(relative: str) -> None:
    source = ROOT / relative
    if not source.is_file():
        raise SystemExit(f"필수 파일이 없습니다: {relative}")
    target = DIST / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def checked_media_path(value: object, extensions: set[str], label: str) -> str:
    candidate = str(value or "").strip()
    if not candidate:
        return ""
    relative = Path(candidate)
    if relative.is_absolute() or ".." in relative.parts or relative.parts[:1] != ("media",):
        raise SystemExit(f"{label} 경로는 media/ 폴더 안의 상대 경로여야 합니다: {candidate}")
    if relative.suffix.lower() not in extensions:
        allowed = ", ".join(sorted(extensions))
        raise SystemExit(f"{label} 확장자는 {allowed}만 지원합니다: {candidate}")
    if not (ROOT / relative).is_file():
        raise SystemExit(f"연결된 {label} 파일이 없습니다: {candidate}")
    return relative.as_posix()


def conventional_audio(track_id: str) -> str:
    """같은 번호의 MP3를 우선하고, 없으면 MP4의 음성 트랙을 사용한다."""
    for suffix in (".mp3", ".mp4"):
        candidate = ROOT / "media" / f"{track_id}{suffix}"
        if candidate.is_file():
            return candidate.relative_to(ROOT).as_posix()
    return ""


def share_page_html(track: dict[str, object]) -> str:
    track_id = escape(str(track["id"]), quote=True)
    title = escape(str(track["title"]), quote=True)
    question = escape(str(track["question"]), quote=True)
    share_url = f"{PUBLIC_SITE_URL}share/{track_id}/"
    destination = f"../../?view=meaning&amp;track={track_id}"
    social_image = f"{PUBLIC_SITE_URL}assets/og-card.png"
    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,follow">
  <meta http-equiv="refresh" content="0; url={destination}">
  <meta name="description" content="{question}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:title" content="{title} | 책이 노래가 될 때">
  <meta property="og:description" content="{question}">
  <meta property="og:url" content="{share_url}">
  <meta property="og:image" content="{social_image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="책이 노래가 될 때 프로젝트 로고">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title} | 책이 노래가 될 때">
  <meta name="twitter:description" content="{question}">
  <meta name="twitter:image" content="{social_image}">
  <link rel="canonical" href="{share_url}">
  <link rel="icon" href="../../assets/favicon-64.png" type="image/png" sizes="64x64">
  <link rel="stylesheet" href="../../styles.css">
  <title>{title} | 책이 노래가 될 때</title>
</head>
<body>
  <main class="share-landing" id="main-content">
    <article class="share-landing-card">
      <p class="eyebrow">BOOKS INTO SONGS · TRACK {track_id}</p>
      <h1>{title}</h1>
      <p>{question}</p>
      <a class="button button-primary" href="{destination}">가사와 의미에서 이 노래 만나기</a>
    </article>
  </main>
</body>
</html>
"""


def build_share_pages(tracks: list[dict[str, object]]) -> None:
    for track in tracks:
        track_id = str(track["id"])
        if len(track_id) != 2 or not track_id.isdigit():
            raise SystemExit(f"곡별 공유 경로에 사용할 수 없는 번호입니다: {track_id}")
        target = DIST / "share" / track_id / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(share_page_html(track), encoding="utf-8")


def main() -> None:
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)
    for relative in FILES:
        copy_file(relative)
    for directory in DIRS:
        source = ROOT / directory
        if not source.is_dir():
            raise SystemExit(f"필수 폴더가 없습니다: {directory}")
        shutil.copytree(source, DIST / directory)
    copy_file("data/tracks.json")

    tracks = json.loads((ROOT / "data/tracks.json").read_text(encoding="utf-8"))
    media = json.loads((ROOT / "data/media.json").read_text(encoding="utf-8"))
    merged_media: dict[str, dict[str, str]] = {}
    copied_media: set[str] = set()
    audio_count = 0
    video_count = 0

    for track in tracks:
        track_id = track["id"]
        source_entry = dict(media.get(track_id, {}))
        configured_audio = source_entry.get("audio", source_entry.get("mp4", ""))
        audio = conventional_audio(track_id) or checked_media_path(
            configured_audio, AUDIO_EXTENSIONS, "오디오"
        )
        video = checked_media_path(source_entry.get("video", ""), VIDEO_EXTENSIONS, "영상")
        youtube = str(source_entry.get("youtube", "") or "").strip()

        for relative in (audio, video):
            if relative and relative not in copied_media:
                copy_file(relative)
                copied_media.add(relative)

        if audio:
            audio_count += 1
        if video:
            video_count += 1
        merged_media[track_id] = {
            "audio": audio,
            "video": video,
            "youtube": youtube,
        }

    media_target = DIST / "data/media.json"
    media_target.parent.mkdir(parents=True, exist_ok=True)
    media_target.write_text(
        json.dumps(merged_media, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    build_share_pages(tracks)
    shutil.copy2(DIST / "index.html", DIST / "404.html")
    print(
        f"공개 패키지 생성: {len(tracks)}곡, 오디오 {audio_count}개, "
        f"명시적 영상 {video_count}개, 공유 페이지 {len(tracks)}개 → {DIST}"
    )


if __name__ == "__main__":
    main()
