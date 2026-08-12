#!/usr/bin/env python3
"""웹사이트 구조·데이터·공개 범위·미디어 연결을 검사한다."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from datetime import date
from html import escape
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
        for key in ["uploadedAt","title","book","author","question","message","hook","lyrics","meanings","narration","endingQuestion","theme"]:
            if not track.get(key):
                errors.append(f"{track.get('id')} 필드 누락: {key}")
        try:
            date.fromisoformat(str(track.get("uploadedAt", "")))
        except ValueError:
            errors.append(f"{track.get('id')} 현재 음원 업로드 날짜 오류")
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
        share_page=base/"share"/track["id"]/"index.html"
        if not share_page.is_file():
            errors.append(f"{track['id']} 곡별 공유 페이지 누락")
        else:
            share_html=share_page.read_text(encoding="utf-8")
            share_url=f"https://eunhorang.github.io/book-song/share/{track['id']}/"
            destination=f"../../?view=meaning&amp;track={track['id']}"
            for marker in [
                f'<meta property="og:title" content="{escape(track["title"], quote=True)} | 책이 노래가 될 때">',
                f'<meta property="og:description" content="{escape(track["question"], quote=True)}">',
                f'<meta property="og:url" content="{share_url}">',
                f'<link rel="canonical" href="{share_url}">',
                f'href="{destination}"',
                'content="noindex,follow"',
            ]:
                if marker not in share_html:
                    errors.append(f"{track['id']} 곡별 공유 메타데이터 누락: {marker}")
    html=(base/"index.html").read_text(encoding="utf-8")
    for marker in ['lang="ko"','id="main-content"','class="skip-link"','id="track-search"','<audio id="main-player"','<video id="video-player"','data-media-kind="empty"','class="header-playback"','aria-label="상단 노래 재생 메뉴"','id="shuffle-button"','id="repeat-one-button"','class="visually-hidden">한 곡 반복</span>','id="playlist-status"','id="playback-toggle-button"','aria-controls="main-player video-player"','data-action="unavailable"','data-playback-state="idle"','id="view-status"','id="share-status"','id="library-journal-card"','id="library-journal-status"','id="personal-library"','id="favorite-track-list"','id="recent-track-list"','id="journal-heading"','id="journal-favorite-count"','id="journal-recent-count"','id="journal-reflection-count"','id="journal-reflection-form"','id="journal-track-select"','aria-describedby="journal-track-question"','id="journal-track-question"','id="journal-reflection-input"','aria-describedby="journal-track-question journal-reflection-help journal-reflection-character-count"','id="journal-reflection-help"','maxlength="300"','id="journal-reflection-character-count"','id="save-journal-reflection"','id="delete-journal-reflection"','id="journal-reflection-list"','id="export-journal-button"','id="clear-personal-library-button"','id="clear-personal-library-dialog"','id="confirm-clear-personal-library"','id="cancel-clear-personal-library"','id="personal-library-status"','이 기기에만 저장되며 서버로 전송되지 않습니다.','data-condensed="false"','id="library-jump"','class="player-detail-link"','id="player-share-button"','id="detail-share-button"','data-view-link="library"','data-view-link="journal"','data-view-link="meaning"','data-view-link="about"','data-view-panel="home"','data-view-panel="library"','data-view-panel="journal"','data-view-panel="meaning"','data-view-panel="about"','aria-live="polite"','id="player-uploaded"','id="player-play-count"','id="detail-uploaded"','id="detail-play-count"','https://book-song-plays-api.vercel.app','class="brand-mark" src="./assets/brand-symbol.png"','class="hero-brand-image" src="./assets/brand-main.jpg"','href="./assets/favicon-64.png"','href="./fonts/PretendardVariable.woff2"']:
        if marker not in html:
            errors.append(f"HTML 접근성 표식 누락: {marker}")
    stylesheet_version=re.search(r'href="\./styles\.css\?v=([^"&]+)"',html)
    javascript_version=re.search(r'src="\./app\.js\?v=([^"&]+)"',html)
    if not stylesheet_version or not javascript_version or stylesheet_version.group(1) != javascript_version.group(1):
        errors.append("CSS와 JavaScript 캐시 버전이 없거나 서로 다릅니다.")
    if len(re.findall(r'</svg>\s*이 노래 공유하기\s*</button>', html)) != 2:
        errors.append("곡별 공유 버튼 문구가 두 화면에 정확히 한 번씩 있지 않습니다.")
    for marker in ['<span class="hero-title-line">읽고 남은 마음을</span>','<span class="hero-title-line">노래로 기억하는 공간</span>']:
        if marker not in html:
            errors.append(f"첫 화면 대표 문구 누락: {marker}")
    for marker in ['class="eyebrow hero-meta"','<span id="song-count">0</span>곡','class="hero-library-link"']:
        if marker not in html:
            errors.append(f"P0-2 첫 화면 정보 위계 누락: {marker}")
    if 'class="hero-stats"' in html or 'id="book-count"' in html:
        errors.append("P0-2에서 제거한 다중 통계 블록이 첫 화면에 남아 있습니다.")
    copyright_notice='© 2026 이정주. 감상 링크 공유는 가능하며, 가사·해설·사이트 구성의 무단 복제·재배포·상업적 이용은 허용되지 않습니다.'
    if html.count(copyright_notice) != 1 or 'class="footer-copyright"' not in html:
        errors.append("푸터 저작권 문구 누락 또는 중복")
    if "한 권의 질문이 한 곡의 노래가 됩니다." in html:
        errors.append("교체 요청된 이전 대표 문구가 남아 있습니다.")
    for legacy_anchor in ['href="#library"','href="#interpretation"','href="#about"']:
        if legacy_anchor in html:
            errors.append(f"스크롤 방식 메뉴가 남아 있습니다: {legacy_anchor}")
    header=html.partition("</header>")[0]
    for marker in ['id="shuffle-button"','id="repeat-one-button"','id="playlist-status"','id="playback-toggle-button"']:
        if marker not in header or html.count(marker) != 1:
            errors.append(f"상단 고정 재생 메뉴 배치 오류: {marker}")
    if 'id="play-all-button"' in html:
        errors.append("삭제 요청된 모든 노래 재생 버튼이 남아 있습니다.")
    if '<video id="main-player"' in html:
        errors.append("기본 플레이어가 영상 요소로 남아 있습니다.")
    stylesheet=(base/"styles.css").read_text(encoding="utf-8")
    for marker in [".site-header", "position: sticky", '--site-header-height', '.site-header[data-condensed="true"]', ".header-playback", ".repeat-one-button", '.playlist-status[data-playback-state="playing"]', 'animation: playback-record-spin', 'animation-play-state: paused', 'animation-play-state: running', '@keyframes playback-record-spin', '@media (prefers-reduced-motion: reduce)', 'animation: none !important', '--fade-content-duration: 260ms', 'animation: fade-content-enter var(--fade-content-duration)', '@keyframes fade-content-enter', ".playback-toggle-button", '[data-action="pause"]', ':not([aria-pressed="true"])', '-webkit-text-fill-color: #fff', ".hero-title-line", '.media-stage[data-media-kind="audio"]', "#video-player", 'font-family: "Pretendard"', 'url("./fonts/PretendardVariable.woff2")', '.hero-brand-image', 'background-image: url("./assets/brand-main.jpg")', '.section-jump', '.player-detail-link', '.track-share-button', '.player-actions', '.share-status', '.library-journal-card', '.journal', '.journal-summary', '.journal-privacy-note', '.personal-library', '.personal-track-list', '.personal-track-button', '.personal-track-record-button', '.journal-reflection-form', '.journal-reflection-card', '.journal-management', '.track-list', '.track-row-shell', '.track-row', '.track-row-state', '.track-favorite-button', '.clear-personal-library-dialog', '.track-meta', '.detail-source-group', 'aspect-ratio: 16 / 9', 'color: #756a5f', '.tabs button[aria-selected="true"]']:
        if marker not in stylesheet:
            errors.append(f"CSS 필수 표식 누락: {marker}")
    fade_keyframes=re.search(r"@keyframes fade-content-enter\s*\{.*?^\}",stylesheet,re.S|re.M)
    if not fade_keyframes:
        errors.append("Fade Content 키프레임을 찾을 수 없습니다.")
    elif re.search(r"(?:\bfilter\s*:|blur\s*\()",fade_keyframes.group(0),re.I):
        errors.append("Fade Content에는 흐림 효과를 사용할 수 없습니다.")

    body_block=stylesheet.partition("body {")[2].partition("}")[0]
    if 'font-family: "Pretendard"' not in body_block:
        errors.append("본문 가독성 글꼴 적용 누락")
    if 'font-family: "Gaegu"' in stylesheet:
        errors.append("사용 중지한 손글씨 글꼴이 CSS에 남아 있습니다.")
    for marker in [
        '--radius-sm: 6px',
        '--radius-md: 10px',
        '--radius-lg: 14px',
        '--shadow-raised: 0 10px 28px rgba(52, 41, 28, 0.08)',
        '--shadow-dialog: 0 18px 48px rgba(53, 29, 7, 0.18)',
    ]:
        if marker not in stylesheet:
            errors.append(f"P0-1 표면 체계 누락: {marker}")
    if "--radius-xl" in stylesheet or re.search(r"--shadow(?:-soft)?\s*:",stylesheet):
        errors.append("P0-1 이전의 과도한 모서리·그림자 토큰이 남아 있습니다.")
    if stylesheet.count("border-radius: 999px;") != 3:
        errors.append("P0-1 캡슐형 요소가 상태·개수 배지 외에 사용되고 있습니다.")
    if len(re.findall(r"^\s*box-shadow\s*:",stylesheet,re.M)) != 3:
        errors.append("P0-1 그림자가 선택 곡·공유 알림·확인 대화상자 외에 사용되고 있습니다.")
    for marker in [".eyebrow.hero-meta", ".hero-library-link", "min-height: 560px"]:
        if marker not in stylesheet:
            errors.append(f"P0-2 첫 화면 위계 CSS 누락: {marker}")
    if ".hero-stats" in stylesheet:
        errors.append("P0-2에서 제거한 첫 화면 통계 CSS가 남아 있습니다.")
    javascript=(base/"app.js").read_text(encoding="utf-8")
    for marker in [
        'const createTrackRow',
        'shell.className = "track-row-shell"',
        'shell.setAttribute("role", "listitem")',
        'button.className = "track-row"',
        'stateLabel.dataset.trackState = ""',
        'book.textContent = `《${track.book}》 · ${track.author}`',
        'const syncTrackRowStates',
        'row.dataset.playbackState = playbackState.key',
        'syncTrackRowStates();',
    ]:
        if marker not in javascript:
            errors.append(f"P0-3 요약 행 기능 누락: {marker}")
    if any(marker in javascript for marker in ['const createTrackCard', 'track-card-spotlight', 'bindTrackSpotlight']):
        errors.append("P0-3에서 제거한 큰 카드·spotlight 구현이 JavaScript에 남아 있습니다.")
    if any(marker in stylesheet for marker in ['.track-card-spotlight', '.track-card-question', '.track-card-meta', '.card-status']):
        errors.append("P0-3에서 지연 공개한 카드 세부 정보·장식 CSS가 남아 있습니다.")
    row_renderer=javascript.partition("const createTrackRow")[2].partition("const renderLibrary")[0]
    if any(marker in row_renderer for marker in ['uploadedLabel(', 'playCountLabel(', 'track.question', 'status.label']):
        errors.append("P0-3 요약 행에 업로드일·재생수·핵심 질문·음원 상태가 노출됩니다.")
    if "playAllButton" in javascript:
        errors.append("삭제 요청된 모든 노래 재생 버튼 JavaScript 참조가 남아 있습니다.")
    if 'aria-label="책이 노래가 될 때 처음 화면"' in html:
        errors.append("브랜드의 보이는 문구를 덮는 접근성 이름이 남아 있습니다.")
    if "random-label-optional" in html or "random-label-optional" in stylesheet:
        errors.append("화면 폭에 따라 달라지는 랜덤 재생 문구가 남아 있습니다.")
    if "cardAccessibleLabel" in javascript or 'card.setAttribute("aria-label"' in javascript or 'button.setAttribute("aria-label", card' in javascript:
        errors.append("곡 카드의 보이는 전체 문구를 덮는 접근성 이름이 남아 있습니다.")
    if '`랜덤 재생: 현재 재생 가능한 보관 음원 ${available.length}곡' not in javascript:
        errors.append("랜덤 재생의 보이는 문구가 접근성 이름에 포함되지 않았습니다.")
    for marker in [
        'journal: "나의 기록"',
        'PERSONAL_REFLECTIONS_KEY = "book-song:reflections:v1"',
        'REFLECTION_CHARACTER_LIMIT = 300',
        'localStorage.getItem(PERSONAL_REFLECTIONS_KEY)',
        'localStorage.setItem(PERSONAL_REFLECTIONS_KEY',
        'localStorage.removeItem(PERSONAL_REFLECTIONS_KEY)',
        'const renderJournalReflections',
        'const saveJournalReflection',
        'const deleteJournalReflection',
        'const exportJournalMarkdown',
        'let journalEditorDirty = false',
        'const requestJournalTrackSelection',
        'journalEditorDirty && trackId === journalEditorTrackId',
        '저장하지 않은 한 줄이 있습니다. 다른 노래로 이동할까요?',
        'if (!journalEditorDirty)',
        'if (event.key === null)',
        'clearPersonalLibraryDialog.addEventListener("cancel"',
        'addEventListener("beforeunload"',
        'if (track.id === state.selectedId) updateUrl(track.id)',
        'new Blob(',
        'URL.createObjectURL(',
        'URL.revokeObjectURL('
    ]:
        if marker not in javascript:
            errors.append(f"나의 기록 기능 누락: {marker}")
    for marker in ['const startPlaylist','const advancePlaylist','playlistQueue','shuffleIds','repeatOne: false','repeatOneButton','const syncRepeatOneToPlayers','player.loop = Boolean(','!state.repeatOne &&','playbackQualification.lastMediaTime > player.currentTime + 1','setRepeatOneState(false)','mode === "audio" && !state.repeatOne','const setActiveView','addEventListener("popstate"','activeView','const setHeaderPlaybackStatus','const updatePlaybackToggle','playbackToggleButton.addEventListener("click"','현재 재생 중인 노래는','mediaStatus(track.id).key === "pending"','const audioTracks','const renderAudio','const renderVideo','state.mediaMode === "audio"','bindLocalPlayer(elements.mainPlayer, "audio")','addEventListener("pause"','player.addEventListener("playing"','const bindResponsiveHeader','const updateHeaderMetrics','new ResizeObserver(schedule)','librarySection.scrollIntoView','PLAY_QUALIFICATION_SECONDS = 30','PLAY_COUNTS_ENDPOINT','const loadPlayCounts','const recordQualifiedPlay','const updatePlaybackQualification','credentials: "omit"','addEventListener("timeupdate"','addEventListener("seeking"','uploadedLabel(track)','const normalizeRequestedTrackId','requested !== null && requested !== initialTrack.id','selectTrack(initialTrack.id, { updateUrl: shouldNormalizeUrl })','const shareUrlForTrack','const showShareStatus','shareInProgress','aria-disabled','navigator.share','navigator.clipboard.writeText','document.execCommand("copy")','error.name === "AbortError"','링크를 복사했습니다','공유를 취소했습니다','PERSONAL_LIBRARY_KEY = "book-song:personal-library:v1"','RECENT_TRACK_LIMIT = 6','favorites: []','recent: []','localStorage.getItem(PERSONAL_LIBRARY_KEY)','localStorage.setItem(PERSONAL_LIBRARY_KEY','localStorage.removeItem(PERSONAL_LIBRARY_KEY)','window.addEventListener("storage"','const toggleFavorite','const recordRecentTrack','const clearPersonalLibrary','const openClearPersonalLibraryDialog','favoriteButton.setAttribute("aria-pressed"','recordRecentTrack(state.selectedId)','event.stopPropagation()','shell.append(button, favoriteButton)','(prefers-reduced-motion: reduce)']:
        if marker not in javascript:
            errors.append(f"JavaScript 기능 누락: {marker}")
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
