#!/usr/bin/env python3
"""공개 가능한 '책이 노래가 될 때' 노트를 웹사이트 데이터로 동기화한다."""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
TRACKS_PATH = DATA_DIR / "tracks.json"
MEDIA_PATH = DATA_DIR / "media.json"
PALETTES = [
    {"accent": "#B85C38", "soft": "#F7E5DC", "ink": "#352018"},
    {"accent": "#397569", "soft": "#E2F0EB", "ink": "#173A34"},
    {"accent": "#5D64A5", "soft": "#E8EAF7", "ink": "#252952"},
    {"accent": "#9A6A23", "soft": "#F4EBD8", "ink": "#493313"},
    {"accent": "#A45267", "soft": "#F6E3E8", "ink": "#4A1F2B"},
    {"accent": "#47709A", "soft": "#E3ECF5", "ink": "#1D354A"},
]


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def frontmatter(text: str) -> dict[str, str]:
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.S)
    if not match:
        raise ValueError("YAML frontmatter가 없습니다.")
    result: dict[str, str] = {}
    for line in match.group(1).splitlines():
        if ":" not in line or line.startswith((" ", "\t", "-")):
            continue
        key, value = line.split(":", 1)
        result[key.strip()] = value.strip().strip('"\'')
    return result


def section(text: str, heading: str) -> str:
    match = re.search(
        rf"^## {re.escape(heading)}\s*$\n(.*?)(?=^## |\Z)",
        text,
        re.M | re.S,
    )
    return match.group(1).strip() if match else ""


def clean_inline(value: str) -> str:
    value = re.sub(r"\[\[(.*?)(?:\|(.*?))?\]\]", lambda m: m.group(2) or m.group(1), value)
    value = value.replace("**", "").replace("__", "").replace("`", "").strip()
    return value.strip("“”\"\"")


def bullet(section_text: str, label: str) -> str:
    match = re.search(rf"^- {re.escape(label)}:\s*(.+?)\s*$", section_text, re.M)
    return clean_inline(match.group(1)) if match else ""


def fenced(section_text: str) -> str:
    match = re.search(r"```(?:text)?\s*\n(.*?)\n```", section_text, re.S)
    return match.group(1).strip() if match else ""


def first_quote(section_text: str) -> str:
    lines=[]
    for line in section_text.splitlines():
        if line.startswith(">"):
            lines.append(line[1:].strip())
        elif lines:
            break
    return clean_inline(" ".join(lines))


def meaning_rows(section_text: str) -> list[dict[str, str]]:
    rows=[]
    for line in section_text.splitlines():
        if not line.strip().startswith("|"):
            continue
        cells=[cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) != 2 or cells[0] in {"가사와 이미지", "---"} or set(cells[0]) == {"-"}:
            continue
        rows.append({"lyric": clean_inline(cells[0]), "meaning": clean_inline(cells[1])})
    return rows


def chorus_hook(lyrics: str) -> str:
    match = re.search(r"\[Chorus\]\s*\n(.*?)(?=\n\s*\n|\n\[|\Z)", lyrics, re.S | re.I)
    if not match:
        return ""
    return "\n".join(line.strip() for line in match.group(1).splitlines() if line.strip())


def upload_date_overrides(values: list[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for value in values:
        match = re.fullmatch(r"(\d{2})=(\d{4}-\d{2}-\d{2})", value.strip())
        if not match:
            raise SystemExit(f"업로드 날짜 형식은 NN=YYYY-MM-DD여야 합니다: {value}")
        track_id, uploaded_at = match.groups()
        try:
            date.fromisoformat(uploaded_at)
        except ValueError as error:
            raise SystemExit(f"유효하지 않은 업로드 날짜입니다: {value}") from error
        result[track_id] = uploaded_at
    return result


def parse_note(path: Path) -> dict:
    text=read_text(path)
    meta=frontmatter(text)
    if meta.get("privacy") != "public":
        raise ValueError("공개 노트가 아니므로 제외합니다.")
    basic=section(text,"기본 정보")
    lyrics=fenced(section(text,"전체 가사"))
    meanings=meaning_rows(section(text,"가사에 담긴 의미"))
    if not lyrics or not meanings:
        raise ValueError("가사 또는 의미표가 없습니다.")
    number=int(meta.get("song_no") or re.match(r"(\d{2})-",path.name).group(1))
    title=meta.get("song_title") or re.sub(r"^\d{2}-|\.md$", "", path.name)
    palette=PALETTES[(number-1)%len(PALETTES)]
    return {
        "id": f"{number:02d}",
        "title": title,
        "book": meta.get("source_book", ""),
        "author": meta.get("source_author", ""),
        "question": bullet(basic,"중심 질문"),
        "message": bullet(basic,"핵심 메시지"),
        "hook": chorus_hook(lyrics),
        "lyrics": lyrics,
        "meanings": meanings,
        "narration": first_quote(section(text,"영상 시작 내레이션")),
        "endingQuestion": first_quote(section(text,"영상 마지막 질문")),
        "theme": palette,
    }


def resolve_source_dir(cli_value: str | None) -> Path:
    if cli_value:
        return Path(cli_value).expanduser().resolve()
    vault=os.environ.get("OBSIDIAN_VAULT_PATH")
    if not vault:
        raise SystemExit("--source-dir 또는 OBSIDIAN_VAULT_PATH가 필요합니다.")
    return Path(vault).expanduser().resolve()/"AI-Sessions/wiki/책이 노래가 될 때"


def main() -> None:
    parser=argparse.ArgumentParser()
    parser.add_argument("--source-dir", help="번호가 붙은 곡 노트 폴더")
    parser.add_argument(
        "--uploaded-at",
        action="append",
        default=[],
        metavar="NN=YYYY-MM-DD",
        help="새 음원의 Git 업로드 날짜. 기존 곡 날짜는 자동 보존합니다.",
    )
    args=parser.parse_args()
    source_dir=resolve_source_dir(args.source_dir)
    notes=sorted(source_dir.glob("[0-9][0-9]-*.md"))
    if not notes:
        raise SystemExit(f"곡 노트를 찾지 못했습니다: {source_dir}")
    existing_tracks: dict[str, dict] = {}
    if TRACKS_PATH.exists():
        existing_tracks = {
            str(track.get("id")): track
            for track in json.loads(TRACKS_PATH.read_text(encoding="utf-8"))
            if track.get("id")
        }
    uploaded_at_overrides = upload_date_overrides(args.uploaded_at)
    tracks=[]
    for path in notes:
        try:
            track = parse_note(path)
        except ValueError as error:
            raise SystemExit(f"{path.name}: {error}") from error
        track_id = track["id"]
        uploaded_at = uploaded_at_overrides.get(
            track_id, str(existing_tracks.get(track_id, {}).get("uploadedAt", ""))
        )
        if not uploaded_at:
            raise SystemExit(
                f"{track_id} 현재 음원 업로드 날짜가 없습니다. "
                f"--uploaded-at {track_id}=YYYY-MM-DD를 지정해 주세요."
            )
        track = {"id": track_id, "uploadedAt": uploaded_at, **{k: v for k, v in track.items() if k != "id"}}
        tracks.append(track)
    ids=[track["id"] for track in tracks]
    expected=[f"{n:02d}" for n in range(1,len(tracks)+1)]
    if ids != expected:
        raise SystemExit(f"곡 번호가 연속적이지 않습니다: {ids}")
    unknown_overrides = sorted(set(uploaded_at_overrides) - set(ids))
    if unknown_overrides:
        raise SystemExit(f"존재하지 않는 곡의 업로드 날짜가 지정됐습니다: {unknown_overrides}")
    DATA_DIR.mkdir(parents=True,exist_ok=True)
    TRACKS_PATH.write_text(json.dumps(tracks,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    media={}
    if MEDIA_PATH.exists():
        media=json.loads(MEDIA_PATH.read_text(encoding="utf-8"))
    normalized_media={}
    for track_id in ids:
        entry=media.get(track_id,{})
        normalized_media[track_id]={
            "audio":entry.get("audio",entry.get("mp4","")),
            "video":entry.get("video",""),
            "youtube":entry.get("youtube",""),
        }
    media=normalized_media
    MEDIA_PATH.write_text(json.dumps(media,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"동기화 완료: {len(tracks)}곡 → {TRACKS_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
