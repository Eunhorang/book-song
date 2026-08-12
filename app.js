(() => {
  "use strict";

  const state = {
    tracks: [],
    media: {},
    selectedId: null,
    mediaMode: null,
    query: "",
    filter: "all",
    playlistMode: null,
    playlistQueue: [],
    playlistIndex: -1,
    repeatOne: false,
    activeView: "home",
    playCounts: {},
    playCountsStatus: "loading",
    personalLibrary: {
      favorites: [],
      recent: [],
    },
    personalReflections: {},
    personalStorageAvailable: true,
    reflectionStorageAvailable: true,
  };

  const VIEW_LABELS = {
    home: "처음",
    library: "음악 보관함",
    journal: "나의 기록",
    meaning: "가사와 의미",
    about: "프로젝트 소개",
  };

  const PLAY_COUNTS_ENDPOINT = "https://book-song-plays-api.vercel.app/api/plays";
  const PLAY_QUALIFICATION_SECONDS = 30;
  const PLAY_RETRY_DELAYS = [3000, 10000];
  const PERSONAL_LIBRARY_KEY = "book-song:personal-library:v1";
  const PERSONAL_REFLECTIONS_KEY = "book-song:reflections:v1";
  const RECENT_TRACK_LIMIT = 6;
  const REFLECTION_CHARACTER_LIMIT = 300;
  const playCountFormatter = new Intl.NumberFormat("ko-KR");
  let playbackQualification = null;
  let shareStatusTimer = null;
  let shareInProgress = false;
  let journalEditorDirty = false;
  let journalEditorTrackId = null;

  const elements = {
    siteHeader: document.querySelector(".site-header"),
    songCount: document.querySelector("#song-count"),
    heroListen: document.querySelector("#hero-listen"),
    playerCard: document.querySelector("#player-card"),
    selectionStatus: document.querySelector("#selection-status"),
    cover: document.querySelector("#track-cover"),
    coverNumber: document.querySelector("#cover-number"),
    coverTitle: document.querySelector("#cover-title"),
    coverBook: document.querySelector("#cover-book"),
    playerStatus: document.querySelector("#player-status"),
    playerNumber: document.querySelector("#player-number"),
    playerTitle: document.querySelector("#player-title"),
    playerBook: document.querySelector("#player-book"),
    playerUploaded: document.querySelector("#player-uploaded"),
    playerPlayCount: document.querySelector("#player-play-count"),
    playerMessage: document.querySelector("#player-message"),
    playerHook: document.querySelector("#player-hook"),
    shareButtons: Array.from(document.querySelectorAll("[data-share-track]")),
    shareStatus: document.querySelector("#share-status"),
    sourceSwitch: document.querySelector("#source-switch"),
    mediaStage: document.querySelector("#media-stage"),
    mainPlayer: document.querySelector("#main-player"),
    videoPlayer: document.querySelector("#video-player"),
    youtubeStage: document.querySelector("#youtube-stage"),
    mediaEmpty: document.querySelector("#media-empty"),
    shuffleButton: document.querySelector("#shuffle-button"),
    repeatOneButton: document.querySelector("#repeat-one-button"),
    playlistStatus: document.querySelector("#playlist-status"),
    playbackToggleButton: document.querySelector("#playback-toggle-button"),
    playbackToggleLabel: document.querySelector("#playback-toggle-label"),
    playbackPauseIcon: document.querySelector('[data-playback-icon="pause"]'),
    playbackPlayIcon: document.querySelector('[data-playback-icon="play"]'),
    libraryJump: document.querySelector("#library-jump"),
    librarySection: document.querySelector("#library"),
    libraryHeading: document.querySelector("#library-heading"),
    trackSearch: document.querySelector("#track-search"),
    statusFilter: document.querySelector("#status-filter"),
    trackGrid: document.querySelector("#track-grid"),
    resultCount: document.querySelector("#result-count"),
    noResults: document.querySelector("#no-results"),
    libraryJournalStatus: document.querySelector("#library-journal-status"),
    personalLibraryHeading: document.querySelector("#personal-library-heading"),
    personalLibraryStatus: document.querySelector("#personal-library-status"),
    favoriteTrackList: document.querySelector("#favorite-track-list"),
    favoriteTrackCount: document.querySelector("#favorite-track-count"),
    recentTrackList: document.querySelector("#recent-track-list"),
    recentTrackCount: document.querySelector("#recent-track-count"),
    clearPersonalLibraryButton: document.querySelector("#clear-personal-library-button"),
    clearPersonalLibraryDialog: document.querySelector("#clear-personal-library-dialog"),
    confirmClearPersonalLibrary: document.querySelector("#confirm-clear-personal-library"),
    cancelClearPersonalLibrary: document.querySelector("#cancel-clear-personal-library"),
    journalFavoriteCount: document.querySelector("#journal-favorite-count"),
    journalRecentCount: document.querySelector("#journal-recent-count"),
    journalReflectionCount: document.querySelector("#journal-reflection-count"),
    journalReflectionForm: document.querySelector("#journal-reflection-form"),
    journalTrackSelect: document.querySelector("#journal-track-select"),
    journalTrackQuestion: document.querySelector("#journal-track-question"),
    journalReflectionInput: document.querySelector("#journal-reflection-input"),
    journalReflectionCharacterCount: document.querySelector("#journal-reflection-character-count"),
    saveJournalReflection: document.querySelector("#save-journal-reflection"),
    deleteJournalReflection: document.querySelector("#delete-journal-reflection"),
    journalReflectionList: document.querySelector("#journal-reflection-list"),
    exportJournalButton: document.querySelector("#export-journal-button"),
    detailNumber: document.querySelector("#detail-number"),
    detailTitle: document.querySelector("#detail-title"),
    detailSource: document.querySelector("#detail-source"),
    detailUploaded: document.querySelector("#detail-uploaded"),
    detailPlayCount: document.querySelector("#detail-play-count"),
    lyricsText: document.querySelector("#lyrics-text"),
    meaningGrid: document.querySelector("#meaning-grid"),
    detailQuestion: document.querySelector("#detail-question"),
    detailMessage: document.querySelector("#detail-message"),
    detailNarration: document.querySelector("#detail-narration"),
    detailEnding: document.querySelector("#detail-ending"),
    tabs: Array.from(document.querySelectorAll('[role="tab"]')),
    panels: Array.from(document.querySelectorAll('[role="tabpanel"]')),
    viewStatus: document.querySelector("#view-status"),
    viewLinks: Array.from(document.querySelectorAll("[data-view-link]")),
    viewPanels: Array.from(document.querySelectorAll("[data-view-panel]")),
  };

  const text = (element, value) => {
    element.textContent = value || "";
  };

  const selectedTrack = () => state.tracks.find((track) => track.id === state.selectedId);

  const uploadedLabel = (track) => {
    const value = typeof track?.uploadedAt === "string" ? track.uploadedAt : "";
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `업로드 ${value.replaceAll("-", ".")}` : "업로드 날짜 확인 중";
  };

  const playCountLabel = (trackId) => {
    const value = Number(state.playCounts[trackId]);
    if (state.playCountsStatus !== "ready" || !Number.isSafeInteger(value) || value < 0) {
      return state.playCountsStatus === "unavailable" ? "누적 재생 연결 대기" : "누적 재생 확인 중";
    }
    return `누적 재생 ${playCountFormatter.format(value)}회`;
  };

  const updatePlayCountViews = () => {
    const track = selectedTrack();
    if (track) {
      text(elements.playerUploaded, uploadedLabel(track));
      text(elements.playerPlayCount, playCountLabel(track.id));
      text(elements.detailUploaded, uploadedLabel(track));
      text(elements.detailPlayCount, playCountLabel(track.id));
    }
    for (const card of elements.trackGrid.querySelectorAll(".track-card[data-track-id]")) {
      const cardTrack = state.tracks.find((item) => item.id === card.dataset.trackId);
      if (!cardTrack) continue;
      const count = card.querySelector("[data-play-count]");
      if (count) text(count, playCountLabel(cardTrack.id));
    }
  };

  const normalizeRequestedTrackId = (value) =>
    typeof value === "string" && /^\d{1,2}$/.test(value) ? value.padStart(2, "0") : value;

  const shareUrlForTrack = (track) => new URL(`share/${track.id}/`, new URL("./", window.location.href)).href;

  const sharePayloadForTrack = (track) => ({
    title: `${track.title} | 책이 노래가 될 때`,
    text: `〈${track.title}〉\n${track.question}\n\n책이 남긴 질문을 노래로 만나 보세요.`,
    url: shareUrlForTrack(track),
  });

  const updateShareButtons = (track) => {
    for (const button of elements.shareButtons) {
      button.disabled = !track;
      button.removeAttribute("aria-busy");
      button.removeAttribute("aria-disabled");
      if (!track) {
        button.setAttribute("aria-label", "이 노래 공유하기");
        button.removeAttribute("title");
        continue;
      }
      const label = `이 노래 공유하기: 〈${track.title}〉`;
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
    }
  };

  const showShareStatus = (message) => {
    window.clearTimeout(shareStatusTimer);
    text(elements.shareStatus, message);
    elements.shareStatus.dataset.visible = "true";
    shareStatusTimer = window.setTimeout(() => {
      elements.shareStatus.dataset.visible = "false";
    }, 4000);
  };

  const copyWithTemporaryInput = (value) => {
    const input = document.createElement("textarea");
    input.className = "clipboard-copy-helper";
    input.value = value;
    input.setAttribute("readonly", "");
    document.body.append(input);
    input.select();
    input.setSelectionRange(0, input.value.length);
    const copied = document.execCommand("copy");
    input.remove();
    if (!copied) throw new Error("copy-command-failed");
  };

  const copyShareUrl = async (value) => {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(value);
        return;
      } catch (error) {
        // 브라우저 권한이 없을 때 동기식 복사 방식으로 한 번 더 시도한다.
      }
    }
    copyWithTemporaryInput(value);
  };

  const shouldUseNativeShare = () =>
    typeof navigator.share === "function" &&
    (navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches);

  const shareSelectedTrack = async () => {
    const track = selectedTrack();
    if (!track || shareInProgress) return;
    shareInProgress = true;
    const payload = sharePayloadForTrack(track);
    for (const button of elements.shareButtons) {
      button.setAttribute("aria-disabled", "true");
      button.setAttribute("aria-busy", "true");
    }
    try {
      if (shouldUseNativeShare()) {
        try {
          await navigator.share(payload);
          showShareStatus(`〈${track.title}〉 공유를 완료했습니다.`);
          return;
        } catch (error) {
          if (error.name === "AbortError") {
            showShareStatus(`〈${track.title}〉 공유를 취소했습니다.`);
            return;
          }
        }
      }
      await copyShareUrl(payload.url);
      showShareStatus(`〈${track.title}〉 링크를 복사했습니다.`);
    } catch (error) {
      showShareStatus("링크를 복사하지 못했습니다. 주소 표시줄의 링크를 복사해 주세요.");
    } finally {
      shareInProgress = false;
      updateShareButtons(selectedTrack());
    }
  };

  const emptyPersonalLibrary = () => ({ favorites: [], recent: [] });

  const normalizePersonalTrackIds = (values) => {
    if (!Array.isArray(values)) return [];
    const validIds = new Set(state.tracks.map((track) => track.id));
    const normalizedIds = [];
    for (const value of values) {
      const normalized = normalizeRequestedTrackId(String(value));
      if (!validIds.has(normalized) || normalizedIds.includes(normalized)) continue;
      normalizedIds.push(normalized);
    }
    return normalizedIds;
  };

  const parsePersonalLibrary = (rawValue) => {
    if (!rawValue) return emptyPersonalLibrary();
    try {
      const parsed = JSON.parse(rawValue);
      return {
        favorites: normalizePersonalTrackIds(parsed?.favorites),
        recent: normalizePersonalTrackIds(parsed?.recent).slice(0, RECENT_TRACK_LIMIT),
      };
    } catch (error) {
      return emptyPersonalLibrary();
    }
  };

  const personalLibraryIsEmpty = () =>
    state.personalLibrary.favorites.length === 0 && state.personalLibrary.recent.length === 0;

  const reflectionEntries = () =>
    Object.entries(state.personalReflections)
      .map(([trackId, reflection]) => ({
        track: state.tracks.find((track) => track.id === trackId),
        reflection,
      }))
      .filter((item) => item.track)
      .sort((left, right) => right.reflection.updatedAt.localeCompare(left.reflection.updatedAt));

  const personalRecordsAreEmpty = () =>
    personalLibraryIsEmpty() && reflectionEntries().length === 0;

  const setPersonalLibraryStatus = (message, kind = "notice") => {
    for (const status of [elements.personalLibraryStatus, elements.libraryJournalStatus]) {
      text(status, message);
      if (message) status.dataset.kind = kind;
      else status.removeAttribute("data-kind");
    }
  };

  const loadPersonalLibrary = () => {
    try {
      state.personalLibrary = parsePersonalLibrary(localStorage.getItem(PERSONAL_LIBRARY_KEY));
      state.personalStorageAvailable = true;
    } catch (error) {
      state.personalLibrary = emptyPersonalLibrary();
      state.personalStorageAvailable = false;
    }
  };

  const persistPersonalLibrary = () => {
    try {
      if (personalLibraryIsEmpty()) {
        localStorage.removeItem(PERSONAL_LIBRARY_KEY);
      } else {
        localStorage.setItem(PERSONAL_LIBRARY_KEY, JSON.stringify(state.personalLibrary));
      }
      state.personalStorageAvailable = true;
      return true;
    } catch (error) {
      state.personalStorageAvailable = false;
      return false;
    }
  };

  const normalizePersonalReflections = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const validIds = new Set(state.tracks.map((track) => track.id));
    const normalized = {};
    for (const [rawTrackId, entry] of Object.entries(value)) {
      const trackId = normalizeRequestedTrackId(String(rawTrackId));
      if (!validIds.has(trackId)) continue;
      const rawText = typeof entry === "string" ? entry : entry?.text;
      const reflectionText = typeof rawText === "string"
        ? rawText.trim().slice(0, REFLECTION_CHARACTER_LIMIT)
        : "";
      if (!reflectionText) continue;
      const rawUpdatedAt = typeof entry === "object" && typeof entry?.updatedAt === "string"
        ? entry.updatedAt
        : "";
      const updatedAt = Number.isNaN(Date.parse(rawUpdatedAt)) ? "" : rawUpdatedAt;
      normalized[trackId] = { text: reflectionText, updatedAt };
    }
    return normalized;
  };

  const parsePersonalReflections = (rawValue) => {
    if (!rawValue) return {};
    try {
      return normalizePersonalReflections(JSON.parse(rawValue));
    } catch (error) {
      return {};
    }
  };

  const loadPersonalReflections = () => {
    try {
      state.personalReflections = parsePersonalReflections(localStorage.getItem(PERSONAL_REFLECTIONS_KEY));
      state.reflectionStorageAvailable = true;
    } catch (error) {
      state.personalReflections = {};
      state.reflectionStorageAvailable = false;
    }
  };

  const persistPersonalReflections = () => {
    try {
      if (reflectionEntries().length === 0) {
        localStorage.removeItem(PERSONAL_REFLECTIONS_KEY);
      } else {
        localStorage.setItem(PERSONAL_REFLECTIONS_KEY, JSON.stringify(state.personalReflections));
      }
      state.reflectionStorageAvailable = true;
      return true;
    } catch (error) {
      state.reflectionStorageAvailable = false;
      return false;
    }
  };

  const openTrackInLibrary = (trackId) => {
    const track = state.tracks.find((item) => item.id === trackId);
    if (!track) return;
    setActiveView("library", { historyMode: "push", focus: true });
    if (track.id === state.selectedId) updateUrl(track.id);
    else selectTrack(track.id, { updateUrl: true });
  };

  const createPersonalTrackButton = (track) => {
    const row = document.createElement("div");
    row.className = "personal-track-row";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "personal-track-button";
    button.dataset.personalTrackId = track.id;

    const number = document.createElement("span");
    number.className = "personal-track-number";
    number.textContent = `TRACK ${track.id}`;
    const title = document.createElement("span");
    title.className = "personal-track-title";
    title.textContent = track.title;
    button.append(number, title);

    button.addEventListener("click", () => openTrackInLibrary(track.id));

    const recordButton = document.createElement("button");
    recordButton.type = "button";
    recordButton.className = "personal-track-record-button";
    recordButton.textContent = state.personalReflections[track.id] ? "한 줄 보기" : "한 줄 쓰기";
    recordButton.setAttribute("aria-label", `${recordButton.textContent}: 〈${track.title}〉`);
    recordButton.addEventListener("click", () => requestJournalTrackSelection(track.id, { focus: true }));

    row.append(button, recordButton);
    return row;
  };

  const renderPersonalTrackList = (container, ids, emptyMessage) => {
    const tracks = ids
      .map((id) => state.tracks.find((track) => track.id === id))
      .filter(Boolean);
    if (tracks.length > 0) {
      container.replaceChildren(...tracks.map(createPersonalTrackButton));
      return;
    }
    const empty = document.createElement("p");
    empty.className = "personal-empty";
    empty.textContent = emptyMessage;
    container.replaceChildren(empty);
  };

  const updateReflectionCharacterCount = () => {
    const count = elements.journalReflectionInput.value.length;
    text(elements.journalReflectionCharacterCount, `${count}/${REFLECTION_CHARACTER_LIMIT}`);
  };

  const selectJournalTrack = (trackId, options = {}) => {
    const track = state.tracks.find((item) => item.id === trackId) || state.tracks[0];
    if (!track) return;
    journalEditorTrackId = track.id;
    journalEditorDirty = false;
    elements.journalTrackSelect.value = track.id;
    text(elements.journalTrackQuestion, track.question);
    const reflection = state.personalReflections[track.id]?.text || "";
    elements.journalReflectionInput.value = reflection;
    elements.journalReflectionInput.setCustomValidity("");
    elements.deleteJournalReflection.disabled = !reflection;
    text(elements.saveJournalReflection, reflection ? "한 줄 고쳐 저장하기" : "한 줄 저장하기");
    updateReflectionCharacterCount();
    if (options.focus) {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      elements.journalReflectionInput.scrollIntoView({
        block: "center",
        behavior: reducedMotion ? "auto" : "smooth",
      });
      elements.journalReflectionInput.focus({ preventScroll: true });
    }
  };

  const requestJournalTrackSelection = (trackId, options = {}) => {
    if (journalEditorDirty && trackId === journalEditorTrackId) {
      if (options.focus) {
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        elements.journalReflectionInput.scrollIntoView({
          block: "center",
          behavior: reducedMotion ? "auto" : "smooth",
        });
        elements.journalReflectionInput.focus({ preventScroll: true });
      }
      return true;
    }
    if (
      journalEditorDirty &&
      journalEditorTrackId &&
      !window.confirm("저장하지 않은 한 줄이 있습니다. 다른 노래로 이동할까요?")
    ) {
      elements.journalTrackSelect.value = journalEditorTrackId;
      return false;
    }
    selectJournalTrack(trackId, options);
    return true;
  };

  const initializeJournalEditor = () => {
    const options = state.tracks.map((track) => {
      const option = document.createElement("option");
      option.value = track.id;
      option.textContent = `${track.id}. ${track.title}`;
      return option;
    });
    elements.journalTrackSelect.replaceChildren(...options);
    selectJournalTrack(state.selectedId || state.tracks[0]?.id);
  };

  const reflectionDateLabel = (value) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "저장 날짜 확인 불가";
    return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(parsed);
  };

  const createJournalReflectionCard = ({ track, reflection }) => {
    const article = document.createElement("article");
    article.className = "journal-reflection-card";

    const header = document.createElement("div");
    header.className = "journal-reflection-card-header";
    const headingGroup = document.createElement("div");
    const number = document.createElement("span");
    number.textContent = `TRACK ${track.id}`;
    const heading = document.createElement("h4");
    heading.textContent = track.title;
    headingGroup.append(number, heading);
    const savedAt = document.createElement("time");
    if (reflection.updatedAt) savedAt.dateTime = reflection.updatedAt;
    savedAt.textContent = reflectionDateLabel(reflection.updatedAt);
    header.append(headingGroup, savedAt);

    const quote = document.createElement("blockquote");
    quote.textContent = reflection.text;

    const actions = document.createElement("div");
    actions.className = "journal-reflection-card-actions";
    const playButton = document.createElement("button");
    playButton.type = "button";
    playButton.textContent = "이 노래 듣기";
    playButton.addEventListener("click", () => openTrackInLibrary(track.id));
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "한 줄 고치기";
    editButton.addEventListener("click", () => requestJournalTrackSelection(track.id, { focus: true }));
    actions.append(playButton, editButton);

    article.append(header, quote, actions);
    return article;
  };

  const renderJournalReflections = () => {
    const entries = reflectionEntries();
    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "personal-empty journal-reflection-empty";
      empty.textContent = "아직 남긴 문장이 없습니다. 마음에 남은 곡을 골라 첫 문장을 적어 보세요.";
      elements.journalReflectionList.replaceChildren(empty);
      return;
    }
    elements.journalReflectionList.replaceChildren(...entries.map(createJournalReflectionCard));
  };

  const saveJournalReflection = () => {
    const track = state.tracks.find((item) => item.id === elements.journalTrackSelect.value);
    if (!track) return;
    const reflectionText = elements.journalReflectionInput.value.replace(/\s+/g, " ").trim();
    if (!reflectionText) {
      elements.journalReflectionInput.setCustomValidity("남기고 싶은 문장을 입력해 주세요.");
      elements.journalReflectionInput.reportValidity();
      return;
    }
    elements.journalReflectionInput.setCustomValidity("");
    state.personalReflections[track.id] = {
      text: reflectionText.slice(0, REFLECTION_CHARACTER_LIMIT),
      updatedAt: new Date().toISOString(),
    };
    const saved = persistPersonalReflections();
    renderPersonalLibrary();
    selectJournalTrack(track.id);
    setPersonalLibraryStatus(
      saved
        ? `〈${track.title}〉에 남긴 한 줄을 이 브라우저에 저장했습니다.`
        : `〈${track.title}〉의 한 줄을 현재 화면에만 저장했습니다. 브라우저 설정 때문에 다음 방문에는 유지되지 않을 수 있습니다.`,
      saved ? "notice" : "warning",
    );
  };

  const deleteJournalReflection = () => {
    const track = state.tracks.find((item) => item.id === elements.journalTrackSelect.value);
    if (!track || !state.personalReflections[track.id]) return;
    if (!window.confirm(`〈${track.title}〉에 남긴 한 줄을 이 기기에서 지울까요?`)) return;
    delete state.personalReflections[track.id];
    const deleted = persistPersonalReflections();
    renderPersonalLibrary();
    selectJournalTrack(track.id);
    setPersonalLibraryStatus(
      deleted
        ? `〈${track.title}〉에 남긴 한 줄을 지웠습니다.`
        : "현재 화면의 한 줄은 지웠지만 브라우저 저장소를 변경하지 못했습니다.",
      deleted ? "notice" : "warning",
    );
  };

  const markdownTrackList = (ids, emptyMessage) => {
    const lines = ids
      .map((id) => state.tracks.find((track) => track.id === id))
      .filter(Boolean)
      .map((track) => `- ${track.id}. 〈${track.title}〉 — ${track.author} 《${track.book}》`);
    return lines.length > 0 ? lines : [`- ${emptyMessage}`];
  };

  const exportJournalMarkdown = () => {
    if (personalRecordsAreEmpty()) return;
    const today = new Intl.DateTimeFormat("sv-SE").format(new Date());
    const lines = [
      "# 나만의 노래 기록",
      "",
      `- 내보낸 날짜: ${today}`,
      "- 저장 범위: 이 브라우저의 개인 감상 기록",
      "",
      "## 마음에 담은 노래",
      "",
      ...markdownTrackList(state.personalLibrary.favorites, "아직 마음에 담은 노래가 없습니다."),
      "",
      "## 최근 들은 노래",
      "",
      ...markdownTrackList(state.personalLibrary.recent, "아직 최근 들은 노래가 없습니다."),
      "",
      "## 내가 남긴 한 줄",
      "",
    ];
    const entries = reflectionEntries();
    if (entries.length === 0) {
      lines.push("아직 남긴 문장이 없습니다.");
    } else {
      for (const { track, reflection } of entries) {
        lines.push(`### ${track.id}. ${track.title}`, "", `> ${reflection.text}`, "", `- 마지막 저장: ${reflectionDateLabel(reflection.updatedAt)}`, "");
      }
    }
    const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/markdown;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `나만의-노래-기록-${today}.md`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
    setPersonalLibraryStatus("나의 노래 기록을 Markdown 파일로 내보냈습니다.");
  };

  const syncFavoriteButtons = () => {
    const favoriteIds = new Set(state.personalLibrary.favorites);
    for (const favoriteButton of document.querySelectorAll("[data-favorite-track]")) {
      const track = state.tracks.find((item) => item.id === favoriteButton.dataset.favoriteTrack);
      if (!track) continue;
      const isFavorite = favoriteIds.has(track.id);
      const label = isFavorite ? "마음에서 빼기" : "마음에 담기";
      favoriteButton.setAttribute("aria-pressed", isFavorite ? "true" : "false");
      favoriteButton.setAttribute("aria-label", `${label}: 〈${track.title}〉`);
      const labelElement = favoriteButton.querySelector("[data-favorite-label]");
      if (labelElement) labelElement.textContent = label;
    }
  };

  const renderPersonalLibrary = () => {
    renderPersonalTrackList(
      elements.favoriteTrackList,
      state.personalLibrary.favorites,
      "아직 마음에 담은 노래가 없습니다.",
    );
    renderPersonalTrackList(
      elements.recentTrackList,
      state.personalLibrary.recent,
      "노래를 재생하면 최근 들은 순서로 표시됩니다.",
    );
    const reflectionCount = reflectionEntries().length;
    text(elements.favoriteTrackCount, `${state.personalLibrary.favorites.length}곡`);
    text(elements.recentTrackCount, `${state.personalLibrary.recent.length}곡`);
    text(elements.journalFavoriteCount, `${state.personalLibrary.favorites.length}곡`);
    text(elements.journalRecentCount, `${state.personalLibrary.recent.length}곡`);
    text(elements.journalReflectionCount, `${reflectionCount}개`);
    text(
      elements.libraryJournalStatus,
      `마음에 담은 노래 ${state.personalLibrary.favorites.length}곡 · 최근 들은 노래 ${state.personalLibrary.recent.length}곡 · 남긴 한 줄 ${reflectionCount}개`,
    );
    elements.clearPersonalLibraryButton.disabled = personalRecordsAreEmpty();
    elements.exportJournalButton.disabled = personalRecordsAreEmpty();
    renderJournalReflections();
    syncFavoriteButtons();
  };

  const toggleFavorite = (trackId) => {
    const track = state.tracks.find((item) => item.id === trackId);
    if (!track) return;
    const wasFavorite = state.personalLibrary.favorites.includes(track.id);
    state.personalLibrary.favorites = wasFavorite
      ? state.personalLibrary.favorites.filter((id) => id !== track.id)
      : [track.id, ...state.personalLibrary.favorites];
    const saved = persistPersonalLibrary();
    renderPersonalLibrary();
    const action = wasFavorite ? "마음에서 뺐습니다" : "마음에 담았습니다";
    setPersonalLibraryStatus(
      saved
        ? `〈${track.title}〉: ${action}.`
        : `〈${track.title}〉: 현재 화면에서 ${action}. 브라우저 설정 때문에 다음 방문에는 유지되지 않을 수 있습니다.`,
      saved ? "notice" : "warning",
    );
  };

  const recordRecentTrack = (trackId) => {
    const track = state.tracks.find((item) => item.id === trackId);
    if (!track) return;
    const recent = [track.id, ...state.personalLibrary.recent.filter((id) => id !== track.id)]
      .slice(0, RECENT_TRACK_LIMIT);
    if (recent.every((id, index) => id === state.personalLibrary.recent[index])) return;
    state.personalLibrary.recent = recent;
    const saved = persistPersonalLibrary();
    renderPersonalLibrary();
    if (!saved) {
      setPersonalLibraryStatus(
        "브라우저 설정 때문에 최근 들은 노래를 이 기기에 저장하지 못했습니다. 현재 화면에서만 유지됩니다.",
        "warning",
      );
    }
  };

  const clearPersonalLibrary = () => {
    state.personalLibrary = emptyPersonalLibrary();
    state.personalReflections = {};
    const libraryCleared = persistPersonalLibrary();
    const reflectionsCleared = persistPersonalReflections();
    renderPersonalLibrary();
    selectJournalTrack(elements.journalTrackSelect.value || state.selectedId);
    const cleared = libraryCleared && reflectionsCleared;
    setPersonalLibraryStatus(
      cleared
        ? "이 기기의 마음에 담은 노래, 최근 들은 노래와 한 줄 기록을 모두 지웠습니다."
        : "현재 화면의 기록은 지웠지만 브라우저 저장소 일부를 변경하지 못했습니다.",
      cleared ? "notice" : "warning",
    );
  };

  const openClearPersonalLibraryDialog = () => {
    if (elements.clearPersonalLibraryButton.disabled) return;
    if (typeof elements.clearPersonalLibraryDialog.showModal === "function") {
      elements.clearPersonalLibraryDialog.showModal();
      elements.cancelClearPersonalLibrary.focus();
      return;
    }
    if (window.confirm("마음에 담은 노래, 최근 들은 노래와 한 줄 기록을 이 기기에서 모두 지울까요?")) {
      clearPersonalLibrary();
      elements.personalLibraryHeading.focus({ preventScroll: true });
    }
  };

  const syncPersonalLibraryFromStorage = (event) => {
    if (state.tracks.length === 0) return;
    let reflectionConflict = false;
    if (event.key === null) {
      const previousText = state.personalReflections[journalEditorTrackId]?.text || "";
      state.personalLibrary = emptyPersonalLibrary();
      state.personalReflections = {};
      reflectionConflict = journalEditorDirty && Boolean(previousText);
      state.personalStorageAvailable = true;
      state.reflectionStorageAvailable = true;
      if (!journalEditorDirty) {
        selectJournalTrack(elements.journalTrackSelect.value || state.selectedId);
      }
    } else if (event.key === PERSONAL_LIBRARY_KEY) {
      state.personalLibrary = parsePersonalLibrary(event.newValue);
      state.personalStorageAvailable = true;
    } else if (event.key === PERSONAL_REFLECTIONS_KEY) {
      const previousText = state.personalReflections[journalEditorTrackId]?.text || "";
      state.personalReflections = parsePersonalReflections(event.newValue);
      const nextText = state.personalReflections[journalEditorTrackId]?.text || "";
      reflectionConflict = journalEditorDirty && previousText !== nextText;
      state.reflectionStorageAvailable = true;
      if (!journalEditorDirty) {
        selectJournalTrack(elements.journalTrackSelect.value || state.selectedId);
      }
    } else {
      return;
    }
    renderPersonalLibrary();
    setPersonalLibraryStatus(
      reflectionConflict
        ? "다른 탭에서 같은 곡의 한 줄이 바뀌었습니다. 현재 초안은 유지되며, 저장하면 다른 탭의 문장을 덮어씁니다."
        : journalEditorDirty
          ? "다른 탭의 변경을 목록에 반영했습니다. 지금 입력 중인 문장은 저장하기 전까지 편집창에 유지됩니다."
          : "다른 탭에서 바뀐 이 기기의 노래 기록을 반영했습니다.",
      reflectionConflict ? "warning" : "notice",
    );
  };

  const normalizeView = (value) => (Object.hasOwn(VIEW_LABELS, value) ? value : "home");

  const viewFromLocation = () => {
    const url = new URL(window.location.href);
    const requested = url.searchParams.get("view");
    if (requested && Object.hasOwn(VIEW_LABELS, requested)) return requested;
    const legacyViews = {
      "#library": "library",
      "#listen": "library",
      "#interpretation": "meaning",
      "#about": "about",
      "#top": "home",
    };
    if (legacyViews[url.hash]) return legacyViews[url.hash];
    return url.searchParams.has("track") ? "library" : "home";
  };

  const setMetaContent = (selector, value) => {
    document.querySelector(selector)?.setAttribute("content", value);
  };

  const updateDocumentTitle = () => {
    const track = selectedTrack();
    const viewUrl = new URL("./", window.location.href);
    let documentTitle = "책이 노래가 될 때";
    let socialTitle = documentTitle;
    let description = "책을 요약하지 않습니다. 한 권이 남긴 질문을 노래합니다.";
    let canonicalUrl = viewUrl.href;

    if (state.activeView === "library") {
      documentTitle = "음악 보관함 | 책이 노래가 될 때";
      socialTitle = documentTitle;
      description = "책이 남긴 질문을 노래로 만나는 이정주의 음악 보관함";
      viewUrl.searchParams.set("view", "library");
      canonicalUrl = viewUrl.href;
    } else if (state.activeView === "journal") {
      documentTitle = "나의 기록 | 책이 노래가 될 때";
      socialTitle = documentTitle;
      description = "마음에 담은 노래와 나만의 한 줄을 이 브라우저에 기록하는 개인 감상 공간";
      viewUrl.searchParams.set("view", "journal");
      canonicalUrl = viewUrl.href;
    } else if (state.activeView === "meaning") {
      documentTitle = `${track ? `${track.title} · ` : ""}가사와 의미 | 책이 노래가 될 때`;
      socialTitle = track ? `${track.title} | 책이 노래가 될 때` : documentTitle;
      description = track?.question || "한 곡의 생활 장면과 책이 남긴 질문을 가사와 해석으로 만나 보세요.";
      canonicalUrl = track ? shareUrlForTrack(track) : viewUrl.href;
    } else if (state.activeView === "about") {
      documentTitle = "프로젝트 소개 | 책이 노래가 될 때";
      socialTitle = documentTitle;
      description = "한 권이 남긴 질문을 생활의 언어와 노래로 기록하는 이정주의 사유음악실";
      viewUrl.searchParams.set("view", "about");
      canonicalUrl = viewUrl.href;
    }

    document.title = documentTitle;
    setMetaContent('meta[name="description"]', description);
    setMetaContent('meta[property="og:title"]', socialTitle);
    setMetaContent('meta[property="og:description"]', description);
    setMetaContent('meta[property="og:url"]', canonicalUrl);
    setMetaContent('meta[name="twitter:title"]', socialTitle);
    setMetaContent('meta[name="twitter:description"]', description);
    document.querySelector('link[rel="canonical"]')?.setAttribute("href", canonicalUrl);
  };

  const updateViewUrl = (view, mode) => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    url.hash = "";
    window.history[mode === "push" ? "pushState" : "replaceState"]({ view }, "", url);
  };

  const focusTemporarily = (element) => {
    if (!element) return;
    element.tabIndex = -1;
    element.focus({ preventScroll: true });
    element.addEventListener("blur", () => element.removeAttribute("tabindex"), { once: true });
  };

  const focusViewHeading = (view) => {
    const panel = elements.viewPanels.find((item) => item.dataset.viewPanel === view && !item.hidden);
    focusTemporarily(panel?.querySelector("h1, h2"));
  };

  const updateHeaderDensity = () => {
    const mobile = window.matchMedia("(max-width: 760px)").matches;
    const condensed = elements.siteHeader.dataset.condensed === "true";
    const next = mobile && (condensed ? window.scrollY > 24 : window.scrollY > 72);
    elements.siteHeader.dataset.condensed = next ? "true" : "false";
  };

  const updateHeaderMetrics = () => {
    const height = Math.ceil(elements.siteHeader.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--site-header-height", `${height}px`);
  };

  const bindResponsiveHeader = () => {
    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        updateHeaderDensity();
        updateHeaderMetrics();
        scheduled = false;
      });
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(schedule).observe(elements.siteHeader);
    }
    updateHeaderDensity();
    updateHeaderMetrics();
  };

  const setActiveView = (value, options = {}) => {
    const view = normalizeView(value);
    state.activeView = view;
    document.body.dataset.view = view;
    for (const panel of elements.viewPanels) panel.hidden = panel.dataset.viewPanel !== view;
    for (const link of elements.viewLinks) {
      if (link.dataset.viewLink === view) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    if (options.historyMode) updateViewUrl(view, options.historyMode);
    updateDocumentTitle();
    if (options.announce !== false) text(elements.viewStatus, `${VIEW_LABELS[view]} 화면을 열었습니다.`);
    if (options.resetScroll !== false) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    if (options.focus) window.requestAnimationFrame(() => focusViewHeading(view));
  };

  const bindViewNavigation = () => {
    for (const link of elements.viewLinks) {
      link.addEventListener("click", (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        setActiveView(link.dataset.viewLink, { historyMode: "push", focus: true });
      });
    }
    window.addEventListener("popstate", () => {
      setActiveView(viewFromLocation(), { focus: true });
    });
  };

  const mediaFor = (trackId) => {
    const item = state.media[trackId] || {};
    return {
      audio: typeof item.audio === "string" ? item.audio.trim() : typeof item.mp4 === "string" ? item.mp4.trim() : "",
      video: typeof item.video === "string" ? item.video.trim() : "",
      youtube: typeof item.youtube === "string" ? item.youtube.trim() : "",
    };
  };

  const mediaStatus = (trackId) => {
    const media = mediaFor(trackId);
    const hasVideo = Boolean(media.video || media.youtube);
    if (media.audio && hasVideo) return { key: "both", label: "음원·영상" };
    if (media.audio) return { key: "audio", label: "보관 음원" };
    if (hasVideo) return { key: "video", label: "영상" };
    return { key: "pending", label: "준비 중" };
  };

  const audioTracks = () => state.tracks.filter((track) => Boolean(mediaFor(track.id).audio));

  const activeLocalPlayer = () => {
    if (state.mediaMode === "audio") return elements.mainPlayer;
    if (state.mediaMode === "video") return elements.videoPlayer;
    return null;
  };

  const loadPlayCounts = async () => {
    try {
      const response = await fetch(PLAY_COUNTS_ENDPOINT, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        credentials: "omit",
      });
      if (!response.ok) throw new Error("play-count-load-failed");
      const payload = await response.json();
      const counts = {};
      for (const track of state.tracks) {
        const value = Number(payload.counts?.[track.id]);
        if (!Number.isSafeInteger(value) || value < 0) throw new Error("invalid-play-count");
        counts[track.id] = value;
      }
      state.playCounts = counts;
      state.playCountsStatus = "ready";
    } catch {
      state.playCountsStatus = "unavailable";
    }
    updatePlayCountViews();
  };

  const createEventId = () => {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
  };

  const resetPlaybackQualification = () => {
    if (playbackQualification?.retryTimer) window.clearTimeout(playbackQualification.retryTimer);
    playbackQualification = null;
  };

  const beginPlaybackQualification = (player) => {
    resetPlaybackQualification();
    playbackQualification = {
      trackId: state.selectedId,
      player,
      eventId: createEventId(),
      playedSeconds: 0,
      lastMediaTime: Number(player.currentTime) || 0,
      counted: false,
      sending: false,
      retryTimer: null,
    };
    return playbackQualification;
  };

  const qualificationFor = (player) => {
    const restartAfterCount =
      !state.repeatOne &&
      playbackQualification?.counted &&
      playbackQualification.trackId === state.selectedId &&
      playbackQualification.player === player &&
      player.currentTime < 1 &&
      playbackQualification.lastMediaTime > player.currentTime + 1;
    if (
      !playbackQualification ||
      playbackQualification.trackId !== state.selectedId ||
      playbackQualification.player !== player ||
      restartAfterCount
    ) {
      return beginPlaybackQualification(player);
    }
    return playbackQualification;
  };

  const recordQualifiedPlay = async (session, attempt = 0) => {
    if (session !== playbackQualification || session.counted || session.sending) return;
    session.sending = true;
    try {
      const response = await fetch(PLAY_COUNTS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          trackId: session.trackId,
          eventId: session.eventId,
          playedSeconds: Math.max(PLAY_QUALIFICATION_SECONDS, Math.floor(session.playedSeconds)),
        }),
        cache: "no-store",
        credentials: "omit",
      });
      if (!response.ok) throw new Error("play-count-save-failed");
      const payload = await response.json();
      const value = Number(payload.playCount);
      if (payload.trackId !== session.trackId || !Number.isSafeInteger(value) || value < 0) {
        throw new Error("invalid-play-count-response");
      }
      session.counted = true;
      state.playCounts[session.trackId] = value;
      state.playCountsStatus = "ready";
      updatePlayCountViews();
    } catch {
      if (session === playbackQualification && attempt < PLAY_RETRY_DELAYS.length) {
        session.retryTimer = window.setTimeout(() => {
          session.retryTimer = null;
          recordQualifiedPlay(session, attempt + 1);
        }, PLAY_RETRY_DELAYS[attempt]);
      }
    } finally {
      session.sending = false;
    }
  };

  const updatePlaybackQualification = (player) => {
    if (player.paused || player.seeking || !state.selectedId) return;
    const session = qualificationFor(player);
    const currentTime = Number(player.currentTime) || 0;
    const delta = currentTime - session.lastMediaTime;
    session.lastMediaTime = currentTime;
    if (delta > 0 && delta <= 4) session.playedSeconds += delta;
    if (
      session.playedSeconds >= PLAY_QUALIFICATION_SECONDS &&
      !session.counted &&
      !session.sending &&
      !session.retryTimer
    ) {
      recordQualifiedPlay(session);
    }
  };

  const playlistIsActive = () =>
    Boolean(state.playlistMode) &&
    state.playlistIndex >= 0 &&
    state.playlistIndex < state.playlistQueue.length;

  const syncRepeatOneToPlayers = () => {
    const activePlayer = activeLocalPlayer();
    for (const player of [elements.mainPlayer, elements.videoPlayer]) {
      player.loop = Boolean(
        state.repeatOne &&
        player === activePlayer &&
        !player.hidden &&
        player.hasAttribute("src"),
      );
    }
  };

  const setRepeatOneState = (enabled) => {
    state.repeatOne = Boolean(enabled);
    syncRepeatOneToPlayers();
  };

  const playlistLabel = () => (state.playlistMode === "shuffle" ? "랜덤 노래 재생" : "연속 재생");

  const shuffleIds = (ids) => {
    const shuffled = [...ids];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    if (shuffled.length > 1 && shuffled.every((id, index) => id === ids[index])) {
      [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
    }
    return shuffled;
  };

  const setHeaderPlaybackStatus = (label, playbackState = "idle", accessibleLabel = label) => {
    text(elements.playlistStatus, label);
    elements.playlistStatus.dataset.playbackState = playbackState;
    elements.playlistStatus.title = accessibleLabel;
    elements.playlistStatus.setAttribute("aria-label", accessibleLabel);
  };

  const setPlaybackToggle = (action, visibleLabel, accessibleLabel, disabled = false) => {
    elements.playbackToggleButton.dataset.action = action;
    elements.playbackToggleButton.disabled = disabled;
    elements.playbackToggleButton.setAttribute("aria-label", accessibleLabel);
    elements.playbackToggleButton.title = accessibleLabel;
    text(elements.playbackToggleLabel, visibleLabel);
    elements.playbackPauseIcon.toggleAttribute("hidden", action !== "pause");
    elements.playbackPlayIcon.toggleAttribute("hidden", action === "pause");
  };

  const updatePlaybackToggle = () => {
    const track = selectedTrack();
    const player = activeLocalPlayer();
    const controllable = track && player && !player.hidden && Boolean(player.getAttribute("src"));
    if (!controllable) {
      setPlaybackToggle("unavailable", "재생 제어", "재생할 수 있는 보관 음원이 선택되지 않았습니다", true);
      return;
    }
    const title = `〈${track.title}〉`;
    if (!player.paused && !player.ended) {
      setPlaybackToggle("pause", "일시정지", `${title} 일시정지`);
      return;
    }
    if (player.ended) {
      setPlaybackToggle("replay", "다시 재생", `${title} 처음부터 다시 재생`);
      return;
    }
    if (player.currentTime > 0) {
      setPlaybackToggle("resume", "이어 재생", `${title} 이어서 재생`);
      return;
    }
    setPlaybackToggle("play", "재생", `${title} 재생`);
  };

  const updateRepeatOneButton = () => {
    const track = selectedTrack();
    const player = activeLocalPlayer();
    const controllable = track && player && !player.hidden && Boolean(player.getAttribute("src"));
    const pressed = state.repeatOne;
    elements.repeatOneButton.disabled = !controllable;
    elements.repeatOneButton.setAttribute("aria-pressed", pressed ? "true" : "false");
    const label = controllable
      ? `〈${track.title}〉 한 곡 반복 ${pressed ? "끄기" : "켜기"}`
      : "반복할 수 있는 보관 음원이 선택되지 않았습니다";
    elements.repeatOneButton.setAttribute("aria-label", label);
    elements.repeatOneButton.title = label;
  };

  const updatePlaylistControls = (message = "") => {
    const available = audioTracks();
    const disabled = available.length === 0;
    elements.shuffleButton.disabled = disabled;
    elements.shuffleButton.setAttribute("aria-pressed", state.playlistMode === "shuffle" ? "true" : "false");
    elements.shuffleButton.setAttribute("aria-label", `랜덤 재생: 현재 재생 가능한 보관 음원 ${available.length}곡을 중복 없이 무작위 순서로 재생`);
    updateRepeatOneButton();
    updatePlaybackToggle();

    if (message) {
      setHeaderPlaybackStatus(message, "notice");
      return;
    }
    const track = selectedTrack();
    if (!track) {
      setHeaderPlaybackStatus(
        disabled ? "재생 가능한 노래가 없습니다" : "재생 가능한 노래 확인 중",
        disabled ? "pending" : "idle",
      );
      return;
    }
    const title = `〈${track.title}〉`;
    const playlistContext = playlistIsActive()
      ? `${playlistLabel()} ${state.playlistIndex + 1}/${state.playlistQueue.length}. `
      : "";
    const repeatContext = state.repeatOne ? "한 곡 반복 켜짐. " : "";
    if (mediaStatus(track.id).key === "pending") {
      setHeaderPlaybackStatus(`음원 준비 중 · ${title}`, "pending", `${title} 음원을 준비하고 있습니다.`);
      return;
    }
    const localPlayer = activeLocalPlayer();
    if (localPlayer && !localPlayer.hidden) {
      if (!localPlayer.paused && !localPlayer.ended) {
        setHeaderPlaybackStatus(
          `재생 중 · ${title}`,
          "playing",
          `${playlistContext}${repeatContext}현재 재생 중인 노래는 ${title}입니다.`,
        );
        return;
      }
      if (localPlayer.ended) {
        setHeaderPlaybackStatus(`재생 완료 · ${title}`, "complete", `${repeatContext}${title} 재생이 끝났습니다.`);
        return;
      }
      if (localPlayer.currentTime > 0) {
        setHeaderPlaybackStatus(`일시정지 · ${title}`, "paused", `${repeatContext}${title} 재생이 일시정지되었습니다.`);
        return;
      }
      setHeaderPlaybackStatus(`재생 대기 · ${title}`, "ready", `${repeatContext}재생할 수 있는 노래는 ${title}입니다.`);
      return;
    }
    if (state.mediaMode === "pending") {
      setHeaderPlaybackStatus(`음원 준비 중 · ${title}`, "pending", `${title} 음원을 준비하고 있습니다.`);
      return;
    }
    setHeaderPlaybackStatus(`재생 대기 · ${title}`, "ready", `선택한 노래는 ${title}입니다.`);
  };

  const clearPlaylist = (message = "") => {
    state.playlistMode = null;
    state.playlistQueue = [];
    state.playlistIndex = -1;
    updatePlaylistControls(message);
  };

  const parseYoutubeId = (value) => {
    if (!value) return "";
    try {
      const url = new URL(value);
      const host = url.hostname.replace(/^www\./, "").toLowerCase();
      let id = "";
      if (host === "youtu.be") {
        id = url.pathname.split("/").filter(Boolean)[0] || "";
      } else if (["youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
        if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
        if (/^\/(shorts|embed|live)\//.test(url.pathname)) id = url.pathname.split("/")[2] || "";
      }
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
    } catch {
      return "";
    }
  };

  const matchesFilter = (track) => {
    const media = mediaFor(track.id);
    const available = Boolean(media.audio || media.video || media.youtube);
    const statusMatch =
      state.filter === "all" ||
      (state.filter === "available" && available) ||
      (state.filter === "audio" && Boolean(media.audio)) ||
      (state.filter === "video" && Boolean(media.video)) ||
      (state.filter === "youtube" && Boolean(media.youtube)) ||
      (state.filter === "pending" && !available);
    if (!statusMatch) return false;
    if (!state.query) return true;
    const searchable = [track.title, track.book, track.author, track.question, track.message]
      .join(" ")
      .toLocaleLowerCase("ko-KR");
    return searchable.includes(state.query);
  };

  const trackSpotlightPointerQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
  const trackSpotlightMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const canUseTrackSpotlight = () => trackSpotlightPointerQuery.matches && !trackSpotlightMotionQuery.matches;

  const resetTrackSpotlight = (shell) => {
    delete shell.dataset.spotlightActive;
    shell.style.setProperty("--spotlight-x", "50%");
    shell.style.setProperty("--spotlight-y", "50%");
  };

  const bindTrackSpotlight = (shell) => {
    if (!canUseTrackSpotlight()) return;
    shell.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      const bounds = shell.getBoundingClientRect();
      shell.style.setProperty("--spotlight-x", `${Math.round(event.clientX - bounds.left)}px`);
      shell.style.setProperty("--spotlight-y", `${Math.round(event.clientY - bounds.top)}px`);
      shell.dataset.spotlightActive = "true";
    });
    shell.addEventListener("pointerleave", () => resetTrackSpotlight(shell));
    shell.addEventListener("pointercancel", () => resetTrackSpotlight(shell));
  };

  const createTrackCard = (track) => {
    const status = mediaStatus(track.id);
    const shell = document.createElement("article");
    shell.className = "track-card-shell";
    shell.style.setProperty("--card-accent", track.theme.accent);
    shell.style.setProperty("--card-soft", track.theme.soft);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "track-card";
    button.dataset.trackId = track.id;
    button.setAttribute("aria-current", track.id === state.selectedId ? "true" : "false");

    const spotlight = document.createElement("span");
    spotlight.className = "track-card-spotlight";
    spotlight.setAttribute("aria-hidden", "true");
    const top = document.createElement("div");
    top.className = "track-card-top";
    const number = document.createElement("span");
    number.className = "track-card-number";
    number.textContent = `TRACK ${track.id}`;
    const badge = document.createElement("span");
    badge.className = "card-status";
    badge.textContent = status.label;
    top.append(number, badge);

    const title = document.createElement("h3");
    title.textContent = track.title;
    const book = document.createElement("p");
    book.className = "track-card-book";
    book.textContent = `${track.author} 《${track.book}》`;
    const meta = document.createElement("p");
    meta.className = "track-card-meta";
    const uploaded = document.createElement("span");
    uploaded.textContent = uploadedLabel(track);
    const count = document.createElement("span");
    count.dataset.playCount = "";
    count.textContent = playCountLabel(track.id);
    meta.append(uploaded, count);
    const question = document.createElement("p");
    question.className = "track-card-question";
    question.textContent = track.question;
    const action = document.createElement("span");
    action.className = "track-card-action";
    action.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg><span>이 곡 선택하기</span>';

    button.append(spotlight, top, title, book, meta, question, action);
    button.addEventListener("click", () => {
      selectTrack(track.id, { updateUrl: true });
      document.querySelector("#listen").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = "track-favorite-button";
    favoriteButton.dataset.favoriteTrack = track.id;
    favoriteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg><span data-favorite-label></span>';
    const isFavorite = state.personalLibrary.favorites.includes(track.id);
    const favoriteLabel = isFavorite ? "마음에서 빼기" : "마음에 담기";
    favoriteButton.setAttribute("aria-pressed", isFavorite ? "true" : "false");
    favoriteButton.setAttribute("aria-label", `${favoriteLabel}: 〈${track.title}〉`);
    favoriteButton.querySelector("[data-favorite-label]").textContent = favoriteLabel;
    favoriteButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleFavorite(track.id);
    });

    shell.append(button, favoriteButton);
    bindTrackSpotlight(shell);
    return shell;
  };

  const renderLibrary = () => {
    const visible = state.tracks.filter(matchesFilter);
    elements.trackGrid.replaceChildren(...visible.map(createTrackCard));
    elements.noResults.hidden = visible.length !== 0;
    text(elements.resultCount, `전체 ${state.tracks.length}곡 중 ${visible.length}곡`);
  };

  const applyTheme = (track) => {
    elements.playerCard.style.setProperty("--track-accent", track.theme.accent);
    elements.playerCard.style.setProperty("--track-soft", track.theme.soft);
    elements.playerCard.style.setProperty("--track-ink", track.theme.ink);
  };

  const resetPlayer = (player) => {
    player.pause();
    player.loop = false;
    player.removeAttribute("src");
    player.load();
    player.hidden = true;
  };

  const resetMedia = () => {
    resetPlayer(elements.mainPlayer);
    resetPlayer(elements.videoPlayer);
    elements.youtubeStage.replaceChildren();
    elements.youtubeStage.hidden = true;
    elements.mediaEmpty.hidden = true;
    elements.mediaStage.dataset.mediaKind = "empty";
  };

  const showEmptyMedia = (message) => {
    resetMedia();
    const strong = elements.mediaEmpty.querySelector("strong");
    const paragraph = elements.mediaEmpty.querySelector("p");
    strong.textContent = message || "음원을 준비하고 있습니다";
    paragraph.textContent = "MP3 또는 MP4 음원이 연결되면 영상 없이 음악만 재생됩니다.";
    elements.mediaEmpty.hidden = false;
  };

  const renderAudio = (path) => {
    resetMedia();
    if (!/^media\/[0-9]{2}(?:-[^/]+)?\.(?:mp3|mp4)$/i.test(path)) {
      showEmptyMedia("음원 연결을 확인해 주세요");
      return;
    }
    elements.mainPlayer.src = `./${path}`;
    elements.mainPlayer.hidden = false;
    elements.mediaStage.dataset.mediaKind = "audio";
    elements.mainPlayer.load();
    syncRepeatOneToPlayers();
  };

  const renderVideo = (path) => {
    resetMedia();
    if (!/^media\/[0-9]{2}(?:-[^/]+)?\.mp4$/i.test(path)) {
      showEmptyMedia("영상 연결을 확인해 주세요");
      return;
    }
    elements.videoPlayer.src = `./${path}`;
    elements.videoPlayer.hidden = false;
    elements.mediaStage.dataset.mediaKind = "video";
    elements.videoPlayer.load();
    syncRepeatOneToPlayers();
  };

  const renderYoutube = (url, track) => {
    resetMedia();
    const videoId = parseYoutubeId(url);
    if (!videoId) {
      showEmptyMedia("영상 주소를 확인해 주세요");
      return;
    }
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
    iframe.title = `${track.title} YouTube 영상`;
    iframe.loading = "lazy";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allowFullscreen = true;
    elements.youtubeStage.append(iframe);
    elements.youtubeStage.hidden = false;
    elements.mediaStage.dataset.mediaKind = "youtube";
  };

  const renderMediaMode = () => {
    const track = selectedTrack();
    if (!track) return;
    const media = mediaFor(track.id);
    if (state.mediaMode === "audio" && media.audio) {
      renderAudio(media.audio);
      return;
    }
    if (state.mediaMode === "video" && media.video) {
      renderVideo(media.video);
      return;
    }
    if (state.mediaMode === "youtube" && media.youtube) {
      renderYoutube(media.youtube, track);
      return;
    }
    showEmptyMedia();
  };

  const renderSourceSwitch = (track) => {
    const media = mediaFor(track.id);
    const options = [];
    if (media.audio) options.push({ key: "audio", label: "음악만 듣기" });
    if (media.video) options.push({ key: "video", label: "영상 보기" });
    if (media.youtube) options.push({ key: "youtube", label: "YouTube" });
    elements.sourceSwitch.replaceChildren();
    elements.sourceSwitch.hidden = options.length <= 1;
    if (!options.some((option) => option.key === state.mediaMode)) {
      state.mediaMode = options[0]?.key || null;
    }
    for (const option of options) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = option.label;
      button.setAttribute("aria-pressed", option.key === state.mediaMode ? "true" : "false");
      button.addEventListener("click", () => {
        if (playlistIsActive() && option.key !== "audio") {
          clearPlaylist("영상 재생을 선택하여 랜덤 재생을 종료했습니다.");
        }
        if (state.repeatOne && !["audio", "video"].includes(option.key)) setRepeatOneState(false);
        resetPlaybackQualification();
        state.mediaMode = option.key;
        renderSourceSwitch(track);
        updatePlaylistControls();
      });
      elements.sourceSwitch.append(button);
    }
    renderMediaMode();
  };

  const renderMeanings = (track) => {
    const cards = track.meanings.map((item) => {
      const article = document.createElement("article");
      article.className = "meaning-card";
      const quote = document.createElement("blockquote");
      quote.textContent = item.lyric;
      const meaning = document.createElement("p");
      meaning.textContent = item.meaning;
      article.append(quote, meaning);
      return article;
    });
    elements.meaningGrid.replaceChildren(...cards);
  };

  const renderDetails = (track) => {
    text(elements.detailNumber, `${track.id}번째 노래`);
    text(elements.detailTitle, track.title);
    text(elements.detailSource, `${track.author} 《${track.book}》에서 시작된 노래`);
    text(elements.lyricsText, track.lyrics);
    text(elements.detailQuestion, track.question);
    text(elements.detailMessage, track.message);
    text(elements.detailNarration, track.narration);
    text(elements.detailEnding, track.endingQuestion);
    renderMeanings(track);
  };

  const updateUrl = (trackId) => {
    const url = new URL(window.location.href);
    url.searchParams.set("track", trackId);
    url.hash = "";
    window.history.replaceState({}, "", url);
  };

  const selectTrack = (trackId, options = {}) => {
    if (!options.preservePlaylist && playlistIsActive()) clearPlaylist();
    const track = state.tracks.find((item) => item.id === trackId) || state.tracks[0];
    if (!track) return;
    resetPlaybackQualification();
    state.selectedId = track.id;
    state.mediaMode = null;
    applyTheme(track);
    text(elements.coverNumber, track.id);
    text(elements.coverTitle, track.title);
    text(elements.coverBook, `${track.author} 《${track.book}》`);
    text(elements.playerStatus, mediaStatus(track.id).label);
    text(elements.playerNumber, `TRACK ${track.id}`);
    text(elements.playerTitle, track.title);
    text(elements.playerBook, `${track.author} 《${track.book}》`);
    text(elements.playerMessage, track.message);
    text(elements.playerHook, track.hook);
    text(elements.selectionStatus, `선택한 곡은 〈${track.title}〉입니다.`);
    updateShareButtons(track);
    renderSourceSwitch(track);
    if (state.repeatOne && !["audio", "video"].includes(state.mediaMode)) setRepeatOneState(false);
    renderDetails(track);
    renderLibrary();
    updatePlayCountViews();
    updatePlaylistControls();
    updateDocumentTitle();
    if (options.updateUrl) updateUrl(track.id);
  };

  const playPlaylistItem = () => {
    if (!playlistIsActive()) return;
    const trackId = state.playlistQueue[state.playlistIndex];
    selectTrack(trackId, { updateUrl: true, preservePlaylist: true });
    if (state.mediaMode !== "audio" || elements.mainPlayer.hidden) {
      window.setTimeout(advancePlaylist, 0);
      return;
    }
    updatePlaylistControls();
    const playback = elements.mainPlayer.play();
    if (playback && typeof playback.catch === "function") {
      playback.catch(() => {
        updatePlaylistControls("자동 재생이 차단되었습니다. 음악 플레이어의 재생 버튼을 누르면 랜덤 재생이 이어집니다.");
      });
    }
  };

  const advancePlaylist = () => {
    if (!playlistIsActive()) return;
    if (state.playlistIndex >= state.playlistQueue.length - 1) {
      const finishedLabel = playlistLabel();
      clearPlaylist(`${finishedLabel}이 끝났습니다. 다시 들으려면 버튼을 눌러 주세요.`);
      return;
    }
    state.playlistIndex += 1;
    playPlaylistItem();
  };

  const startPlaylist = (mode) => {
    const ids = audioTracks().map((track) => track.id);
    if (ids.length === 0) {
      clearPlaylist("연속 재생할 보관 음원이 아직 없습니다.");
      return;
    }
    setRepeatOneState(false);
    state.playlistMode = mode;
    state.playlistQueue = mode === "shuffle" ? shuffleIds(ids) : ids;
    state.playlistIndex = 0;
    playPlaylistItem();
  };

  const activateTab = (tab) => {
    for (const item of elements.tabs) {
      const active = item === tab;
      item.setAttribute("aria-selected", active ? "true" : "false");
      item.tabIndex = active ? 0 : -1;
      const panel = document.querySelector(`#${item.getAttribute("aria-controls")}`);
      panel.hidden = !active;
    }
  };

  const bindTabs = () => {
    elements.tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activateTab(tab));
      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        let next = index;
        if (event.key === "ArrowRight") next = (index + 1) % elements.tabs.length;
        if (event.key === "ArrowLeft") next = (index - 1 + elements.tabs.length) % elements.tabs.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = elements.tabs.length - 1;
        activateTab(elements.tabs[next]);
        elements.tabs[next].focus();
      });
    });
  };

  const bindControls = () => {
    elements.trackSearch.addEventListener("input", (event) => {
      state.query = event.target.value.trim().toLocaleLowerCase("ko-KR");
      renderLibrary();
    });
    elements.statusFilter.addEventListener("change", (event) => {
      state.filter = event.target.value;
      renderLibrary();
    });
    elements.journalTrackSelect.addEventListener("change", (event) => {
      requestJournalTrackSelection(event.target.value);
    });
    elements.journalReflectionInput.addEventListener("input", () => {
      elements.journalReflectionInput.setCustomValidity("");
      const savedText = state.personalReflections[journalEditorTrackId]?.text || "";
      journalEditorDirty = elements.journalReflectionInput.value !== savedText;
      updateReflectionCharacterCount();
    });
    elements.journalReflectionForm.addEventListener("submit", (event) => {
      event.preventDefault();
      saveJournalReflection();
    });
    elements.deleteJournalReflection.addEventListener("click", deleteJournalReflection);
    elements.exportJournalButton.addEventListener("click", exportJournalMarkdown);
    window.addEventListener("beforeunload", (event) => {
      if (!journalEditorDirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
    elements.clearPersonalLibraryButton.addEventListener("click", openClearPersonalLibraryDialog);
    elements.cancelClearPersonalLibrary.addEventListener("click", () => {
      elements.clearPersonalLibraryDialog.close("cancel");
      elements.clearPersonalLibraryButton.focus({ preventScroll: true });
    });
    elements.clearPersonalLibraryDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      elements.clearPersonalLibraryDialog.close("cancel");
      elements.clearPersonalLibraryButton.focus({ preventScroll: true });
    });
    elements.confirmClearPersonalLibrary.addEventListener("click", () => {
      clearPersonalLibrary();
      elements.clearPersonalLibraryDialog.close("cleared");
      elements.personalLibraryHeading.focus({ preventScroll: true });
    });
    window.addEventListener("storage", syncPersonalLibraryFromStorage);
    elements.libraryJump.addEventListener("click", () => {
      elements.librarySection.scrollIntoView({ block: "start" });
      window.requestAnimationFrame(() => focusTemporarily(elements.libraryHeading));
      text(elements.viewStatus, "음악 보관함 곡 목록으로 이동했습니다.");
    });
    elements.heroListen.addEventListener("click", () => {
      const firstAvailable = state.tracks.find((track) => mediaStatus(track.id).key !== "pending") || state.tracks[0];
      if (firstAvailable) selectTrack(firstAvailable.id, { updateUrl: true });
      setActiveView("library", { historyMode: "push", focus: true });
    });
    for (const button of elements.shareButtons) button.addEventListener("click", shareSelectedTrack);
    elements.shuffleButton.addEventListener("click", () => startPlaylist("shuffle"));
    elements.repeatOneButton.addEventListener("click", () => {
      if (elements.repeatOneButton.disabled) return;
      const next = !state.repeatOne;
      if (next) {
        state.playlistMode = null;
        state.playlistQueue = [];
        state.playlistIndex = -1;
        if (activeLocalPlayer()?.ended) resetPlaybackQualification();
      }
      setRepeatOneState(next);
      const title = selectedTrack()?.title || "선택한 노래";
      text(elements.viewStatus, `〈${title}〉 한 곡 반복을 ${next ? "켰습니다" : "껐습니다"}.`);
      updatePlaylistControls();
    });
    elements.playbackToggleButton.addEventListener("click", () => {
      const player = activeLocalPlayer();
      if (elements.playbackToggleButton.disabled || !player || player.hidden) return;
      if (!player.paused && !player.ended) {
        player.pause();
        return;
      }
      if (player.ended) {
        resetPlaybackQualification();
        player.currentTime = 0;
      }
      const playback = player.play();
      if (playback && typeof playback.catch === "function") {
        playback.catch(() => updatePlaylistControls("재생을 시작하지 못했습니다. 플레이어의 재생 버튼을 눌러 주세요."));
      }
    });

    const bindLocalPlayer = (player, mode) => {
      player.addEventListener("ended", () => {
        updatePlaylistControls();
        if (mode === "audio" && !state.repeatOne) advancePlaylist();
      });
      player.addEventListener("play", () => {
        const session = qualificationFor(player);
        session.lastMediaTime = Number(player.currentTime) || 0;
        updatePlaylistControls();
      });
      player.addEventListener("playing", () => {
        recordRecentTrack(state.selectedId);
        const session = qualificationFor(player);
        session.lastMediaTime = Number(player.currentTime) || 0;
        updatePlaylistControls();
      });
      player.addEventListener("pause", () => {
        if (playbackQualification?.player === player) {
          playbackQualification.lastMediaTime = Number(player.currentTime) || 0;
        }
        updatePlaylistControls();
      });
      player.addEventListener("seeking", () => {
        if (playbackQualification?.player === player) {
          playbackQualification.lastMediaTime = Number(player.currentTime) || 0;
        }
      });
      player.addEventListener("seeked", () => {
        if (playbackQualification?.player === player) {
          playbackQualification.lastMediaTime = Number(player.currentTime) || 0;
        }
      });
      player.addEventListener("timeupdate", () => updatePlaybackQualification(player));
      player.addEventListener("error", () => {
        const shouldAdvance = mode === "audio" && playlistIsActive();
        showEmptyMedia(mode === "audio" ? "음원 파일을 불러오지 못했습니다" : "영상 파일을 불러오지 못했습니다");
        updatePlaylistControls(`재생 오류 · 〈${selectedTrack()?.title || "선택한 노래"}〉`);
        if (shouldAdvance) window.setTimeout(advancePlaylist, 0);
      });
    };
    bindLocalPlayer(elements.mainPlayer, "audio");
    bindLocalPlayer(elements.videoPlayer, "video");
    bindViewNavigation();
    bindTabs();
    bindResponsiveHeader();
  };

  const showLoadError = () => {
    text(elements.selectionStatus, "노래 목록을 불러오지 못했습니다.");
    text(elements.playerTitle, "잠시 후 다시 열어 주세요");
    text(elements.playerMessage, "필요한 데이터 파일을 확인할 수 없습니다.");
    elements.trackGrid.replaceChildren();
    elements.noResults.hidden = false;
    elements.noResults.querySelector("strong").textContent = "노래 목록을 불러오지 못했습니다.";
    elements.noResults.querySelector("p").textContent = "페이지를 새로고침해 주세요.";
    elements.shuffleButton.disabled = true;
    elements.repeatOneButton.disabled = true;
    updateShareButtons(null);
    setPlaybackToggle("unavailable", "재생 제어", "노래 목록을 불러오지 못해 재생할 수 없습니다", true);
    setHeaderPlaybackStatus("노래 목록을 불러오지 못했습니다", "notice");
  };

  const init = async () => {
    window.__BOOK_SONG_READY__ = false;
    setActiveView(viewFromLocation(), { historyMode: "replace", resetScroll: false, announce: false });
    bindControls();
    try {
      const [tracksResponse, mediaResponse] = await Promise.all([
        fetch("./data/tracks.json", { cache: "no-store" }),
        fetch("./data/media.json", { cache: "no-store" }),
      ]);
      if (!tracksResponse.ok || !mediaResponse.ok) throw new Error("data-load-failed");
      state.tracks = await tracksResponse.json();
      state.media = await mediaResponse.json();
      loadPersonalLibrary();
      loadPersonalReflections();
      text(elements.songCount, String(state.tracks.length));
      const requested = new URL(window.location.href).searchParams.get("track");
      const normalizedRequested = normalizeRequestedTrackId(requested);
      const initialTrack = state.tracks.find((track) => track.id === normalizedRequested) || state.tracks[0];
      if (initialTrack) {
        const shouldNormalizeUrl = requested !== null && requested !== initialTrack.id;
        selectTrack(initialTrack.id, { updateUrl: shouldNormalizeUrl });
      }
      initializeJournalEditor();
      renderPersonalLibrary();
      if (!state.personalStorageAvailable || !state.reflectionStorageAvailable) {
        setPersonalLibraryStatus(
          "브라우저 설정 때문에 개인 기록을 이 기기에 저장할 수 없습니다. 현재 화면에서만 사용할 수 있습니다.",
          "warning",
        );
      }
      void loadPlayCounts();
      window.__BOOK_SONG_READY__ = true;
      window.__BOOK_SONG_APP__ = {
        getState: () => ({
          selectedId: state.selectedId,
          count: state.tracks.length,
          mediaMode: state.mediaMode,
          playlistMode: state.playlistMode,
          playlistQueue: [...state.playlistQueue],
          playlistIndex: state.playlistIndex,
          repeatOne: state.repeatOne,
          playableIds: audioTracks().map((track) => track.id),
          activeView: state.activeView,
          playCounts: { ...state.playCounts },
          playCountsStatus: state.playCountsStatus,
          favorites: [...state.personalLibrary.favorites],
          recent: [...state.personalLibrary.recent],
          reflections: structuredClone(state.personalReflections),
          personalStorageAvailable: state.personalStorageAvailable,
          reflectionStorageAvailable: state.reflectionStorageAvailable,
          qualifyingTrackId: playbackQualification?.trackId || null,
          qualifiedSeconds: playbackQualification?.playedSeconds || 0,
          playCountRecorded: Boolean(playbackQualification?.counted),
        }),
        parseYoutubeId,
        getSharePayload: () => {
          const track = selectedTrack();
          return track ? sharePayloadForTrack(track) : null;
        },
        selectTrack: (id) => selectTrack(String(id).padStart(2, "0"), { updateUrl: false }),
        startPlaylist,
        setView: (view) => setActiveView(view, { resetScroll: false, announce: false }),
      };
    } catch (error) {
      console.error("노래 데이터를 불러오지 못했습니다.", error);
      showLoadError();
    }
  };

  init();
})();
