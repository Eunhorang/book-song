#!/usr/bin/env python3
"""웹사이트 구조·데이터·공개 범위·미디어 연결을 검사한다."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
REQUIRED=["index.html","styles.css","app.js","site.webmanifest","data/tracks.json","data/media.json","fonts/PretendardVariable.woff2","fonts/LICENSE.txt","assets/brand-main.jpg","assets/brand-symbol.png","assets/favicon-64.png","assets/og-card.png","icons/icon-192.png","icons/icon-512.png","icons/apple-touch-icon.png"]
PROCESS_WORDS=re.compile(r"Suno|생성형|프롬프트|옵시디언|Obsidian|workflow|draft",re.I)
SECRET_WORDS=re.compile(r"(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]",re.I)
EMAIL=re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
PHONE=re.compile(r"(?<!\d)01[016789][-. ]?\d{3,4}[-. ]?\d{4}(?!\d)")


def main() -> None:
    parser=argparse.ArgumentParser()
    parser.add_argument("--dist",type=Path,default=ROOT/"dist")
    args=parser.parse_args()
    base=args.dist.resolve()
    errors=[]
    for relative in REQUIRED:
        if not (base/relative).is_file():
            errors.append(f"필수 파일 누락: {relative}")
    if errors:
        raise SystemExit("\n".join(errors))
    tracks=json.loads((base/"data/tracks.json").read_text(encoding="utf-8"))
    media=json.loads((base/"data/media.json").read_text(encoding="utf-8"))
    expected=[f"{number:02d}" for number in range(1,len(tracks)+1)]
    ids=[track.get("id") for track in tracks]
    if ids != expected:
        errors.append(f"곡 번호 불연속: {ids}")
    for track in tracks:
        for key in ["title","book","author","question","message","hook","lyrics","meanings","narration","endingQuestion","theme"]:
            if not track.get(key):
                errors.append(f"{track.get('id')} 필드 누락: {key}")
        if len(track.get("meanings",[]))<3:
            errors.append(f"{track.get('id')} 의미 해석이 너무 적습니다.")
        entry=media.get(track["id"])
        if entry is None:
            errors.append(f"{track['id']} 미디어 항목 누락")
            continue
        if "mp4" in entry:
            errors.append(f"{track['id']} 이전 mp4 필드가 남아 있습니다.")
        audio=entry.get("audio","")
        if audio and (Path(audio).suffix.lower() not in {".mp3",".mp4"} or not (base/audio).is_file()):
            errors.append(f"{track['id']} 오디오 연결 오류")
        video=entry.get("video","")
        if video and (Path(video).suffix.lower() != ".mp4" or not (base/video).is_file()):
            errors.append(f"{track['id']} 영상 연결 오류")
        youtube=entry.get("youtube","")
        if youtube and not re.fullmatch(r"https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}",youtube):
            errors.append(f"{track['id']} YouTube 주소 오류")
    html=(base/"index.html").read_text(encoding="utf-8")
    for marker in ['lang="ko"','id="main-content"','class="skip-link"','id="track-search"','<audio id="main-player"','<video id="video-player"','data-media-kind="empty"','class="header-playback"','aria-label="상단 노래 재생 메뉴"','id="shuffle-button"','id="playlist-status"','id="playback-toggle-button"','aria-controls="main-player video-player"','data-action="unavailable"','data-playback-state="idle"','id="view-status"','data-condensed="false"','id="library-jump"','class="player-detail-link"','data-view-link="library"','data-view-link="meaning"','data-view-link="about"','data-view-panel="home"','data-view-panel="library"','data-view-panel="meaning"','data-view-panel="about"','aria-live="polite"','class="brand-mark" src="./assets/brand-symbol.png"','class="hero-brand-image" src="./assets/brand-main.jpg"','href="./assets/favicon-64.png"','href="./fonts/PretendardVariable.woff2"']:
        if marker not in html:
            errors.append(f"HTML 접근성 표식 누락: {marker}")
    for marker in ['<span class="hero-title-line">읽고 남은 마음을</span>','<span class="hero-title-line">노래로 기록합니다.</span>']:
        if marker not in html:
            errors.append(f"첫 화면 대표 문구 누락: {marker}")
    copyright_notice='© 2026 이정주. 감상 링크 공유는 가능하며, 가사·해설·사이트 구성의 무단 복제·재배포·상업적 이용은 허용되지 않습니다.'
    if html.count(copyright_notice) != 1 or 'class="footer-copyright"' not in html:
        errors.append("푸터 저작권 문구 누락 또는 중복")
    if "한 권의 질문이 한 곡의 노래가 됩니다." in html:
        errors.append("교체 요청된 이전 대표 문구가 남아 있습니다.")
    for legacy_anchor in ['href="#library"','href="#interpretation"','href="#about"']:
        if legacy_anchor in html:
            errors.append(f"스크롤 방식 메뉴가 남아 있습니다: {legacy_anchor}")
    header=html.partition("</header>")[0]
    for marker in ['id="shuffle-button"','id="playlist-status"','id="playback-toggle-button"']:
        if marker not in header or html.count(marker) != 1:
            errors.append(f"상단 고정 재생 메뉴 배치 오류: {marker}")
    if 'id="play-all-button"' in html:
        errors.append("삭제 요청된 모든 노래 재생 버튼이 남아 있습니다.")
    if '<video id="main-player"' in html:
        errors.append("기본 플레이어가 영상 요소로 남아 있습니다.")
    stylesheet=(base/"styles.css").read_text(encoding="utf-8")
    for marker in [".site-header", "position: sticky", '.site-header[data-condensed="true"]', ".header-playback", '.playlist-status[data-playback-state="playing"]', ".playback-toggle-button", '[data-action="pause"]', ':not([aria-pressed="true"])', '-webkit-text-fill-color: #fff', ".hero-title-line", '.media-stage[data-media-kind="audio"]', "#video-player", 'font-family: "Pretendard"', 'url("./fonts/PretendardVariable.woff2")', '.hero-brand-image', 'background-image: url("./assets/brand-main.jpg")', '.section-jump', '.player-detail-link', 'aspect-ratio: 16 / 9', 'color: #756a5f', '.tabs button[aria-selected="true"]']:
        if marker not in stylesheet:
            errors.append(f"상단 고정 스타일 누락: {marker}")
    body_block=stylesheet.partition("body {")[2].partition("}")[0]
    if 'font-family: "Pretendard"' not in body_block:
        errors.append("본문 가독성 글꼴 적용 누락")
    if 'font-family: "Gaegu"' in stylesheet:
        errors.append("사용 중지한 손글씨 글꼴이 CSS에 남아 있습니다.")
    javascript=(base/"app.js").read_text(encoding="utf-8")
    if "playAllButton" in javascript:
        errors.append("삭제 요청된 모든 노래 재생 버튼 JavaScript 참조가 남아 있습니다.")
    for marker in ['const startPlaylist','const advancePlaylist','playlistQueue','shuffleIds','const setActiveView','addEventListener("popstate"','activeView','const setHeaderPlaybackStatus','const updatePlaybackToggle','playbackToggleButton.addEventListener("click"','현재 재생 중인 노래는','mediaStatus(track.id).key === "pending"','const audioTracks','const renderAudio','const renderVideo','state.mediaMode === "audio"','bindLocalPlayer(elements.mainPlayer, "audio")','addEventListener("pause"','const bindResponsiveHeader','librarySection.scrollIntoView']:
        if marker not in javascript:
            errors.append(f"연속 재생 기능 누락: {marker}")
    text_files=[p for p in base.rglob("*") if p.is_file() and p.suffix.lower() in {".html",".css",".js",".json",".webmanifest",".svg",".txt"}]
    public_text="\n".join(p.read_text(encoding="utf-8",errors="ignore") for p in text_files)
    checks=[
        (re.compile(r"/Users/|[A-Za-z]:\\\\Users\\\\"),"로컬 경로"),
        (EMAIL,"이메일"),(PHONE,"전화번호"),(SECRET_WORDS,"비밀정보 표식"),(PROCESS_WORDS,"내부 제작 과정 문구"),
        (re.compile(r"학생.{0,12}(?:이름|학번|연락처)|학부모.{0,12}연락처|학교폭력.{0,12}(?:사안|사건)\s*번호"),"학교 민감정보"),
    ]
    for pattern,label in checks:
        matches=pattern.findall(public_text)
        if matches:
            errors.append(f"{label} 발견: {len(matches)}건")
    result=subprocess.run(["node","--check",str(base/"app.js")],capture_output=True,text=True)
    if result.returncode:
        errors.append("app.js 문법 오류: "+result.stderr.strip())
    if errors:
        print(json.dumps({"result":"FAIL","errors":errors},ensure_ascii=False,indent=2))
        raise SystemExit(1)
    print(json.dumps({"result":"PASS","tracks":len(tracks),"audio":sum(bool(v.get('audio')) for v in media.values()),"video":sum(bool(v.get('video')) for v in media.values()),"youtube":sum(bool(v.get('youtube')) for v in media.values()),"publicProcessWordingHits":0,"privacyHits":0},ensure_ascii=False,indent=2))


if __name__ == "__main__":
    main()
