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
    activeView: "home",
  };

  const VIEW_LABELS = {
    home: "처음",
    library: "음악 보관함",
    meaning: "가사와 의미",
    about: "프로젝트 소개",
  };

  const elements = {
    songCount: document.querySelector("#song-count"),
    bookCount: document.querySelector("#book-count"),
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
    playerMessage: document.querySelector("#player-message"),
    playerHook: document.querySelector("#player-hook"),
    sourceSwitch: document.querySelector("#source-switch"),
    mediaStage: document.querySelector("#media-stage"),
    mainPlayer: document.querySelector("#main-player"),
    videoPlayer: document.querySelector("#video-player"),
    youtubeStage: document.querySelector("#youtube-stage"),
    mediaEmpty: document.querySelector("#media-empty"),
    shuffleButton: document.querySelector("#shuffle-button"),
    playlistStatus: document.querySelector("#playlist-status"),
    playbackToggleButton: document.querySelector("#playback-toggle-button"),
    playbackToggleLabel: document.querySelector("#playback-toggle-label"),
    playbackPauseIcon: document.querySelector('[data-playback-icon="pause"]'),
    playbackPlayIcon: document.querySelector('[data-playback-icon="play"]'),
    trackSearch: document.querySelector("#track-search"),
    statusFilter: document.querySelector("#status-filter"),
    trackGrid: document.querySelector("#track-grid"),
    resultCount: document.querySelector("#result-count"),
    noResults: document.querySelector("#no-results"),
    detailNumber: document.querySelector("#detail-number"),
    detailTitle: document.querySelector("#detail-title"),
    detailSource: document.querySelector("#detail-source"),
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

  const updateDocumentTitle = () => {
    const track = selectedTrack();
    if (state.activeView === "library") {
      document.title = "음악 보관함 | 책이 노래가 될 때";
      return;
    }
    if (state.activeView === "meaning") {
      document.title = `${track ? `${track.title} · ` : ""}가사와 의미 | 책이 노래가 될 때`;
      return;
    }
    if (state.activeView === "about") {
      document.title = "프로젝트 소개 | 책이 노래가 될 때";
      return;
    }
    document.title = "책이 노래가 될 때";
  };

  const updateViewUrl = (view, mode) => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    url.hash = "";
    window.history[mode === "push" ? "pushState" : "replaceState"]({ view }, "", url);
  };

  const focusViewHeading = (view) => {
    const panel = elements.viewPanels.find((item) => item.dataset.viewPanel === view && !item.hidden);
    const heading = panel?.querySelector("h1, h2");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    heading.addEventListener("blur", () => heading.removeAttribute("tabindex"), { once: true });
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

  const playlistIsActive = () =>
    Boolean(state.playlistMode) &&
    state.playlistIndex >= 0 &&
    state.playlistIndex < state.playlistQueue.length;

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

  const updatePlaylistControls = (message = "") => {
    const available = audioTracks();
    const disabled = available.length === 0;
    elements.shuffleButton.disabled = disabled;
    elements.shuffleButton.setAttribute("aria-pressed", state.playlistMode === "shuffle" ? "true" : "false");
    elements.shuffleButton.setAttribute("aria-label", `현재 재생 가능한 보관 음원 ${available.length}곡을 중복 없이 무작위 순서로 재생`);
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
          `${playlistContext}현재 재생 중인 노래는 ${title}입니다.`,
        );
        return;
      }
      if (localPlayer.ended) {
        setHeaderPlaybackStatus(`재생 완료 · ${title}`, "complete", `${title} 재생이 끝났습니다.`);
        return;
      }
      if (localPlayer.currentTime > 0) {
        setHeaderPlaybackStatus(`일시정지 · ${title}`, "paused", `${title} 재생이 일시정지되었습니다.`);
        return;
      }
      setHeaderPlaybackStatus(`재생 대기 · ${title}`, "ready", `재생할 수 있는 노래는 ${title}입니다.`);
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

  const createTrackCard = (track) => {
    const status = mediaStatus(track.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "track-card";
    button.dataset.trackId = track.id;
    button.setAttribute("aria-label", `${track.title}, ${track.author} ${track.book}, 선택하기`);
    button.setAttribute("aria-current", track.id === state.selectedId ? "true" : "false");
    button.style.setProperty("--card-accent", track.theme.accent);
    button.style.setProperty("--card-soft", track.theme.soft);

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
    const question = document.createElement("p");
    question.className = "track-card-question";
    question.textContent = track.question;
    const action = document.createElement("span");
    action.className = "track-card-action";
    action.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg><span>이 곡 선택하기</span>';

    button.append(top, title, book, question, action);
    button.addEventListener("click", () => {
      selectTrack(track.id, { updateUrl: true });
      document.querySelector("#listen").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return button;
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
    renderSourceSwitch(track);
    renderDetails(track);
    renderLibrary();
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
    elements.heroListen.addEventListener("click", () => {
      const firstAvailable = state.tracks.find((track) => mediaStatus(track.id).key !== "pending") || state.tracks[0];
      if (firstAvailable) selectTrack(firstAvailable.id, { updateUrl: true });
      setActiveView("library", { historyMode: "push", focus: true });
    });
    elements.shuffleButton.addEventListener("click", () => startPlaylist("shuffle"));
    elements.playbackToggleButton.addEventListener("click", () => {
      const player = activeLocalPlayer();
      if (elements.playbackToggleButton.disabled || !player || player.hidden) return;
      if (!player.paused && !player.ended) {
        player.pause();
        return;
      }
      if (player.ended) player.currentTime = 0;
      const playback = player.play();
      if (playback && typeof playback.catch === "function") {
        playback.catch(() => updatePlaylistControls("재생을 시작하지 못했습니다. 플레이어의 재생 버튼을 눌러 주세요."));
      }
    });

    const bindLocalPlayer = (player, mode) => {
      player.addEventListener("ended", () => {
        updatePlaylistControls();
        if (mode === "audio") advancePlaylist();
      });
      player.addEventListener("play", () => updatePlaylistControls());
      player.addEventListener("playing", () => updatePlaylistControls());
      player.addEventListener("pause", () => updatePlaylistControls());
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
      text(elements.songCount, String(state.tracks.length));
      text(elements.bookCount, String(new Set(state.tracks.map((track) => `${track.author}:${track.book}`)).size));
      const requested = new URL(window.location.href).searchParams.get("track");
      selectTrack(state.tracks.some((track) => track.id === requested) ? requested : state.tracks[0]?.id);
      window.__BOOK_SONG_READY__ = true;
      window.__BOOK_SONG_APP__ = {
        getState: () => ({
          selectedId: state.selectedId,
          count: state.tracks.length,
          mediaMode: state.mediaMode,
          playlistMode: state.playlistMode,
          playlistQueue: [...state.playlistQueue],
          playlistIndex: state.playlistIndex,
          playableIds: audioTracks().map((track) => track.id),
          activeView: state.activeView,
        }),
        parseYoutubeId,
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
