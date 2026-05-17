import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, useReducer } from "react";
import ReactPlayer from "react-player";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { track } from "@/utils/analytics";
import { useSound, Sounds } from "@/hooks/useSound";
import { useVibration } from "@/hooks/useVibration";
import { useOffline } from "@/hooks/useOffline";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useLyrics } from "@/hooks/useLyrics";
import { useFurigana } from "@/hooks/useFurigana";
import { useActivityState } from "@/hooks/useActivityState";
import { useLyricsErrorToast } from "@/hooks/useLyricsErrorToast";
import { useCustomEventListener, useEventListener } from "@/hooks/useEventListener";
import { useLibraryUpdateChecker } from "./useLibraryUpdateChecker";
import {
  useAppleMusicLibrary,
  fetchAppleMusicPlaylistTracks,
  refreshAppleMusicRecentlyAdded,
  refreshAppleMusicFavorites,
  searchAppleMusicTracks,
  fetchAppleMusicRadioStations,
  fetchAppleMusicGeniusTrack,
  addAppleMusicTrackToFavorites,
  cacheAppleMusicFavoriteSongTrack,
  type AppleMusicSearchScope,
} from "./useAppleMusicLibrary";
import { useMusicKit } from "@/hooks/useMusicKit";
import { clearAppleMusicLibrary } from "@/utils/appleMusicLibraryCache";
import {
  useIpodStore,
  Track,
  getEffectiveTranslationLanguage,
  flushPendingLyricOffsetSave,
  isAppleMusicCollectionTrack,
} from "@/stores/useIpodStore";
import {
  resolveLyricsOverrideTargetId as resolveLyricsOverrideTargetIdHelper,
  resolveLyricsTrackMetadata,
} from "../utils/lyricsTrackMetadata";
import { useShallow } from "zustand/react/shallow";
import {
  useIpodStoreShallow,
  useAppStoreShallow,
  useAudioSettingsStoreShallow,
} from "@/stores/helpers";
import { useChatsStore } from "@/stores/useChatsStore";
import { useListenSessionStore } from "@/stores/useListenSessionStore";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { LyricsAlignment, LyricsFont, DisplayMode, getLyricsFontClassName } from "@/types/lyrics";
import { IPOD_ANALYTICS } from "@/utils/analytics";
import { saveSongMetadataFromTrack } from "@/utils/songMetadataCache";
import {
  generateIpodSongShareUrl,
  shouldCacheSongMetadataForShare,
} from "@/utils/sharedUrl";
import { onAppUpdate } from "@/utils/appEventBus";
import {
  BACKLIGHT_TIMEOUT_MS,
  SEEK_AMOUNT_SECONDS,
  getYouTubeVideoId,
  formatKugouImageUrl,
  getAlbumGroupingKey,
  resolveTrackCoverUrl,
} from "../constants";
import type {
  MenuHistoryEntry,
  MenuItem,
  WheelArea,
  RotationDirection,
} from "../types";
import type { IpodInitialData } from "../../base/types";
import type { CoverFlowRef } from "../components/CoverFlow";
import type { MusicQuizRef } from "../components/MusicQuiz";
import type { BrickGameRef } from "../components/BrickGame";
import type { SongSearchResult } from "@/components/dialogs/SongSearchDialog";
import { helpItems } from "..";

// User-agent sniffing is constant for the document lifetime, so compute once
// at module load instead of re-running these regexes on every render of the
// hook. The fallback for non-browser contexts (e.g. SSR, tests) keeps the
// module import safe.
const UA = typeof navigator !== "undefined" ? navigator.userAgent : "";
const IS_IOS = /iP(hone|od|ad)/.test(UA);
const IS_SAFARI =
  /Safari/.test(UA) && !/Chrome/.test(UA) && !/CriOS/.test(UA);
const IS_IOS_SAFARI = IS_IOS && IS_SAFARI;

/** Stable fallback so `rebuildMenuItems` never returns a fresh `[]` per call. */
const EMPTY_IPOD_MENU_ITEMS: MenuItem[] = [];

export interface UseIpodLogicOptions {
  isWindowOpen: boolean;
  isForeground: boolean | undefined;
  initialData: IpodInitialData | undefined;
  instanceId: string | undefined;
}

export function useIpodLogic({
  isWindowOpen,
  isForeground,
  initialData,
  instanceId,
}: UseIpodLogicOptions) {
  const { t, i18n } = useTranslation();
  // `t` from react-i18next can get a new function identity while resources
  // load. Menu factories only need to rebuild when the locale changes.
  const menuLocale = i18n.resolvedLanguage ?? i18n.language;
  const { play: playClickSound } = useSound(Sounds.BUTTON_CLICK);
  const { play: playScrollSound } = useSound(Sounds.IPOD_CLICK_WHEEL);
  const vibrate = useVibration(100, 50);
  const isOffline = useOffline();
  const translatedHelpItems = useTranslatedHelpItems("ipod", helpItems);

  // Store state
  const {
    youtubeTracks,
    youtubeCurrentSongId,
    appleMusicTracks,
    appleMusicPlaylists,
    appleMusicPlaylistTracks,
    appleMusicPlaylistTracksLoading,
    appleMusicPlaybackQueue,
    appleMusicCurrentSongId,
    librarySource,
    loopCurrent,
    loopAll,
    isShuffled,
    isPlaying,
    showVideo,
    backlightOn,
  } = useIpodStore(
    useShallow((s) => ({
      youtubeTracks: s.tracks,
      youtubeCurrentSongId: s.currentSongId,
      appleMusicTracks: s.appleMusicTracks,
      appleMusicPlaylists: s.appleMusicPlaylists,
      appleMusicPlaylistTracks: s.appleMusicPlaylistTracks,
      appleMusicPlaylistTracksLoading: s.appleMusicPlaylistTracksLoading,
      appleMusicPlaybackQueue: s.appleMusicPlaybackQueue,
      appleMusicCurrentSongId: s.appleMusicCurrentSongId,
      librarySource: s.librarySource,
      loopCurrent: s.loopCurrent,
      loopAll: s.loopAll,
      isShuffled: s.isShuffled,
      isPlaying: s.isPlaying,
      showVideo: s.showVideo,
      backlightOn: s.backlightOn,
    }))
  );

  // Active library — when the user toggles between YouTube and Apple Music,
  // the iPod displays whichever slice is selected without rewriting the rest
  // of the hook's logic. Each slice has its own current-song pointer.
  const isAppleMusic = librarySource === "appleMusic";
  const tracks = isAppleMusic ? appleMusicTracks : youtubeTracks;
  const browsableTracks = useMemo(
    () =>
      isAppleMusic
        ? tracks.filter((track) => !isAppleMusicCollectionTrack(track))
        : tracks,
    [isAppleMusic, tracks]
  );
  const currentSongId = isAppleMusic
    ? appleMusicCurrentSongId
    : youtubeCurrentSongId;

  // Compute currentIndex from currentSongId
  const currentIndex = useMemo(() => {
    if (!currentSongId) return tracks.length > 0 ? 0 : -1;
    const index = tracks.findIndex((t) => t.id === currentSongId);
    return index >= 0 ? index : (tracks.length > 0 ? 0 : -1);
  }, [tracks, currentSongId]);
  const browseCurrentIndex = useMemo(() => {
    if (!currentSongId) return browsableTracks.length > 0 ? 0 : -1;
    return browsableTracks.findIndex((track) => track.id === currentSongId);
  }, [browsableTracks, currentSongId]);
  const coverFlowCurrentIndex = browseCurrentIndex >= 0 ? browseCurrentIndex : 0;

  // Now Playing "X of Y" should reflect the active playback context. When
  // the user picked a song from inside an Artist / Album / Playlist
  // submenu, an Apple Music playback queue is set on the store; in that
  // case scope the counter to that ordered list. Otherwise fall back to
  // the full library count.
  const nowPlayingScope = useMemo(() => {
    if (!isAppleMusic) {
      return { index: currentIndex, total: tracks.length };
    }
    if (!appleMusicPlaybackQueue || appleMusicPlaybackQueue.length === 0) {
      return {
        index: browseCurrentIndex >= 0 ? browseCurrentIndex : currentIndex,
        total: browsableTracks.length,
      };
    }
    const validIds = new Set(tracks.map((t) => t.id));
    const queue = appleMusicPlaybackQueue.filter((id) => validIds.has(id));
    if (queue.length === 0) {
      return { index: currentIndex, total: tracks.length };
    }
    const idx = currentSongId ? queue.indexOf(currentSongId) : -1;
    // If the current song isn't part of the active queue, fall back to
    // the full-library counter rather than showing "0 of N".
    if (idx < 0) return { index: currentIndex, total: tracks.length };
    return { index: idx, total: queue.length };
  }, [
    isAppleMusic,
    appleMusicPlaybackQueue,
    tracks,
    browsableTracks.length,
    currentSongId,
    currentIndex,
    browseCurrentIndex,
  ]);

  const {
    theme,
    lcdFilterOn,
    displayMode,
    showLyrics,
    lyricsAlignment,
    lyricsFont,
    koreanDisplay,
    japaneseFurigana,
    romanization,
    setRomanization,
    lyricsTranslationLanguage,
    isFullScreen,
    toggleFullScreen,
    setYoutubeCurrentSongId,
    setAppleMusicCurrentSongId,
    setLibrarySource,
    toggleLoopAll,
    toggleLoopCurrent,
    toggleShuffle,
    togglePlay,
    setIsPlaying,
    setDisplayMode,
    toggleVideo,
    toggleBacklight,
    setTheme,
    clearLibrary,
    // addTrackFromVideoId - accessed via store.getState() directly
    youtubeNextTrack,
    youtubePreviousTrack,
    appleMusicNextTrack,
    appleMusicPreviousTrack,
    refreshLyrics,
    setTrackLyricsSource,
    clearTrackLyricsSource,
    setLyricOffset,
    setCurrentFuriganaMap,
  } = useIpodStoreShallow((s) => ({
    theme: s.theme,
    lcdFilterOn: s.lcdFilterOn,
    displayMode: s.displayMode ?? DisplayMode.Video,
    showLyrics: s.showLyrics,
    lyricsAlignment: s.lyricsAlignment,
    lyricsFont: s.lyricsFont,
    koreanDisplay: s.koreanDisplay,
    japaneseFurigana: s.japaneseFurigana,
    romanization: s.romanization,
    setRomanization: s.setRomanization,
    lyricsTranslationLanguage: s.lyricsTranslationLanguage,
    isFullScreen: s.isFullScreen,
    toggleFullScreen: s.toggleFullScreen,
    setYoutubeCurrentSongId: s.setCurrentSongId,
    setAppleMusicCurrentSongId: s.setAppleMusicCurrentSongId,
    setLibrarySource: s.setLibrarySource,
    toggleLoopAll: s.toggleLoopAll,
    toggleLoopCurrent: s.toggleLoopCurrent,
    toggleShuffle: s.toggleShuffle,
    togglePlay: s.togglePlay,
    setIsPlaying: s.setIsPlaying,
    toggleVideo: s.toggleVideo,
    toggleBacklight: s.toggleBacklight,
    setTheme: s.setTheme,
    clearLibrary: s.clearLibrary,
    youtubeNextTrack: s.nextTrack,
    youtubePreviousTrack: s.previousTrack,
    appleMusicNextTrack: s.appleMusicNextTrack,
    appleMusicPreviousTrack: s.appleMusicPreviousTrack,
    refreshLyrics: s.refreshLyrics,
    setTrackLyricsSource: s.setTrackLyricsSource,
    clearTrackLyricsSource: s.clearTrackLyricsSource,
    setDisplayMode: s.setDisplayMode,
    setLyricOffset: s.setLyricOffset,
    setCurrentFuriganaMap: s.setCurrentFuriganaMap,
  }));

  // Pick navigation methods + setter based on the active library. Apple
  // Music has its own queue / shuffle pointers in the store so YouTube
  // history isn't mixed with Apple Music playback.
  const setCurrentSongId = isAppleMusic
    ? setAppleMusicCurrentSongId
    : setYoutubeCurrentSongId;
  const rawNextTrack = isAppleMusic ? appleMusicNextTrack : youtubeNextTrack;
  const rawPreviousTrack = isAppleMusic
    ? appleMusicPreviousTrack
    : youtubePreviousTrack;

  // Auth for protected operations (force refresh, change lyrics source)
  const { username, isAuthenticated } = useChatsStore(
    useShallow((s) => ({ username: s.username, isAuthenticated: s.isAuthenticated }))
  );
  const auth = useMemo(
    () => (username && isAuthenticated ? { username, isAuthenticated } : undefined),
    [username, isAuthenticated]
  );

  // ---------------------------------------------------------------------
  // MusicKit (Apple Music) integration
  // ---------------------------------------------------------------------
  // Lazily configure MusicKit only after the iPod window is open at least
  // once OR the user has already opted into Apple Music. This avoids
  // pulling the v3 script on first paint for users that never use the
  // Apple Music mode.
  const enableMusicKit =
    isAppleMusic || isWindowOpen || appleMusicCurrentSongId !== null;
  const {
    instance: musicKitInstance,
    isAuthorized: appleMusicAuthorized,
    status: musicKitStatus,
    authorize: musicKitAuthorize,
    unauthorize: musicKitUnauthorize,
  } = useMusicKit({ enabled: enableMusicKit });
  const musicKitInstanceRef = useRef(musicKitInstance);
  musicKitInstanceRef.current = musicKitInstance;

  // Auto-load library after auth + when Apple Music is the active source.
  const { refresh: refreshAppleMusicLibrary } = useAppleMusicLibrary({
    enabled: isAppleMusic,
    isAuthorized: appleMusicAuthorized,
  });

  const appleMusicLibraryLoading = useIpodStore(
    (s) => s.appleMusicLibraryLoading
  );
  const appleMusicLibraryError = useIpodStore(
    (s) => s.appleMusicLibraryError
  );
  const appleMusicLibrarySize = useIpodStore(
    (s) => s.appleMusicTracks.length
  );


  const lyricOffset = useIpodStore(
    (s) => {
      const sourceTracks =
        s.librarySource === "appleMusic" ? s.appleMusicTracks : s.tracks;
      const sourceCurrentId =
        s.librarySource === "appleMusic"
          ? s.appleMusicCurrentSongId
          : s.currentSongId;
      const track = sourceCurrentId
        ? sourceTracks.find((t) => t.id === sourceCurrentId)
        : sourceTracks[0];
      return track?.lyricOffset ?? 0;
    }
  );

  const prevIsForeground = useRef(isForeground);
  const {
    bringInstanceToForeground,
    clearIpodInitialData,
    instances,
    restoreInstance,
  } = useAppStoreShallow((state) => ({
    bringInstanceToForeground: state.bringInstanceToForeground,
    clearIpodInitialData: state.clearInstanceInitialData,
    instances: state.instances,
    restoreInstance: state.restoreInstance,
  }));

  const isMinimized = instanceId
    ? instances[instanceId]?.isMinimized ?? false
    : false;
  const lastProcessedInitialDataRef = useRef<unknown>(null);
  const lastProcessedListenSessionRef = useRef<string | null>(null);

  const joinListenSession = useListenSessionStore((s) => s.joinSession);

  // Status management. Use a lazy initializer for `Date.now()` so the
  // timestamp is captured exactly once on mount instead of on every render
  // (the result is immediately discarded after the first commit anyway).
  const [lastActivityTime, setLastActivityTime] = useState(() => Date.now());
  const backlightTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userHasInteractedRef = useRef(false);

  // Dialog state
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isLyricsSearchDialogOpen, setIsLyricsSearchDialogOpen] = useState(false);
  const [isSongSearchDialogOpen, setIsSongSearchDialogOpen] = useState(false);
  const [isSyncModeOpen, setIsSyncModeOpen] = useState(false);
  const [isAddingSong, setIsAddingSong] = useState(false);
  // Recently Added + Favorites moved into the global iPod store (mirrored
  // from IndexedDB on iPod open) so the opportunistic refresh path in
  // `useAppleMusicLibrary` can update the same source the menu reads
  // from. Selectors keep these in sync with the store without forcing a
  // re-render of the entire hook on unrelated state changes.
  const appleMusicRecentlyAddedTracks = useIpodStore(
    (s) => s.appleMusicRecentlyAddedTracks
  );
  const isAppleMusicRecentlyAddedLoading = useIpodStore(
    (s) => s.appleMusicRecentlyAddedLoading
  );
  const appleMusicFavoriteTracks = useIpodStore(
    (s) => s.appleMusicFavoriteTracks
  );
  const isAppleMusicFavoritesLoading = useIpodStore(
    (s) => s.appleMusicFavoritesLoading
  );
  const radioMenuTitleForRestore = t("apps.ipod.menuItems.radio", "Radio");
  const [shouldHydrateRadioOnRestore] = useState(() => {
    const state = useIpodStore.getState();
    const currentAppleMusicTrack = state.appleMusicCurrentSongId
      ? state.appleMusicTracks.find(
          (track) => track.id === state.appleMusicCurrentSongId
        )
      : null;
    return Boolean(
      state.librarySource === "appleMusic" &&
        (currentAppleMusicTrack?.appleMusicPlayParams?.stationId ||
          state.ipodMenuBreadcrumb?.some(
            (entry) =>
              entry.title === radioMenuTitleForRestore ||
              entry.title === "Radio"
          ))
    );
  });
  const shouldHydrateRadioOnRestoreRef = useRef(
    shouldHydrateRadioOnRestore
  );
  const [appleMusicRadioTracks, setAppleMusicRadioTracks] = useState<Track[]>(
    []
  );
  const [isAppleMusicRadioLoading, setIsAppleMusicRadioLoading] = useState(
    shouldHydrateRadioOnRestore
  );
  const hasAttemptedRadioRestoreHydrationRef = useRef(false);
  const [isAppleMusicGeniusLoading, setIsAppleMusicGeniusLoading] =
    useState(false);
  
  // Cover Flow state
  const [isCoverFlowOpen, setIsCoverFlowOpen] = useState(false);

  // Music Quiz state
  const [isMusicQuizOpen, setIsMusicQuizOpen] = useState(false);
  const wasPlayingBeforeQuizRef = useRef(false);

  // Brick Game state
  const [isBrickGameOpen, setIsBrickGameOpen] = useState(false);
  const wasPlayingBeforeBrickGameRef = useRef(false);

  // Playback state.
  //
  // `elapsedTime` lives in `useIpodStore` (single source of truth so
  // every player path — YouTube + Apple Music + listen sessions — and
  // every consumer reads the same value). We read it back here via a
  // selector so this hook stays reactive to time changes for the
  // pieces that need it (lyrics, fullscreen sync). Previously we kept
  // a duplicate `useState(0)` in parallel and updated both on every
  // progress tick — that just churned React state twice per tick for
  // the same value.
  const elapsedTime = useIpodStore((s) => s.elapsedTime);
  const [totalTime, setTotalTime] = useState(0);
  const playerRef = useRef<ReactPlayer | null>(null);
  const fullScreenPlayerRef = useRef<ReactPlayer | null>(null);
  const lastTrackedSongRef = useRef<{ trackId: string; elapsedTime: number } | null>(null);
  const skipOperationRef = useRef(false);
  const coverFlowRef = useRef<CoverFlowRef | null>(null);
  const musicQuizRef = useRef<MusicQuizRef | null>(null);
  const brickGameRef = useRef<BrickGameRef | null>(null);

  const pauseBeforeWindowClose = useCallback(() => {
    const store = useIpodStore.getState();
    const activePlayer = isFullScreen
      ? fullScreenPlayerRef.current
      : playerRef.current;
    const playerTime = activePlayer?.getCurrentTime?.();
    const internalPlayer = (
      activePlayer as unknown as
        | {
            getInternalPlayer?: () => unknown;
          }
        | null
        | undefined
    )?.getInternalPlayer?.();
    const musicKitTime =
      typeof (internalPlayer as { currentPlaybackTime?: unknown } | null)
        ?.currentPlaybackTime === "number"
        ? (internalPlayer as { currentPlaybackTime: number }).currentPlaybackTime
        : typeof musicKitInstanceRef.current?.currentPlaybackTime === "number"
        ? musicKitInstanceRef.current.currentPlaybackTime
        : undefined;
    const currentTime =
      typeof playerTime === "number" && Number.isFinite(playerTime)
        ? playerTime
        : musicKitTime;

    if (typeof currentTime === "number" && Number.isFinite(currentTime)) {
      store.setElapsedTime(Math.max(0, currentTime));
    }

    // Update the store before the parent closes the window so reopening
    // never sees a stale "playing" flag while MusicKit is already paused.
    if (store.isPlaying) {
      store.setIsPlaying(false);
    }

    if (store.librarySource === "appleMusic") {
      const maybeMusicKit =
        (internalPlayer as { pause?: () => void } | null | undefined) ??
        musicKitInstanceRef.current;
      try {
        maybeMusicKit?.pause?.();
      } catch (err) {
        console.warn("[apple music] pause before close failed", err);
      }
    }
  }, [isFullScreen]);

  // Fallback for close paths that bypass the WindowFrame close button and
  // directly flip the app instance closed. By the time this runs refs may
  // already be cleared, so `pauseBeforeWindowClose` also reads directly from
  // the shared MusicKit instance.
  useLayoutEffect(() => {
    if (!isWindowOpen) pauseBeforeWindowClose();
  }, [isWindowOpen, pauseBeforeWindowClose]);
  
  // Screen long press for CoverFlow toggle
  const screenLongPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const screenLongPressFiredRef = useRef(false);
  const screenLongPressStartPos = useRef<{ x: number; y: number } | null>(null);
  const SCREEN_LONG_PRESS_MOVE_THRESHOLD = 10; // pixels - cancel if moved more than this
  
  // Track switching state to prevent race conditions
  const isTrackSwitchingRef = useRef(false);
  const trackSwitchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Menu state
  const initialMenuMode = useMemo(() => {
    const storeState = useIpodStore.getState();
    const hasValidTrack = storeState.tracks.length > 0 && (
      !storeState.currentSongId || 
      storeState.tracks.some((t) => t.id === storeState.currentSongId)
    );
    return !hasValidTrack;
  }, []);

  const [menuUiState, dispatchMenuUi] = useReducer(
    (
      state: {
        menuMode: boolean;
        selectedMenuItem: number;
        menuDirection: "forward" | "backward";
        cameFromNowPlayingMenuItem: boolean;
      },
      action:
        | {
            type: "setMenuMode";
            value: boolean | ((prev: boolean) => boolean);
          }
        | {
            type: "setSelectedMenuItem";
            value: number | ((prev: number) => number);
          }
        | { type: "setMenuDirection"; value: "forward" | "backward" }
        | { type: "setCameFromNowPlayingMenuItem"; value: boolean }
    ) => {
      switch (action.type) {
        case "setMenuMode": {
          const nextMenuMode =
            typeof action.value === "function"
              ? action.value(state.menuMode)
              : action.value;
          if (nextMenuMode === state.menuMode) return state;
          return { ...state, menuMode: nextMenuMode };
        }
        case "setSelectedMenuItem": {
          const nextSelected =
            typeof action.value === "function"
              ? action.value(state.selectedMenuItem)
              : action.value;
          if (nextSelected === state.selectedMenuItem) return state;
          return { ...state, selectedMenuItem: nextSelected };
        }
        case "setMenuDirection":
          if (action.value === state.menuDirection) return state;
          return { ...state, menuDirection: action.value };
        case "setCameFromNowPlayingMenuItem":
          if (action.value === state.cameFromNowPlayingMenuItem) return state;
          return { ...state, cameFromNowPlayingMenuItem: action.value };
        default:
          return state;
      }
    },
    {
      menuMode: initialMenuMode,
      selectedMenuItem: 0,
      menuDirection: "forward",
      cameFromNowPlayingMenuItem: false,
    }
  );
  const { menuMode, selectedMenuItem, menuDirection, cameFromNowPlayingMenuItem } =
    menuUiState;
  const setMenuMode = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      dispatchMenuUi({ type: "setMenuMode", value });
    },
    []
  );
  const setSelectedMenuItem = useCallback(
    (value: number | ((prev: number) => number)) => {
      dispatchMenuUi({ type: "setSelectedMenuItem", value });
    },
    []
  );
  const setMenuDirection = useCallback((value: "forward" | "backward") => {
    dispatchMenuUi({ type: "setMenuDirection", value });
  }, []);
  const [menuHistory, setMenuHistory] = useState<MenuHistoryEntry[]>([]);
  const setCameFromNowPlayingMenuItem = useCallback((value: boolean) => {
    dispatchMenuUi({ type: "setCameFromNowPlayingMenuItem", value });
  }, []);
  // Save menu history before entering Now Playing from a song selection
  const menuHistoryBeforeNowPlayingRef = useRef<typeof menuHistory | null>(null);

  // Mirror the latest cursor position for use inside callbacks (especially
  // setMenuHistory updaters) without forcing every menu-item factory to
  // re-memoize on every wheel tick.
  const selectedMenuItemRef = useRef(selectedMenuItem);
  useEffect(() => {
    selectedMenuItemRef.current = selectedMenuItem;
  }, [selectedMenuItem]);

  // Remember the last cursor position for each menu title. This keeps
  // forward navigation symmetric with back navigation: if the user backs
  // out of a playlist/artist/album and then enters it again, we restore
  // the item they were on instead of resetting that child menu to row 0.
  const rememberedMenuSelectedIndexRef = useRef<Record<string, number>>({});

  const getRememberedMenuSelectedIndex = useCallback(
    (title: string, fallback: number, itemCount: number) => {
      const remembered = rememberedMenuSelectedIndexRef.current[title];
      const next =
        typeof remembered === "number" && Number.isFinite(remembered)
          ? remembered
          : fallback;
      if (itemCount <= 0) return Math.max(0, next);
      return Math.max(0, Math.min(next, Math.max(0, itemCount - 1)));
    },
    []
  );

  // Push a child menu while stamping the current cursor position onto the
  // *parent* breadcrumb entry. Without this, every parent's selectedIndex
  // stays at 0 forever, so back navigation always lands at the top of the
  // parent — not at the item the user originally drilled in from.
  const pushMenuChild = useCallback(
    (child: (typeof menuHistory)[number]) => {
      setMenuDirection("forward");
      const childWithRememberedSelection = {
        ...child,
        selectedIndex: getRememberedMenuSelectedIndex(
          child.title,
          child.selectedIndex,
          child.items.length
        ),
      };
      setMenuHistory((prev) => {
        if (prev.length === 0) return [childWithRememberedSelection];
        const updated = prev.slice();
        const parent = updated[updated.length - 1];
        rememberedMenuSelectedIndexRef.current[parent.title] =
          selectedMenuItemRef.current;
        updated[updated.length - 1] = {
          ...parent,
          selectedIndex: selectedMenuItemRef.current,
        };
        return [...updated, childWithRememberedSelection];
      });
      setSelectedMenuItem(childWithRememberedSelection.selectedIndex);
    },
    [getRememberedMenuSelectedIndex]
  );

  // Library update checker
  const { manualSync } = useLibraryUpdateChecker(
    isWindowOpen && (isForeground ?? false)
  );

  // iOS Safari detection (cached at module scope; see top of file).
  const isIOS = IS_IOS;
  const isSafari = IS_SAFARI;
  const isIOSSafari = IS_IOS_SAFARI;

  // Status helper functions
  const showStatus = useCallback((message: string) => {
    setStatusMessage(message);
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }
    statusTimeoutRef.current = setTimeout(() => {
      setStatusMessage(null);
    }, 2000);
  }, []);

  const showOfflineStatus = useCallback(() => {
    toast.error(t("apps.ipod.dialogs.youreOffline"), {
      id: "ipod-offline",
      description: t("apps.ipod.dialogs.ipodRequiresInternet"),
    });
    showStatus("🚫");
  }, [showStatus, menuLocale]);

  // Ref-only version — marks activity without triggering any React state update.
  // Use this on high-frequency paths (e.g. brick game wheel) to keep the RAF
  // loop uninterrupted.
  const registerActivityRef = useCallback(() => {
    userHasInteractedRef.current = true;
  }, []);

  const registerActivity = useCallback(() => {
    setLastActivityTime(Date.now());
    userHasInteractedRef.current = true;
    if (!useIpodStore.getState().backlightOn) {
      toggleBacklight();
    }
  }, [toggleBacklight]);

  // Memoized toggle functions
  const memoizedToggleShuffle = useCallback(() => {
    toggleShuffle();
    showStatus(
      useIpodStore.getState().isShuffled
        ? t("apps.ipod.status.shuffleOn")
        : t("apps.ipod.status.shuffleOff")
    );
    registerActivity();
  }, [toggleShuffle, showStatus, registerActivity, menuLocale]);

  const memoizedToggleBacklight = useCallback(() => {
    toggleBacklight();
    const isOn = useIpodStore.getState().backlightOn;
    showStatus(isOn ? t("apps.ipod.status.lightOn") : t("apps.ipod.status.lightOff"));
    if (isOn) {
      registerActivity();
    } else {
      setLastActivityTime(Date.now());
      userHasInteractedRef.current = true;
    }
  }, [toggleBacklight, showStatus, registerActivity, menuLocale]);

  const memoizedChangeTheme = useCallback(
    (newTheme: "classic" | "black" | "u2") => {
      setTheme(newTheme);
      showStatus(
        newTheme === "classic"
          ? t("apps.ipod.status.themeClassic")
          : newTheme === "black"
          ? t("apps.ipod.status.themeBlack")
          : t("apps.ipod.status.themeU2")
      );
      registerActivity();
    },
    [setTheme, showStatus, registerActivity, menuLocale]
  );

  const handleMenuItemAction = useCallback(
    (action: () => void) => {
      if (action === memoizedToggleBacklight) {
        action();
      } else {
        registerActivity();
        action();
      }
    },
    [registerActivity, memoizedToggleBacklight]
  );

  const memoizedToggleRepeat = useCallback(() => {
    registerActivity();
    const currentLoopAll = useIpodStore.getState().loopAll;
    const currentLoopCurrent = useIpodStore.getState().loopCurrent;

    if (currentLoopCurrent) {
      toggleLoopCurrent();
      showStatus(t("apps.ipod.status.repeatOff"));
    } else if (currentLoopAll) {
      toggleLoopAll();
      toggleLoopCurrent();
      showStatus(t("apps.ipod.status.repeatOne"));
    } else {
      toggleLoopAll();
      showStatus(t("apps.ipod.status.repeatAll"));
    }
  }, [registerActivity, toggleLoopAll, toggleLoopCurrent, showStatus, menuLocale]);

  const memoizedHandleThemeChange = useCallback(() => {
    const currentTheme = useIpodStore.getState().theme;
    const nextTheme =
      currentTheme === "classic"
        ? "black"
        : currentTheme === "black"
        ? "u2"
        : "classic";
    memoizedChangeTheme(nextTheme);
  }, [memoizedChangeTheme]);

  // Stable callback used by every "play this track from a menu" entry. We
  // factor this out so per-track menu items can be memoized — without it,
  // each render would build N new closures for an N-track library and
  // every scroll click would invalidate the menu-history sync effect.
  //
  // `queueIds` scopes Apple Music next/previous to the ordered list the
  // user picked from (artist, album, playlist, or full library). Pass
  // `null` to fall back to the full library; pass `undefined` to leave
  // the existing queue in place.
  const playTrackFromMenu = useCallback(
    (
      track: Track,
      trackIndexInActiveMenu: number,
      queueIds?: string[] | null
    ) => {
      registerActivity();
      if (track.source !== "appleMusic" && isOffline) {
        showOfflineStatus();
        return;
      }
      setMenuHistory((prev) => {
        const updatedHist = [...prev];
        if (updatedHist.length > 0) {
          updatedHist[updatedHist.length - 1] = {
            ...updatedHist[updatedHist.length - 1],
            selectedIndex: trackIndexInActiveMenu,
          };
        }
        menuHistoryBeforeNowPlayingRef.current = updatedHist;
        return updatedHist;
      });
      // Update the contextual queue BEFORE flipping the current song so
      // any next/previous fired immediately after sees the right scope.
      if (queueIds !== undefined && useIpodStore.getState().librarySource === "appleMusic") {
        useIpodStore.getState().setAppleMusicPlaybackQueue(queueIds);
      }
      setCurrentSongId(track.id);
      setIsPlaying(true);
      setMenuDirection("forward");
      setMenuMode(false);
      setCameFromNowPlayingMenuItem(false);
      if (useIpodStore.getState().showVideo) {
        toggleVideo();
      }
    },
    [
      registerActivity,
      isOffline,
      showOfflineStatus,
      setCurrentSongId,
      setIsPlaying,
      toggleVideo,
    ]
  );

  const playAppleMusicTrackFromMenu = useCallback(
    (
      track: Track,
      trackIndexInActiveMenu: number,
      queueIds?: string[] | null,
      queueTracks?: Track[]
    ) => {
      const state = useIpodStore.getState();
      // Merge any queue tracks that aren't already in the cached
      // library so next/previous can resolve them. Playlist drill-downs
      // can include songs not present in the user's full library.
      const toMerge = queueTracks ?? [track];
      const existingIds = new Set(state.appleMusicTracks.map((t) => t.id));
      const additions = toMerge.filter((t) => !existingIds.has(t.id));
      if (additions.length > 0) {
        const nextTracks = [...state.appleMusicTracks, ...additions];
        if (additions.some(isAppleMusicCollectionTrack)) {
          useIpodStore.setState({ appleMusicTracks: nextTracks });
        } else {
          state.setAppleMusicTracks(nextTracks);
        }
      }
      playTrackFromMenu(track, trackIndexInActiveMenu, queueIds);
    },
    [playTrackFromMenu]
  );

  const requestPlaylistTracksIfNeeded = useCallback((playlistId: string) => {
    // Always trigger a background refresh on playlist open. The fetcher
    // dedupes in-flight calls via `appleMusicPlaylistTracksLoading`, and
    // the menu builder gates "Loading…" behind
    // `playlistTracks.length === 0`, so cached tracks render
    // immediately while the refresh updates them in place. This gives
    // users a true SWR experience: opening a playlist shows cached
    // contents instantly AND silently picks up any new songs added
    // since the last view.
    void fetchAppleMusicPlaylistTracks(playlistId, { force: true }).catch(
      (err) => {
        console.warn(
          `[apple music] failed to load playlist tracks for ${playlistId}`,
          err
        );
      }
    );
  }, []);

  // -------------------------------------------------------------------
  // Apple Music handlers (defined here so the menu builders below can
  // reference them via useMemo).
  // -------------------------------------------------------------------

  const handleAppleMusicSignIn = useCallback(async () => {
    registerActivity();
    if (musicKitStatus === "missing-token") {
      toast.error("Apple Music is not configured", {
        description:
          "Set MUSICKIT_TEAM_ID, MUSICKIT_KEY_ID, and MUSICKIT_PRIVATE_KEY.",
      });
      return;
    }
    try {
      await musicKitAuthorize();
      showStatus(t("apps.ipod.status.appleMusicSignedIn", "Apple Music ✓"));
    } catch (err) {
      toast.error("Sign in failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, [musicKitAuthorize, musicKitStatus, registerActivity, showStatus, menuLocale]);

  const handleAppleMusicSignOut = useCallback(async () => {
    registerActivity();
    setIsPlaying(false);
    await musicKitUnauthorize();
    useIpodStore.getState().setAppleMusicTracks([]);
    useIpodStore.setState({
      appleMusicPlaylists: [],
      appleMusicPlaylistsLoadedAt: null,
      appleMusicPlaylistTracks: {},
      appleMusicPlaylistTracksLoadedAt: {},
      appleMusicPlaylistTracksLoading: {},
      appleMusicRecentlyAddedTracks: [],
      appleMusicRecentlyAddedLoadedAt: null,
      appleMusicRecentlyAddedLoading: false,
      appleMusicFavoriteTracks: [],
      appleMusicFavoriteTracksLoadedAt: null,
      appleMusicFavoritesLoading: false,
      appleMusicPlaybackQueue: null,
    });
    // Drop the IndexedDB-cached library so a different user signing
    // in next doesn't inherit the previous user's tracks.
    void clearAppleMusicLibrary();
    showStatus(t("apps.ipod.status.appleMusicSignedOut", "Signed Out"));
  }, [musicKitUnauthorize, registerActivity, setIsPlaying, showStatus, menuLocale]);

  const handleAppleMusicRefresh = useCallback(async () => {
    registerActivity();
    if (!appleMusicAuthorized) {
      void handleAppleMusicSignIn();
      return;
    }
    try {
      // refresh() drives a progress toast itself, so don't double-toast on
      // error here — just acknowledge success on the iPod screen.
      const count = await refreshAppleMusicLibrary();
      showStatus(
        t(
          "apps.ipod.status.appleMusicLibrarySynced",
          `Library: ${count} songs`,
          { count }
        )
      );
    } catch {
      // Already surfaced by refresh()'s error toast.
    }
  }, [
    appleMusicAuthorized,
    handleAppleMusicSignIn,
    refreshAppleMusicLibrary,
    registerActivity,
    showStatus,
    menuLocale,
  ]);

  const mergeAppleMusicTracks = useCallback((incomingTracks: Track[]) => {
    if (incomingTracks.length === 0) return;
    const state = useIpodStore.getState();
    const existingIds = new Set(state.appleMusicTracks.map((track) => track.id));
    const additions = incomingTracks.filter((track) => !existingIds.has(track.id));
    if (additions.length > 0) {
      const nextTracks = [...additions, ...state.appleMusicTracks];
      if (additions.some(isAppleMusicCollectionTrack)) {
        useIpodStore.setState({ appleMusicTracks: nextTracks });
      } else {
        state.setAppleMusicTracks(nextTracks);
      }
    }
  }, []);

  const handleAppleMusicSearch = useCallback(
    async (query: string, scope: AppleMusicSearchScope) => {
      if (!appleMusicAuthorized) {
        await handleAppleMusicSignIn();
        if (!useIpodStore.getState().appleMusicTracks) return [];
      }
      return searchAppleMusicTracks(query, scope);
    },
    [appleMusicAuthorized, handleAppleMusicSignIn]
  );

  const handleAppleMusicSearchSelect = useCallback(
    async (track: Track) => {
      mergeAppleMusicTracks([track]);
      useIpodStore.getState().setLibrarySource("appleMusic");
      useIpodStore.getState().setAppleMusicPlaybackQueue(null);
      useIpodStore.getState().setAppleMusicCurrentSongId(track.id);
      setIsPlaying(true);
      showStatus(t("apps.ipod.status.added"));
    },
    [mergeAppleMusicTracks, setIsPlaying, showStatus, t]
  );

  // Open the "Recently Added" menu.
  //
  // Reads cached tracks straight from the store (already populated via
  // the IndexedDB hydration in `useAppleMusicLibrary`) and kicks off a
  // background refresh that updates the store in-place when it
  // resolves. The menu builder gates "Loading…" on cache emptiness, so
  // the only time the user sees the placeholder is the very first
  // load — every subsequent open shows cached entries instantly while
  // the refresh runs invisibly.
  const loadAppleMusicRecentlyAdded = useCallback(async () => {
    if (!appleMusicAuthorized) {
      void handleAppleMusicSignIn();
      return;
    }
    try {
      const tracks = await refreshAppleMusicRecentlyAdded({ force: true });
      mergeAppleMusicTracks(tracks);
    } catch (err) {
      // Only surface the toast when there's no cached content to fall
      // back on — otherwise the user already has a working menu and a
      // background failure shouldn't pop a UI error.
      const hasCached =
        useIpodStore.getState().appleMusicRecentlyAddedTracks.length > 0;
      if (!hasCached) {
        toast.error(
          t(
            "apps.ipod.dialogs.appleMusicRecentlyAddedFailed",
            "Failed to load recently added songs"
          ),
          {
            description: err instanceof Error ? err.message : String(err),
          }
        );
      } else {
        console.warn(
          "[apple music] recently added refresh failed (using cached collection)",
          err
        );
      }
    }
  }, [appleMusicAuthorized, handleAppleMusicSignIn, mergeAppleMusicTracks, menuLocale]);

  const loadAppleMusicFavorites = useCallback(async () => {
    if (!appleMusicAuthorized) {
      void handleAppleMusicSignIn();
      return;
    }
    try {
      const tracks = await refreshAppleMusicFavorites({ force: true });
      mergeAppleMusicTracks(tracks);
    } catch (err) {
      const hasCached =
        useIpodStore.getState().appleMusicFavoriteTracks.length > 0;
      if (!hasCached) {
        toast.error(
          t(
            "apps.ipod.dialogs.appleMusicFavoritesFailed",
            "Failed to load favorite songs"
          ),
          {
            description: err instanceof Error ? err.message : String(err),
          }
        );
      } else {
        console.warn(
          "[apple music] favorites refresh failed (using cached collection)",
          err
        );
      }
    }
  }, [appleMusicAuthorized, handleAppleMusicSignIn, mergeAppleMusicTracks, menuLocale]);

  const loadAppleMusicRadioStations = useCallback(async (options?: {
    promptForAuth?: boolean;
    showErrors?: boolean;
  }) => {
    const promptForAuth = options?.promptForAuth ?? true;
    const showErrors = options?.showErrors ?? true;
    const hadCached = appleMusicRadioTracks.length > 0;
    if (!hadCached) setIsAppleMusicRadioLoading(true);
    try {
      const stations = await fetchAppleMusicRadioStations();
      setAppleMusicRadioTracks(stations);
      mergeAppleMusicTracks(stations);
    } catch (err) {
      if (!appleMusicAuthorized && promptForAuth) {
        void handleAppleMusicSignIn();
        return;
      }
      if (!hadCached) {
        if (showErrors) {
          toast.error(
            t(
              "apps.ipod.dialogs.appleMusicRadioFailed",
              "Failed to load Apple Music radio"
            ),
            {
              description: err instanceof Error ? err.message : String(err),
            }
          );
        }
      } else {
        console.warn(
          "[apple music] radio refresh failed (using cached stations)",
          err
        );
      }
    } finally {
      if (!hadCached) setIsAppleMusicRadioLoading(false);
    }
  }, [
    appleMusicAuthorized,
    appleMusicRadioTracks.length,
    handleAppleMusicSignIn,
    mergeAppleMusicTracks,
    menuLocale,
  ]);

  useEffect(() => {
    if (!isAppleMusic || appleMusicRadioTracks.length > 0) return;

    const hasRadioMenuInHistory = menuHistory.some(
      (menu) =>
        menu.title === radioMenuTitleForRestore || menu.title === "Radio"
    );
    const currentAppleMusicTrack = currentSongId
      ? tracks.find((track) => track.id === currentSongId)
      : null;
    const hasStationNowPlaying = Boolean(
      currentAppleMusicTrack?.appleMusicPlayParams?.stationId
    );

    if (
      !shouldHydrateRadioOnRestoreRef.current &&
      !hasRadioMenuInHistory &&
      !hasStationNowPlaying
    ) {
      return;
    }

    if (hasAttemptedRadioRestoreHydrationRef.current) return;
    hasAttemptedRadioRestoreHydrationRef.current = true;
    void loadAppleMusicRadioStations({
      promptForAuth: false,
      showErrors: false,
    });
  }, [
    appleMusicRadioTracks.length,
    currentSongId,
    isAppleMusic,
    loadAppleMusicRadioStations,
    menuHistory,
    radioMenuTitleForRestore,
    tracks,
  ]);

  const playAppleMusicGenius = useCallback(async () => {
    registerActivity();
    if (!appleMusicAuthorized) {
      void handleAppleMusicSignIn();
      return;
    }
    setIsAppleMusicGeniusLoading(true);
    try {
      const track = await fetchAppleMusicGeniusTrack();
      if (!track) {
        toast.info(
          t(
            "apps.ipod.dialogs.appleMusicNoRecommendations",
            "No Apple Music recommendations are available yet"
          )
        );
        return;
      }
      mergeAppleMusicTracks([track]);
      useIpodStore.getState().setLibrarySource("appleMusic");
      useIpodStore.getState().setAppleMusicPlaybackQueue([track.id]);
      useIpodStore.getState().setAppleMusicCurrentSongId(track.id);
      setIsPlaying(true);
      setMenuDirection("forward");
      setMenuMode(false);
      if (useIpodStore.getState().showVideo) {
        toggleVideo();
      }
      showStatus(
        t("apps.ipod.status.appleMusicGeniusPlaying", "Genius Mix")
      );
    } catch (err) {
      toast.error(
        t(
          "apps.ipod.dialogs.appleMusicGeniusFailed",
          "Failed to play Apple Music recommendations"
        ),
        {
          description: err instanceof Error ? err.message : String(err),
        }
      );
    } finally {
      setIsAppleMusicGeniusLoading(false);
    }
  }, [
    appleMusicAuthorized,
    handleAppleMusicSignIn,
    mergeAppleMusicTracks,
    registerActivity,
    setIsPlaying,
    showStatus,
    menuLocale,
    toggleVideo,
  ]);

  const handleAppleMusicAddToFavorites = useCallback(async () => {
    registerActivity();
    const track = useIpodStore.getState().appleMusicTracks.find(
      (candidate) =>
        candidate.id === useIpodStore.getState().appleMusicCurrentSongId
    );
    if (!track) return;
    try {
      await addAppleMusicTrackToFavorites(track);
      // Optimistically update the store + IndexedDB. We don't bump the
      // freshness timestamp here so the next opportunistic refresh
      // still revalidates against the server (which catches the eventual
      // catalog ↔ library mapping for this favorite).
      useIpodStore.getState().prependAppleMusicFavoriteTrack(track);
      void cacheAppleMusicFavoriteSongTrack(track);
      showStatus(
        t("apps.ipod.status.appleMusicAddedToFavorites", "Added to Favorites")
      );
      toast.success(
        t("apps.ipod.dialogs.appleMusicAddedToFavorites", "Added to Favorites")
      );
    } catch (err) {
      toast.error(
        t(
          "apps.ipod.dialogs.appleMusicAddToFavoritesFailed",
          "Failed to add to favorites"
        ),
        {
          description: err instanceof Error ? err.message : String(err),
        }
      );
    }
  }, [registerActivity, showStatus, menuLocale]);

  const handleSwitchToYoutube = useCallback(() => {
    registerActivity();
    if (librarySource === "youtube") return;
    pauseBeforeWindowClose();
    setLibrarySource("youtube");
    setMenuMode(true);
    showStatus(t("apps.ipod.status.libraryYoutube", "Library: YouTube"));
  }, [
    librarySource,
    pauseBeforeWindowClose,
    registerActivity,
    setLibrarySource,
    showStatus,
    menuLocale,
  ]);

  const handleSwitchToAppleMusic = useCallback(() => {
    registerActivity();
    if (librarySource === "appleMusic") return;
    pauseBeforeWindowClose();
    setLibrarySource("appleMusic");
    if (useIpodStore.getState().displayMode === DisplayMode.Video) {
      setDisplayMode(DisplayMode.Cover);
    }
    setMenuMode(true);
    showStatus(
      t("apps.ipod.status.libraryAppleMusic", "Library: Apple Music")
    );
    if (musicKitStatus === "missing-token") {
      toast.error("Apple Music is not configured", {
        description:
          "Set MUSICKIT_TEAM_ID / MUSICKIT_KEY_ID / MUSICKIT_PRIVATE_KEY",
      });
      return;
    }
    if (!appleMusicAuthorized) {
      queueMicrotask(() => {
        void handleAppleMusicSignIn();
      });
    }
  }, [
    appleMusicAuthorized,
    handleAppleMusicSignIn,
    librarySource,
    musicKitStatus,
    pauseBeforeWindowClose,
    registerActivity,
    setDisplayMode,
    setLibrarySource,
    showStatus,
    menuLocale,
  ]);

  useEffect(() => {
    if (isAppleMusic && displayMode === DisplayMode.Video) {
      setDisplayMode(DisplayMode.Cover);
    }
  }, [isAppleMusic, displayMode, setDisplayMode]);

  // Backlight timer
  useEffect(() => {
    if (backlightTimerRef.current) {
      clearTimeout(backlightTimerRef.current);
    }

    if (backlightOn) {
      backlightTimerRef.current = setTimeout(() => {
        const currentShowVideo = useIpodStore.getState().showVideo;
        const currentIsPlaying = useIpodStore.getState().isPlaying;
        const isGameOpen = isMusicQuizOpen || isBrickGameOpen;
        if (
          Date.now() - lastActivityTime >= BACKLIGHT_TIMEOUT_MS &&
          !(currentShowVideo && currentIsPlaying) &&
          !isGameOpen
        ) {
          toggleBacklight();
        }
      }, BACKLIGHT_TIMEOUT_MS);
    }

    return () => {
      if (backlightTimerRef.current) {
        clearTimeout(backlightTimerRef.current);
      }
    };
  }, [
    backlightOn,
    isBrickGameOpen,
    isMusicQuizOpen,
    lastActivityTime,
    toggleBacklight,
  ]);

  // Foreground handling
  useEffect(() => {
    if (isForeground && !prevIsForeground.current) {
      if (!useIpodStore.getState().backlightOn) {
        toggleBacklight();
      }
      registerActivity();
    } else if (!isForeground && prevIsForeground.current) {
      if (useIpodStore.getState().backlightOn) {
        toggleBacklight();
      }
    }
    prevIsForeground.current = isForeground;
  }, [isForeground, toggleBacklight, registerActivity]);

  // Reset elapsed time on track change and set track switching guard
  // This catches track changes from any source (AI tools, shared URLs, menu selections, etc.)
  // Using null as initial value ensures first render triggers the auto-skip check
  const prevCurrentIndexRef = useRef<number | null>(null);
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    // Check if track changed or this is initial render (prevCurrentIndexRef.current is null)
    if (prevCurrentIndexRef.current !== currentIndex) {
      isTrackSwitchingRef.current = true;
      if (trackSwitchTimeoutRef.current) {
        clearTimeout(trackSwitchTimeoutRef.current);
      }
      
      // Get the new track's offset
      const newTrack = tracks[currentIndex];
      const newLyricOffset = newTrack?.lyricOffset ?? 0;
      
      // For negative offset, auto-skip to where lyrics time = 0
      // Formula: lyricsTime = playerTime + (lyricOffset / 1000)
      // When lyricsTime = 0: playerTime = -lyricOffset / 1000
      // Only seek if offset is negative (produces positive seek target)
      // and the seek target is reasonable (less than track duration, at least 1 second)
      const seekTarget = -newLyricOffset / 1000;
      
      if (newLyricOffset < 0 && seekTarget >= 1) {
        useIpodStore.getState().setElapsedTime(seekTarget);
        
        timeoutId = setTimeout(() => {
          isTrackSwitchingRef.current = false;
          const activePlayer = isFullScreen ? fullScreenPlayerRef.current : playerRef.current;
          if (activePlayer) {
            activePlayer.seekTo(seekTarget);
            showStatus(`▶ ${Math.floor(seekTarget / 60)}:${String(Math.floor(seekTarget % 60)).padStart(2, "0")}`);
          }
        }, 2000);
        trackSwitchTimeoutRef.current = timeoutId;
      } else {
        // Start from beginning for positive/zero offset or small negative offset
        useIpodStore.getState().setElapsedTime(0);
        timeoutId = setTimeout(() => {
          isTrackSwitchingRef.current = false;
        }, 2000);
        trackSwitchTimeoutRef.current = timeoutId;
      }
    }
    prevCurrentIndexRef.current = currentIndex;
    return () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        if (trackSwitchTimeoutRef.current === timeoutId) {
          trackSwitchTimeoutRef.current = null;
        }
      }
    };
  }, [currentIndex, tracks, isFullScreen, showStatus]);

  // Cleanup status timeout
  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
      if (trackSwitchTimeoutRef.current) {
        clearTimeout(trackSwitchTimeoutRef.current);
      }
    };
  }, []);

  // Group tracks by artist once per `tracks` change. With large libraries
  // (e.g. an Apple Music sync of several thousand songs) this is expensive
  // enough that we don't want it running on every IpodScreen re-render.
  const unknownArtistLabel = t("apps.ipod.menu.unknownArtist");
  const unknownAlbumLabel = t("apps.ipod.menuItems.unknownAlbum");
  const tracksByArtist = useMemo(() => {
    const grouped: Record<string, { track: Track; index: number }[]> = {};
    for (let index = 0; index < browsableTracks.length; index++) {
      const track = browsableTracks[index];
      const artist = track.artist || unknownArtistLabel;
      const bucket = grouped[artist] || (grouped[artist] = []);
      bucket.push({ track, index });
    }
    return grouped;
  }, [browsableTracks, unknownArtistLabel]);

  const sortedArtists = useMemo(
    () =>
      Object.keys(tracksByArtist).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      ),
    [tracksByArtist]
  );

  const albumGroupsByKey = useMemo(() => {
    const grouped: Record<
      string,
      {
        album: string;
        albumArtist: string;
        tracks: { track: Track; index: number }[];
      }
    > = {};
    for (let index = 0; index < browsableTracks.length; index++) {
      const track = browsableTracks[index];
      const album = track.album || unknownAlbumLabel;
      const albumArtist =
        track.source === "appleMusic"
          ? track.albumArtist || ""
          : track.albumArtist || track.artist || unknownArtistLabel;
      const key = getAlbumGroupingKey(track, unknownAlbumLabel, unknownArtistLabel);
      const group =
        grouped[key] ||
        (grouped[key] = {
          album,
          albumArtist,
          tracks: [],
        });
      group.tracks.push({ track, index });
    }
    return grouped;
  }, [browsableTracks, unknownAlbumLabel, unknownArtistLabel]);

  const sortedAlbums = useMemo(
    () =>
      Object.keys(albumGroupsByKey).sort((a, b) => {
        const albumA = albumGroupsByKey[a];
        const albumB = albumGroupsByKey[b];
        const albumCompare = albumA.album.localeCompare(albumB.album, undefined, {
          sensitivity: "base",
        });
        if (albumCompare !== 0) return albumCompare;
        return albumA.albumArtist.localeCompare(
          albumB.albumArtist,
          undefined,
          { sensitivity: "base" }
        );
      }),
    [albumGroupsByKey]
  );

  const tracksByArtistAlbum = useMemo(() => {
    const grouped: Record<
      string,
      Record<string, { track: Track; index: number }[]>
    > = {};
    for (let index = 0; index < browsableTracks.length; index++) {
      const track = browsableTracks[index];
      const artist = track.artist || unknownArtistLabel;
      const albumKey = getAlbumGroupingKey(
        track,
        unknownAlbumLabel,
        unknownArtistLabel
      );
      const artistAlbums = grouped[artist] || (grouped[artist] = {});
      const bucket =
        artistAlbums[albumKey] || (artistAlbums[albumKey] = []);
      bucket.push({ track, index });
    }
    return grouped;
  }, [browsableTracks, unknownArtistLabel, unknownAlbumLabel]);

  const sortedAlbumsByArtist = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const artist of Object.keys(tracksByArtistAlbum)) {
      result[artist] = Object.keys(tracksByArtistAlbum[artist]).sort((a, b) => {
        const albumA = albumGroupsByKey[a];
        const albumB = albumGroupsByKey[b];
        return (albumA?.album ?? a).localeCompare(albumB?.album ?? b, undefined, {
          sensitivity: "base",
        });
      });
    }
    return result;
  }, [tracksByArtistAlbum, albumGroupsByKey]);

  // Memoize the entire "All Songs" submenu items array. Without this,
  // every render rebuilt N closures, the menu-history sync effect saw a
  // new `items` reference, called `setMenuHistory(updated)`, and re-ran.
  const allSongsMenuItems = useMemo(
    () =>
      browsableTracks.map((track, index) => ({
        label: track.title,
        // Full library queue → pass null to clear any contextual queue.
        action: () => playTrackFromMenu(track, index, null),
        showChevron: false,
        coverUrl: resolveTrackCoverUrl(track),
      })),
    [browsableTracks, playTrackFromMenu]
  );

  const appleMusicRecentlyAddedMenuItems = useMemo(() => {
    const loadingLabel = t("apps.ipod.menuItems.loading", "Loading…");
    if (isAppleMusicRecentlyAddedLoading && appleMusicRecentlyAddedTracks.length === 0) {
      return [
        {
          label: loadingLabel,
          action: () => {},
          showChevron: false,
          isLoading: true,
        },
      ];
    }

    if (appleMusicRecentlyAddedTracks.length === 0) {
      return [
        {
          label: t("apps.ipod.menuItems.noSongs", "No Songs"),
          action: () => {},
          showChevron: false,
        },
      ];
    }

    const queueIds = appleMusicRecentlyAddedTracks.map((track) => track.id);
    return appleMusicRecentlyAddedTracks.map((track, index) => ({
      label: track.title,
      action: () =>
        playAppleMusicTrackFromMenu(
          track,
          index,
          queueIds,
          appleMusicRecentlyAddedTracks
        ),
      showChevron: false,
      coverUrl: resolveTrackCoverUrl(track),
    }));
  }, [
    appleMusicRecentlyAddedTracks,
    isAppleMusicRecentlyAddedLoading,
    playAppleMusicTrackFromMenu,
    menuLocale,
  ]);

  const appleMusicFavoritesMenuItems = useMemo(() => {
    const loadingLabel = t("apps.ipod.menuItems.loading", "Loading…");
    if (isAppleMusicFavoritesLoading && appleMusicFavoriteTracks.length === 0) {
      return [
        {
          label: loadingLabel,
          action: () => {},
          showChevron: false,
          isLoading: true,
        },
      ];
    }

    if (appleMusicFavoriteTracks.length === 0) {
      return [
        {
          label: t("apps.ipod.menuItems.noSongs", "No Songs"),
          action: () => {},
          showChevron: false,
        },
      ];
    }

    const queueIds = appleMusicFavoriteTracks.map((track) => track.id);
    return appleMusicFavoriteTracks.map((track, index) => ({
      label: track.title,
      action: () =>
        playAppleMusicTrackFromMenu(
          track,
          index,
          queueIds,
          appleMusicFavoriteTracks
        ),
      showChevron: false,
      coverUrl: resolveTrackCoverUrl(track),
    }));
  }, [
    appleMusicFavoriteTracks,
    isAppleMusicFavoritesLoading,
    playAppleMusicTrackFromMenu,
    menuLocale,
  ]);

  const appleMusicRadioMenuItems = useMemo(() => {
    const loadingLabel = t("apps.ipod.menuItems.loading", "Loading…");
    if (isAppleMusicRadioLoading && appleMusicRadioTracks.length === 0) {
      return [
        {
          label: loadingLabel,
          action: () => {},
          showChevron: false,
          isLoading: true,
        },
      ];
    }

    if (appleMusicRadioTracks.length === 0) {
      return [
        {
          label: t("apps.ipod.menuItems.noStations", "No Stations"),
          action: () => {},
          showChevron: false,
        },
      ];
    }

    return appleMusicRadioTracks.map((track, index) => ({
      label: track.title,
      action: () =>
        playAppleMusicTrackFromMenu(track, index, [track.id], [track]),
      showChevron: false,
      coverUrl: resolveTrackCoverUrl(track),
    }));
  }, [
    appleMusicRadioTracks,
    isAppleMusicRadioLoading,
    playAppleMusicTrackFromMenu,
    menuLocale,
  ]);

  const artistAllSongsMenuItemsByTitle = useMemo(() => {
    const result: Record<
      string,
      { label: string; action: () => void; showChevron: boolean }[]
    > = {};
    const allSongsLabel = t("apps.ipod.menuItems.allSongs");
    for (const artist of sortedArtists) {
      const artistTracks = tracksByArtist[artist];
      const queueIds = artistTracks.map(({ track }) => track.id);
      const title = `${artist} - ${allSongsLabel}`;
      result[title] = artistTracks.map(({ track }, trackListIndex) => ({
        label: track.title,
        action: () => playTrackFromMenu(track, trackListIndex, queueIds),
        showChevron: false,
        coverUrl: resolveTrackCoverUrl(track),
      }));
    }
    return result;
  }, [tracksByArtist, sortedArtists, playTrackFromMenu, t]);

  const artistAlbumMenuItemsByTitle = useMemo(() => {
    const result: Record<
      string,
      { label: string; action: () => void; showChevron: boolean }[]
    > = {};
    for (const artist of sortedArtists) {
      const albums = sortedAlbumsByArtist[artist] ?? [];
      for (const albumKey of albums) {
        const albumTracks = tracksByArtistAlbum[artist]?.[albumKey] ?? [];
        const queueIds = albumTracks.map(({ track }) => track.id);
        const title = `${artist}\u0000${albumKey}`;
        result[title] = albumTracks.map(({ track }, trackListIndex) => ({
          label: track.title,
          action: () => playTrackFromMenu(track, trackListIndex, queueIds),
          showChevron: false,
          coverUrl: resolveTrackCoverUrl(track),
        }));
      }
    }
    return result;
  }, [
    sortedArtists,
    sortedAlbumsByArtist,
    tracksByArtistAlbum,
    playTrackFromMenu,
  ]);

  // Per-artist submenu items, memoized as a map so `rebuildMenuItems` can
  // return stable references and skip pointless `setMenuHistory` calls.
  const artistMenuItemsByArtist = useMemo(() => {
    const result: Record<
      string,
      { label: string; action: () => void; showChevron: boolean }[]
    > = {};
    const allLabel = t("apps.ipod.menuItems.all");
    const allSongsLabel = t("apps.ipod.menuItems.allSongs");
    for (const artist of sortedArtists) {
      const allSongsTitle = `${artist} - ${allSongsLabel}`;
      const artistTracks = tracksByArtist[artist] ?? [];
      const artistAllCoverTrack = artistTracks.find(
        ({ track }) => resolveTrackCoverUrl(track) !== null
      )?.track ?? artistTracks[0]?.track ?? null;
      const albumItems = (sortedAlbumsByArtist[artist] ?? []).map((albumKey) => {
        const album = albumGroupsByKey[albumKey]?.album ?? albumKey;
        const albumTitle = `${artist}\u0000${albumKey}`;
        const albumTracks = tracksByArtistAlbum[artist]?.[albumKey] ?? [];
        const albumCoverTrack = albumTracks.find(
          ({ track }) => resolveTrackCoverUrl(track) !== null
        )?.track ?? albumTracks[0]?.track ?? null;
        return {
          label: album,
          subtitle: artist,
          action: () => {
            registerActivity();
            pushMenuChild({
              title: albumTitle,
              displayTitle: album,
              items: artistAlbumMenuItemsByTitle[albumTitle] ?? EMPTY_IPOD_MENU_ITEMS,
              selectedIndex: 0,
            });
          },
          showChevron: true,
          coverUrl: resolveTrackCoverUrl(albumCoverTrack),
        };
      });

      result[artist] = [
        {
          label: allLabel,
          subtitle: allSongsLabel,
          action: () => {
            registerActivity();
            pushMenuChild({
              title: allSongsTitle,
              items: artistAllSongsMenuItemsByTitle[allSongsTitle] ?? EMPTY_IPOD_MENU_ITEMS,
              selectedIndex: 0,
            });
          },
          showChevron: true,
          coverUrl: resolveTrackCoverUrl(artistAllCoverTrack),
        },
        ...albumItems,
      ];
    }
    return result;
  }, [
    sortedArtists,
    sortedAlbumsByArtist,
    albumGroupsByKey,
    artistAllSongsMenuItemsByTitle,
    artistAlbumMenuItemsByTitle,
    tracksByArtist,
    tracksByArtistAlbum,
    registerActivity,
    pushMenuChild,
    menuLocale,
  ]);

  const albumMenuItemsByAlbum = useMemo(() => {
    const result: Record<
      string,
      { label: string; action: () => void; showChevron: boolean }[]
    > = {};
    for (const albumKey of sortedAlbums) {
      const albumTracks = albumGroupsByKey[albumKey].tracks;
      const queueIds = albumTracks.map(({ track }) => track.id);
      result[albumKey] = albumTracks.map(({ track }, trackListIndex) => ({
        label: track.title,
        action: () => playTrackFromMenu(track, trackListIndex, queueIds),
        showChevron: false,
        coverUrl: resolveTrackCoverUrl(track),
      }));
    }
    return result;
  }, [albumGroupsByKey, sortedAlbums, playTrackFromMenu]);

  const albumsListMenuItems = useMemo(
    () => {
      const allLabel = t("apps.ipod.menuItems.all");
      const allSongsLabel = t("apps.ipod.menuItems.allSongs");
      return [
        {
          label: allLabel,
          action: () => {
            registerActivity();
            pushMenuChild({
              title: allSongsLabel,
              items: allSongsMenuItems,
              selectedIndex: 0,
            });
          },
          showChevron: true,
        },
        ...sortedAlbums.map((albumKey) => {
          const albumTracks = albumGroupsByKey[albumKey]?.tracks ?? [];
          const albumCoverTrack = albumTracks.find(
            ({ track }) => resolveTrackCoverUrl(track) !== null
          )?.track ?? albumTracks[0]?.track ?? null;
          return {
            label: albumGroupsByKey[albumKey].album,
            action: () => {
              registerActivity();
              pushMenuChild({
                title: albumKey,
                displayTitle: albumGroupsByKey[albumKey].album,
                items: albumMenuItemsByAlbum[albumKey],
                selectedIndex: 0,
              });
            },
            showChevron: true,
            coverUrl: resolveTrackCoverUrl(albumCoverTrack),
          };
        }),
      ];
    },
    [
      sortedAlbums,
      albumGroupsByKey,
      albumMenuItemsByAlbum,
      allSongsMenuItems,
      registerActivity,
      pushMenuChild,
      menuLocale,
    ]
  );

  const artistsListMenuItems = useMemo(
    () => {
      const allLabel = t("apps.ipod.menuItems.all");
      const albumsLabel = t("apps.ipod.menuItems.albums");
      return [
        {
          label: allLabel,
          action: () => {
            registerActivity();
            pushMenuChild({
              title: albumsLabel,
              items: albumsListMenuItems,
              selectedIndex: 0,
            });
          },
          showChevron: true,
        },
        ...sortedArtists.map((artist) => {
          const artistTracks = tracksByArtist[artist] ?? [];
          const artistCoverTrack = artistTracks.find(
            ({ track }) => resolveTrackCoverUrl(track) !== null
          )?.track ?? artistTracks[0]?.track ?? null;
          return {
            label: artist,
            action: () => {
              registerActivity();
              pushMenuChild({
                title: artist,
                items: artistMenuItemsByArtist[artist],
                selectedIndex: 0,
                modernMediaList: true,
              });
            },
            showChevron: true,
            coverUrl: resolveTrackCoverUrl(artistCoverTrack),
          };
        }),
      ];
    },
    [
      sortedArtists,
      artistMenuItemsByArtist,
      albumsListMenuItems,
      tracksByArtist,
      registerActivity,
      pushMenuChild,
      menuLocale,
    ]
  );

  const loadingLabel = t("apps.ipod.menuItems.loading", "Loading…");
  const applePlaylistTrackMenuItemsByPlaylist = useMemo(() => {
    const result: Record<
      string,
      {
        label: string;
        action: () => void;
        showChevron: boolean;
        isLoading?: boolean;
      }[]
    > = {};
    for (const playlist of appleMusicPlaylists) {
      const playlistTracks = appleMusicPlaylistTracks[playlist.id] ?? [];
      const isLoading =
        appleMusicPlaylistTracksLoading[playlist.id] === true &&
        playlistTracks.length === 0;
      if (isLoading) {
        result[playlist.id] = [
          {
            label: loadingLabel,
            action: () => {},
            showChevron: false,
            isLoading: true,
          },
        ];
      } else {
        const queueIds = playlistTracks.map((t) => t.id);
        result[playlist.id] = playlistTracks.map((track, trackListIndex) => ({
          label: track.title,
          action: () =>
            playAppleMusicTrackFromMenu(
              track,
              trackListIndex,
              queueIds,
              playlistTracks
            ),
          showChevron: false,
          coverUrl: resolveTrackCoverUrl(track),
        }));
      }
    }
    return result;
  }, [
    appleMusicPlaylists,
    appleMusicPlaylistTracks,
    appleMusicPlaylistTracksLoading,
    playAppleMusicTrackFromMenu,
    loadingLabel,
  ]);

  const applePlaylistsMenuItems = useMemo(
    () =>
      appleMusicPlaylists.map((playlist) => {
        // Prefer the playlist's own artwork (Apple Music supplies it
        // directly via MusicKit). Fall back to the first cached track
        // with usable artwork so playlists imported before the artwork
        // arrived still show something representative.
        const playlistTracks = appleMusicPlaylistTracks[playlist.id] ?? [];
        const firstTrackWithCover = playlistTracks.find(
          (track) => resolveTrackCoverUrl(track) !== null
        );
        const coverUrl =
          playlist.artworkUrl ??
          (firstTrackWithCover ? resolveTrackCoverUrl(firstTrackWithCover) : null);
        return {
          label: playlist.name,
          subtitle: playlist.description,
          action: () => {
            registerActivity();
            requestPlaylistTracksIfNeeded(playlist.id);
            pushMenuChild({
              title: playlist.name,
              items: applePlaylistTrackMenuItemsByPlaylist[playlist.id] ?? EMPTY_IPOD_MENU_ITEMS,
              selectedIndex: 0,
            });
          },
          showChevron: true,
          coverUrl,
        };
      }),
    [
      appleMusicPlaylists,
      appleMusicPlaylistTracks,
      applePlaylistTrackMenuItemsByPlaylist,
      registerActivity,
      requestPlaylistTracksIfNeeded,
      pushMenuChild,
    ]
  );

  // Menu items
  const musicMenuItems = useMemo(() => {
    const allSongsLabel = t("apps.ipod.menuItems.allSongs");
    const songsLabel = t("apps.ipod.menuItems.songs");
    const playlistsLabel = t("apps.ipod.menuItems.playlists");
    const artistsLabel = t("apps.ipod.menuItems.artists");
    const albumsLabel = t("apps.ipod.menuItems.albums");
    const coverFlowLabel = t("apps.ipod.menu.coverFlow", "Cover Flow");
    const recentlyAddedLabel = t(
      "apps.ipod.menuItems.recentlyAdded",
      "Recently Added"
    );
    const favoriteSongsLabel = t(
      "apps.ipod.menuItems.favoriteSongs",
      "Favorite Songs"
    );
    const radioLabel = t("apps.ipod.menuItems.radio", "Radio");
    const geniusLabel = t("apps.ipod.menuItems.genius", "Genius");

    const pushSubmenu = (
      title: string,
      items: MenuItem[],
      options?: { modernMediaList?: boolean }
    ) => {
      registerActivity();
      pushMenuChild({
        title,
        items,
        selectedIndex: 0,
        ...options,
      });
    };

    const coverFlowItem = {
      label: coverFlowLabel,
      action: () => {
        registerActivity();
        // Forward slide direction so the modern UI's inline Cover
        // Flow enters from the right (x: 100% → 0) — same as
        // navigating from menu into now-playing.
        setMenuDirection("forward");
        setIsCoverFlowOpen(true);
      },
      showChevron: true,
    };

    if (isAppleMusic) {
      return [
        coverFlowItem,
        {
          label: recentlyAddedLabel,
          action: () => {
            registerActivity();
            pushMenuChild({
              title: recentlyAddedLabel,
              items: appleMusicRecentlyAddedMenuItems,
              selectedIndex: 0,
            });
            void loadAppleMusicRecentlyAdded();
          },
          showChevron: true,
        },
        {
          label: favoriteSongsLabel,
          action: () => {
            registerActivity();
            pushMenuChild({
              title: favoriteSongsLabel,
              items: appleMusicFavoritesMenuItems,
              selectedIndex: 0,
            });
            void loadAppleMusicFavorites();
          },
          showChevron: true,
        },
        {
          label: playlistsLabel,
          action: () =>
            pushSubmenu(playlistsLabel, applePlaylistsMenuItems, {
              modernMediaList: true,
            }),
          showChevron: true,
        },
        {
          label: artistsLabel,
          action: () => pushSubmenu(artistsLabel, artistsListMenuItems),
          showChevron: true,
        },
        {
          label: albumsLabel,
          action: () => pushSubmenu(albumsLabel, albumsListMenuItems),
          showChevron: true,
        },
        {
          label: songsLabel,
          action: () => pushSubmenu(songsLabel, allSongsMenuItems),
          showChevron: true,
        },
        {
          label: radioLabel,
          action: () => {
            registerActivity();
            pushMenuChild({
              title: radioLabel,
              items: appleMusicRadioMenuItems,
              selectedIndex: 0,
            });
            void loadAppleMusicRadioStations();
          },
          showChevron: true,
        },
        {
          label: isAppleMusicGeniusLoading ? loadingLabel : geniusLabel,
          action: () => {
            void playAppleMusicGenius();
          },
          showChevron: false,
        },
      ];
    }

    return [
      coverFlowItem,
      {
        label: artistsLabel,
        action: () => pushSubmenu(artistsLabel, artistsListMenuItems),
        showChevron: true,
      },
      {
        label: albumsLabel,
        action: () => pushSubmenu(albumsLabel, albumsListMenuItems),
        showChevron: true,
      },
      {
        label: songsLabel,
        action: () => pushSubmenu(allSongsLabel, allSongsMenuItems),
        showChevron: true,
      },
    ];
  }, [
    isAppleMusic,
    allSongsMenuItems,
    appleMusicFavoritesMenuItems,
    appleMusicRecentlyAddedMenuItems,
    appleMusicRadioMenuItems,
    artistsListMenuItems,
    albumsListMenuItems,
    applePlaylistsMenuItems,
    loadAppleMusicFavorites,
    loadAppleMusicRecentlyAdded,
    loadAppleMusicRadioStations,
    playAppleMusicGenius,
    isAppleMusicGeniusLoading,
    loadingLabel,
    registerActivity,
    pushMenuChild,
    menuLocale,
  ]);

  const settingsMenuItems = useMemo(() => {
    const sourceLabel = isAppleMusic
      ? t("apps.ipod.menuItems.libraryAppleMusic", "Apple Music")
      : t("apps.ipod.menuItems.libraryYoutube", "YouTube");

    return [
      {
        label: t("apps.ipod.menuItems.repeat"),
        action: memoizedToggleRepeat,
        showChevron: false,
        value: loopCurrent
          ? t("apps.ipod.menuItems.one")
          : loopAll
          ? t("apps.ipod.menuItems.all")
          : t("apps.ipod.menuItems.off"),
      },
      {
        label: t("apps.ipod.menuItems.shuffle"),
        action: memoizedToggleShuffle,
        showChevron: false,
        value: isShuffled ? t("apps.ipod.menuItems.on") : t("apps.ipod.menuItems.off"),
      },
      {
        label: t("apps.ipod.menuItems.backlight"),
        action: memoizedToggleBacklight,
        showChevron: false,
        value: backlightOn ? t("apps.ipod.menuItems.on") : t("apps.ipod.menuItems.off"),
      },
      {
        label: t("apps.ipod.menuItems.theme"),
        action: memoizedHandleThemeChange,
        showChevron: false,
        value:
          theme === "classic"
            ? t("apps.ipod.menu.classic")
            : theme === "black"
            ? t("apps.ipod.menu.black")
            : t("apps.ipod.menu.u2"),
      },
      {
        label: t("apps.ipod.menuItems.librarySource", "Library"),
        action: () => {
          if (isAppleMusic) {
            handleSwitchToYoutube();
          } else {
            handleSwitchToAppleMusic();
          }
        },
        showChevron: false,
        value: sourceLabel,
      },
      {
        label: appleMusicAuthorized
          ? t("apps.ipod.menuItems.appleMusicSignOut", "Apple Music")
          : t("apps.ipod.menuItems.appleMusicSignIn", "Apple Music"),
        action: appleMusicAuthorized
          ? () => void handleAppleMusicSignOut()
          : () => void handleAppleMusicSignIn(),
        showChevron: false,
        value:
          musicKitStatus === "missing-token"
            ? t("apps.ipod.menuItems.unconfigured", "Unconfigured")
            : appleMusicAuthorized
            ? t("apps.ipod.menuItems.signedIn", "Signed In")
            : t("apps.ipod.menuItems.signedOut", "Signed Out"),
      },
    ];
  }, [
    loopCurrent,
    loopAll,
    isShuffled,
    backlightOn,
    theme,
    memoizedToggleRepeat,
    memoizedToggleShuffle,
    memoizedToggleBacklight,
    memoizedHandleThemeChange,
    isAppleMusic,
    appleMusicAuthorized,
    musicKitStatus,
    handleSwitchToYoutube,
    handleSwitchToAppleMusic,
    handleAppleMusicSignIn,
    handleAppleMusicSignOut,
    menuLocale,
  ]);

  const musicMenuItemsRef = useRef(musicMenuItems);
  musicMenuItemsRef.current = musicMenuItems;
  const settingsMenuItemsRef = useRef(settingsMenuItems);
  settingsMenuItemsRef.current = settingsMenuItems;

  const mainMenuItems = useMemo(() => {
    const musicLabel = t("apps.ipod.menuItems.music");
    const settingsLabel = t("apps.ipod.menuItems.settings");
    return [
      {
        label: musicLabel,
        action: () => {
          registerActivity();
          if (useIpodStore.getState().showVideo) toggleVideo();
          pushMenuChild({
            title: musicLabel,
            items: musicMenuItemsRef.current,
            selectedIndex: 0,
          });
        },
        showChevron: true,
      },
      {
        label: t("apps.ipod.menuItems.extras"),
        action: () => {
          registerActivity();
          if (useIpodStore.getState().showVideo) toggleVideo();
          const extrasLabel = t("apps.ipod.menuItems.extras");
          const extrasItems = [
            {
              label: t("apps.ipod.menuItems.musicQuiz"),
              action: () => {
                registerActivity();
                if (isOffline) {
                  showOfflineStatus();
                  return;
                }
                // Save what was playing so we can restore the paused state on exit
                wasPlayingBeforeQuizRef.current = useIpodStore.getState().isPlaying;
                if (wasPlayingBeforeQuizRef.current) {
                  setIsPlaying(false);
                }
                if (useIpodStore.getState().showVideo) toggleVideo();
                setIsMusicQuizOpen(true);
              },
              showChevron: true,
            },
            {
              label: t("apps.ipod.menuItems.brickGame", "Brick"),
              action: () => {
                registerActivity();
                // Pause any playback while the game is open (works offline).
                wasPlayingBeforeBrickGameRef.current = useIpodStore.getState().isPlaying;
                if (wasPlayingBeforeBrickGameRef.current) {
                  setIsPlaying(false);
                }
                if (useIpodStore.getState().showVideo) toggleVideo();
                setIsBrickGameOpen(true);
              },
              showChevron: true,
            },
            {
              label: t("apps.ipod.menu.searchSongs", "Search Songs..."),
              action: () => {
                registerActivity();
                setIsSongSearchDialogOpen(true);
              },
              showChevron: false,
            },
          ];
          pushMenuChild({
            title: extrasLabel,
            items: extrasItems,
            selectedIndex: 0,
          });
        },
        showChevron: true,
      },
      {
        label: settingsLabel,
        action: () => {
          registerActivity();
          if (useIpodStore.getState().showVideo) toggleVideo();
          pushMenuChild({
            title: settingsLabel,
            items: settingsMenuItemsRef.current,
            selectedIndex: 0,
          });
        },
        showChevron: true,
      },
      {
        label: t("apps.ipod.menuItems.shuffleSongs"),
        action: () => {
          registerActivity();
          if (useIpodStore.getState().showVideo) toggleVideo();
          // Shuffle across the full library — drop any contextual queue.
          if (useIpodStore.getState().librarySource === "appleMusic") {
            useIpodStore.getState().setAppleMusicPlaybackQueue(null);
          }
          memoizedToggleShuffle();
          setMenuMode(false);
        },
        showChevron: false,
      },
      {
        label: t("apps.ipod.menuItems.backlight"),
        action: () => memoizedToggleBacklight(),
        showChevron: false,
      },
      {
        label: t("apps.ipod.menuItems.nowPlaying"),
        action: () => {
          registerActivity();
          setMenuDirection("forward");
          setMenuMode(false);
          setCameFromNowPlayingMenuItem(true);
        },
        showChevron: true,
      },
    ];
  }, [registerActivity, toggleVideo, memoizedToggleShuffle, memoizedToggleBacklight, menuLocale, isOffline, showOfflineStatus, setIsPlaying, pushMenuChild]);

  const mainMenuItemsRef = useRef(mainMenuItems);
  mainMenuItemsRef.current = mainMenuItems;
  const suppressMenuSyncRef = useRef(false);
  const pendingMenuSelectionClampRef = useRef<number | null>(null);

  // Hot-swapping libraries leaves Apple Music–specific submenu levels in
  // `menuHistory`. Reset to the root so stale levels don't spin the sync
  // effect when `rebuildMenuItems` mappings change.
  const prevLibrarySourceRef = useRef(librarySource);
  useEffect(() => {
    if (prevLibrarySourceRef.current === librarySource) return;
    prevLibrarySourceRef.current = librarySource;

    suppressMenuSyncRef.current = true;
    const ipodLabel = t("apps.ipod.menuItems.ipod");
    setMenuDirection("forward");
    setSelectedMenuItem(0);
    setMenuHistory([
      {
        title: ipodLabel,
        items: mainMenuItemsRef.current,
        selectedIndex: 0,
      },
    ]);
    menuHistoryBeforeNowPlayingRef.current = null;
    setIsCoverFlowOpen(false);
    queueMicrotask(() => {
      suppressMenuSyncRef.current = false;
    });
  }, [librarySource, menuLocale, setIsCoverFlowOpen, setMenuDirection, setSelectedMenuItem, t]);

  // Helper function to rebuild menu items based on current tracks
  const rebuildMenuItems = useCallback((menu: typeof menuHistory[0]): typeof menuHistory[0]["items"] | null => {
    if (menu.title === t("apps.ipod.menuItems.ipod")) {
      return mainMenuItems;
    } else if (menu.title === t("apps.ipod.menuItems.music")) {
      return musicMenuItems;
    } else if (menu.title === t("apps.ipod.menuItems.settings")) {
      return settingsMenuItems;
    } else if (
      !isAppleMusic &&
      (menu.title === t("apps.ipod.menuItems.recentlyAdded", "Recently Added") ||
        menu.title === t("apps.ipod.menuItems.favoriteSongs", "Favorite Songs") ||
        menu.title === t("apps.ipod.menuItems.radio", "Radio") ||
        menu.title === t("apps.ipod.menuItems.playlists"))
    ) {
      return null;
    } else if (
      menu.title === t("apps.ipod.menuItems.recentlyAdded", "Recently Added")
    ) {
      return appleMusicRecentlyAddedMenuItems;
    } else if (
      menu.title === t("apps.ipod.menuItems.favoriteSongs", "Favorite Songs")
    ) {
      return appleMusicFavoritesMenuItems;
    } else if (menu.title === t("apps.ipod.menuItems.radio", "Radio")) {
      return appleMusicRadioMenuItems;
    } else if (menu.title === t("apps.ipod.menuItems.extras")) {
      // Extras submenu has stable items; keep existing references to avoid stale closures.
      return menu.items;
    } else if (
      menu.title === t("apps.ipod.menuItems.allSongs") ||
      menu.title === t("apps.ipod.menuItems.songs")
    ) {
      // Return the memoized array — same reference unless tracks changed,
      // so the menu-history sync effect skips a redundant setMenuHistory.
      return allSongsMenuItems;
    } else if (menu.title === t("apps.ipod.menuItems.playlists")) {
      return applePlaylistsMenuItems;
    } else if (menu.title === t("apps.ipod.menuItems.artists")) {
      return artistsListMenuItems;
    } else if (menu.title === t("apps.ipod.menuItems.albums")) {
      return albumsListMenuItems;
    } else if (artistAllSongsMenuItemsByTitle[menu.title]) {
      return artistAllSongsMenuItemsByTitle[menu.title];
    } else if (artistAlbumMenuItemsByTitle[menu.title]) {
      return artistAlbumMenuItemsByTitle[menu.title];
    } else if (artistMenuItemsByArtist[menu.title]) {
      return artistMenuItemsByArtist[menu.title];
    } else if (albumMenuItemsByAlbum[menu.title]) {
      return albumMenuItemsByAlbum[menu.title];
    } else {
      const playlist = appleMusicPlaylists.find(
        (entry) => entry.name === menu.title
      );
      if (playlist) {
        return (
          applePlaylistTrackMenuItemsByPlaylist[playlist.id] ??
          EMPTY_IPOD_MENU_ITEMS
        );
      }
    }
    return null;
  }, [
    mainMenuItems,
    musicMenuItems,
    settingsMenuItems,
    isAppleMusic,
    appleMusicFavoritesMenuItems,
    appleMusicRecentlyAddedMenuItems,
    appleMusicRadioMenuItems,
    allSongsMenuItems,
    artistAllSongsMenuItemsByTitle,
    artistAlbumMenuItemsByTitle,
    artistMenuItemsByArtist,
    albumMenuItemsByAlbum,
    artistsListMenuItems,
    albumsListMenuItems,
    applePlaylistsMenuItems,
    applePlaylistTrackMenuItemsByPlaylist,
    appleMusicPlaylists,
    menuLocale,
  ]);

  // Restore menu navigation from the persisted breadcrumb on first mount.
  //
  // The breadcrumb stores only `{ title, selectedIndex }` per level (action
  // closures and rebuilt items aren't serializable). Reconstruct the full
  // `menuHistory` by walking the breadcrumb through `rebuildMenuItems` so
  // every level is freshly bound to the current handler closures.
  //
  // Some menus depend on async-loaded data (Apple Music playlists,
  // playlist tracks). If a level can't be rebuilt yet, the menu-sync
  // effect below will fill in the items as soon as the data arrives.
  const hasInitializedMenuRef = useRef(false);
  useEffect(() => {
    if (hasInitializedMenuRef.current) return;
    if (menuHistory.length > 0) {
      hasInitializedMenuRef.current = true;
      return;
    }

    const breadcrumb = useIpodStore.getState().ipodMenuBreadcrumb;
    const ipodLabel = t("apps.ipod.menuItems.ipod");
    const baseMenu = {
      title: ipodLabel,
      items: mainMenuItems,
      selectedIndex: 0,
    };

    if (!breadcrumb || breadcrumb.length === 0) {
      setMenuHistory([baseMenu]);
      hasInitializedMenuRef.current = true;
      return;
    }
    for (const entry of breadcrumb) {
      rememberedMenuSelectedIndexRef.current[entry.title] =
        entry.selectedIndex;
    }

    // Walk the breadcrumb. The first entry should be the iPod root —
    // tolerate a missing/renamed root and synthesize one when needed so
    // we never strand the user with an empty menu.
    const restored: typeof menuHistory = [];
    for (let i = 0; i < breadcrumb.length; i++) {
      const entry = breadcrumb[i];
      if (i === 0) {
        // Force the first entry to be the localized root label so back
        // navigation always lands at the iPod main menu.
        restored.push({
          title: ipodLabel,
          items: mainMenuItems,
          selectedIndex: Math.max(0, Math.min(entry.selectedIndex, mainMenuItems.length - 1)),
        });
        continue;
      }
      const skeleton = { title: entry.title, items: [], selectedIndex: 0 };
      const rebuilt = rebuildMenuItems(skeleton);
      // If we can't rebuild a level (e.g. the menu shape changed after an
      // app update, or async data hasn't arrived yet), stop walking — the
      // menu-sync effect will pick it up later, but for now show the user
      // the deepest level we *can* rebuild rather than dropping them at
      // the root.
      if (!rebuilt) break;
      const safeIdx =
        rebuilt.length > 0
          ? Math.max(
              0,
              Math.min(entry.selectedIndex, Math.max(0, rebuilt.length - 1))
            )
          : Math.max(0, entry.selectedIndex);
      restored.push({
        title: entry.title,
        displayTitle: entry.displayTitle,
        modernMediaList: entry.modernMediaList,
        items: rebuilt,
        selectedIndex: safeIdx,
      });
    }

    setMenuHistory(restored);
    const deepest = restored[restored.length - 1];
    if (deepest) setSelectedMenuItem(deepest.selectedIndex);

    // Restore menuMode from the persisted state if available — but only
    // when the user actually has a current track to fall back to (no
    // sense restoring "Now Playing" when there's nothing playable).
    const persistedMenuMode = useIpodStore.getState().ipodMenuMode;
    if (typeof persistedMenuMode === "boolean") {
      const storeState = useIpodStore.getState();
      const tracksForMode =
        storeState.librarySource === "appleMusic"
          ? storeState.appleMusicTracks
          : storeState.tracks;
      const sourceCurrent =
        storeState.librarySource === "appleMusic"
          ? storeState.appleMusicCurrentSongId
          : storeState.currentSongId;
      const hasValidTrack =
        tracksForMode.length > 0 &&
        (!sourceCurrent || tracksForMode.some((t) => t.id === sourceCurrent));
      if (persistedMenuMode === true || hasValidTrack) {
        setMenuMode(persistedMenuMode);
      }
    }

    hasInitializedMenuRef.current = true;
    // Run once on mount with whatever data is currently available; the
    // menu-sync effect upgrades empty levels as data flows in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update menu when items change - update ALL menus in history, not just the current one
  // Also update the saved menu history ref that's used when returning from Now Playing
  useEffect(() => {
    if (suppressMenuSyncRef.current) return;

    // Helper to update a menu history array with fresh items
    const updateHistory = (history: typeof menuHistory): { updated: typeof menuHistory; hasChanges: boolean } => {
      let hasChanges = false;
      const updatedHistory = history.map((menu) => {
        const latestItems = rebuildMenuItems(menu);

        if (latestItems && menu.items !== latestItems) {
          hasChanges = true;
          // Preserve selected index but clamp it to valid range
          const clampedSelectedIndex = Math.min(menu.selectedIndex, latestItems.length - 1);
          return { ...menu, items: latestItems, selectedIndex: Math.max(0, clampedSelectedIndex) };
        }
        return menu;
      });
      return { updated: updatedHistory, hasChanges };
    };

    // Update the main menu history
    setMenuHistory((prevHistory) => {
      if (prevHistory.length === 0) return prevHistory;

      const { updated, hasChanges } = updateHistory(prevHistory);

      if (hasChanges) {
        const currentMenu = updated[updated.length - 1];
        if (currentMenu) {
          const clamped = Math.max(
            0,
            Math.min(
              selectedMenuItemRef.current,
              Math.max(0, currentMenu.items.length - 1)
            )
          );
          if (clamped !== selectedMenuItemRef.current) {
            pendingMenuSelectionClampRef.current = clamped;
          }
        }
      }

      return hasChanges ? updated : prevHistory;
    });

    // Also update the saved menu history ref (used when returning from Now Playing)
    // This ensures that if a track was added while in Now Playing, the menu will be updated when going back
    if (menuHistoryBeforeNowPlayingRef.current && menuHistoryBeforeNowPlayingRef.current.length > 0) {
      const { updated, hasChanges } = updateHistory(menuHistoryBeforeNowPlayingRef.current);
      if (hasChanges) {
        menuHistoryBeforeNowPlayingRef.current = updated;
      }
    }
  }, [rebuildMenuItems]);

  useEffect(() => {
    const clamped = pendingMenuSelectionClampRef.current;
    if (clamped === null) return;
    pendingMenuSelectionClampRef.current = null;
    setSelectedMenuItem(clamped);
  }, [menuHistory, setSelectedMenuItem]);

  // Persist the menu navigation breadcrumb whenever the user moves around
  // the menus or moves the cursor. We only store `{ title, selectedIndex }`
  // per level — actions and item arrays are recomputed on restore via
  // `rebuildMenuItems`. The deepest entry's `selectedIndex` mirrors the
  // live cursor (`selectedMenuItem`) so reopening lands the user on the
  // exact item they were sitting on.
  useEffect(() => {
    if (!hasInitializedMenuRef.current) return;
    if (menuHistory.length === 0) return;

    const breadcrumb = menuHistory.map((menu, i) => ({
      title: menu.title,
      displayTitle: menu.displayTitle,
      modernMediaList: menu.modernMediaList,
      selectedIndex:
        i === menuHistory.length - 1 ? selectedMenuItem : menu.selectedIndex,
    }));
    for (const entry of breadcrumb) {
      rememberedMenuSelectedIndexRef.current[entry.title] =
        entry.selectedIndex;
    }

    const store = useIpodStore.getState();
    const prev = store.ipodMenuBreadcrumb;
    const isSame =
      prev != null &&
      prev.length === breadcrumb.length &&
      prev.every(
        (entry, i) =>
          entry.title === breadcrumb[i].title &&
          entry.displayTitle === breadcrumb[i].displayTitle &&
          entry.modernMediaList === breadcrumb[i].modernMediaList &&
          entry.selectedIndex === breadcrumb[i].selectedIndex
      );
    if (!isSame) store.setIpodMenuBreadcrumb(breadcrumb);
  }, [menuHistory, selectedMenuItem]);

  // Persist menuMode separately — small enough that we don't bother
  // batching with the breadcrumb effect.
  useEffect(() => {
    if (!hasInitializedMenuRef.current) return;
    const store = useIpodStore.getState();
    if (store.ipodMenuMode !== menuMode) {
      store.setIpodMenuMode(menuMode);
    }
  }, [menuMode]);

  // Helper to mark track switch start and schedule end
  const startTrackSwitch = useCallback(() => {
    isTrackSwitchingRef.current = true;
    if (trackSwitchTimeoutRef.current) {
      clearTimeout(trackSwitchTimeoutRef.current);
    }
    // Allow 2 seconds for YouTube to load before accepting play/pause events
    trackSwitchTimeoutRef.current = setTimeout(() => {
      isTrackSwitchingRef.current = false;
    }, 2000);
  }, []);

  const getCurrentAppleMusicCollectionShellTrack = useCallback(() => {
    const state = useIpodStore.getState();
    if (state.librarySource !== "appleMusic" || !state.appleMusicCurrentSongId) {
      return null;
    }
    const track =
      state.appleMusicTracks.find(
        (candidate) => candidate.id === state.appleMusicCurrentSongId
      ) ??
      appleMusicRadioTracks.find(
        (candidate) => candidate.id === state.appleMusicCurrentSongId
      ) ??
      null;
    return track && isAppleMusicCollectionTrack(track) ? track : null;
  }, [appleMusicRadioTracks]);

  const skipAppleMusicCollectionShell = useCallback(
    async (direction: "next" | "previous") => {
      const shellTrack = getCurrentAppleMusicCollectionShellTrack();
      if (!shellTrack) return false;
      const activePlayer = isFullScreen
        ? fullScreenPlayerRef.current
        : playerRef.current;
      const instance = activePlayer?.getInternalPlayer?.();
      if (!instance) return false;

      const isStation = Boolean(shellTrack.appleMusicPlayParams?.stationId);
      const skipNext =
        direction === "next" ||
        isStation ||
        typeof instance.skipToPreviousItem !== "function";
      if (skipNext && typeof instance.skipToNextItem !== "function") {
        return false;
      }
      if (!skipNext && typeof instance.skipToPreviousItem !== "function") {
        return false;
      }

      try {
        skipOperationRef.current = true;
        startTrackSwitch();
        useIpodStore.getState().setElapsedTime(0);
        useIpodStore.getState().setTotalTime(0);
        if (skipNext) {
          await instance.skipToNextItem();
        } else {
          await instance.skipToPreviousItem();
        }
        setIsPlaying(true);
        showStatus(direction === "previous" ? "⏮" : "⏭");
        return true;
      } catch (err) {
        console.warn("[apple music] failed to skip collection queue item", err);
        return false;
      }
    },
    [
      getCurrentAppleMusicCollectionShellTrack,
      isFullScreen,
      setIsPlaying,
      showStatus,
      startTrackSwitch,
    ]
  );

  const nextTrack = useCallback(() => {
    if (getCurrentAppleMusicCollectionShellTrack()) {
      void skipAppleMusicCollectionShell("next");
      return;
    }
    rawNextTrack();
  }, [
    getCurrentAppleMusicCollectionShellTrack,
    rawNextTrack,
    skipAppleMusicCollectionShell,
  ]);

  const previousTrack = useCallback(() => {
    if (getCurrentAppleMusicCollectionShellTrack()) {
      void skipAppleMusicCollectionShell("previous");
      return;
    }
    rawPreviousTrack();
  }, [
    getCurrentAppleMusicCollectionShellTrack,
    rawPreviousTrack,
    skipAppleMusicCollectionShell,
  ]);

  // Track handling
  const handleAddTrack = useCallback(
    async (url: string) => {
      setIsAddingSong(true);
      try {
        const addedTrack = await useIpodStore.getState().addTrackFromVideoId(url);
        if (addedTrack) {
          showStatus(t("apps.ipod.status.added"));
          // Start track switch guard since addTrackFromVideoId sets currentIndex to 0 and isPlaying to true
          startTrackSwitch();
        } else {
          throw new Error("Failed to add track");
        }
      } finally {
        setIsAddingSong(false);
      }
    },
    [showStatus, t, startTrackSwitch]
  );

  const processVideoId = useCallback(
    async (videoId: string) => {
      // YouTube share URLs always target the YouTube library — switch the
      // active source first so the shared track lands in the right slice
      // and uses the right setter / nav methods.
      if (useIpodStore.getState().librarySource !== "youtube") {
        setLibrarySource("youtube");
      }

      const currentTracks = useIpodStore.getState().tracks;
      const existingTrack = currentTracks.find((track) => track.id === videoId);
      const shouldAutoplay = !(isIOS || isSafari);

      if (existingTrack) {
        toast.info(t("apps.ipod.dialogs.openedSharedTrack"));
        startTrackSwitch();
        setYoutubeCurrentSongId(videoId);
        if (shouldAutoplay) setIsPlaying(true);
        setMenuMode(false);
      } else {
        toast.info(t("apps.ipod.dialogs.addingNewTrack"));
        await handleAddTrack(`https://www.youtube.com/watch?v=${videoId}`);
        if (shouldAutoplay && !isOffline) {
          const currentSongId = useIpodStore.getState().currentSongId;
          if (currentSongId === videoId) {
            startTrackSwitch();
            setIsPlaying(true);
          }
        } else if (isOffline) {
          showOfflineStatus();
        }
      }
    },
    [setLibrarySource, setYoutubeCurrentSongId, setIsPlaying, handleAddTrack, isOffline, showOfflineStatus, t, isIOS, isSafari, startTrackSwitch]
  );

  // Initial data handling
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (isWindowOpen && initialData?.videoId && typeof initialData.videoId === "string") {
      if (lastProcessedInitialDataRef.current === initialData) return;

      const videoIdToProcess = initialData.videoId;
      timeoutId = setTimeout(() => {
        processVideoId(videoIdToProcess)
          .then(() => {
            if (instanceId) clearIpodInitialData(instanceId);
          })
          .catch((error) => {
            console.error(`Error processing initial videoId ${videoIdToProcess}:`, error);
          });
      }, 100);
      lastProcessedInitialDataRef.current = initialData;
    }
    return () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [isWindowOpen, initialData, processVideoId, clearIpodInitialData, instanceId]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (
      isWindowOpen &&
      initialData?.listenSessionId &&
      typeof initialData.listenSessionId === "string"
    ) {
      if (lastProcessedListenSessionRef.current === initialData.listenSessionId) return;

      const sessionIdToProcess = initialData.listenSessionId;
      timeoutId = setTimeout(() => {
        joinListenSession(sessionIdToProcess, username || undefined)
          .then((result) => {
            if (!result.ok) {
              toast.error("Failed to join session", {
                description: result.error || "Please try again.",
              });
            }
            if (instanceId) clearIpodInitialData(instanceId);
          })
          .catch((error) => {
            console.error(`[iPod] Error joining listen session ${sessionIdToProcess}:`, error);
          });
      }, 100);
      lastProcessedListenSessionRef.current = initialData.listenSessionId;
    }
    return () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    isWindowOpen,
    initialData,
    joinListenSession,
    username,
    clearIpodInitialData,
    instanceId,
  ]);

  // Update app event handling
  useEffect(() => {
    return onAppUpdate((event) => {
      const updateInitialData = event.detail.initialData as
        | { videoId?: string; listenSessionId?: string }
        | undefined;

      if (
        event.detail.appId === "ipod" &&
        updateInitialData?.videoId &&
        (!event.detail.instanceId || event.detail.instanceId === instanceId)
      ) {
        if (lastProcessedInitialDataRef.current === updateInitialData) return;

        const videoId = updateInitialData.videoId;
        if (instanceId) {
          bringInstanceToForeground(instanceId);
        }
        processVideoId(videoId).catch((error) => {
          console.error(`Error processing videoId ${videoId}:`, error);
          toast.error("Failed to load shared track", {
            description: `Video ID: ${videoId}`,
          });
        });
        lastProcessedInitialDataRef.current = updateInitialData;
      }

      if (
        event.detail.appId === "ipod" &&
        updateInitialData?.listenSessionId &&
        (!event.detail.instanceId || event.detail.instanceId === instanceId)
      ) {
        const sessionId = updateInitialData.listenSessionId;
        if (lastProcessedListenSessionRef.current === sessionId) return;
        if (instanceId) {
          bringInstanceToForeground(instanceId);
        }
        joinListenSession(sessionId, username || undefined)
          .then((result) => {
            if (!result.ok) {
              toast.error("Failed to join session", {
                description: result.error || "Please try again.",
              });
            }
          })
          .catch((error) => {
            console.error(`[iPod] Error joining listen session ${sessionId}:`, error);
          });
        lastProcessedListenSessionRef.current = sessionId;
      }
    });
  }, [bringInstanceToForeground, instanceId, joinListenSession, processVideoId, username]);

  // Handle closing sync mode - flush pending offset saves
  const closeSyncMode = useCallback(async () => {
    // Flush any pending lyric offset save for the current track
    const currentTrackId = tracks[currentIndex]?.id;
    if (currentTrackId) {
      await flushPendingLyricOffsetSave(currentTrackId);
    }
    setIsSyncModeOpen(false);
  }, [tracks, currentIndex]);

  // Playback handlers
  const handleTrackEnd = useCallback(() => {
    if (loopCurrent) {
      const activePlayer = isFullScreen ? fullScreenPlayerRef.current : playerRef.current;
      activePlayer?.seekTo(0);
      setIsPlaying(true);
    } else {
      startTrackSwitch();
      nextTrack();
    }
  }, [loopCurrent, nextTrack, setIsPlaying, isFullScreen, startTrackSwitch]);

  const handleProgress = useCallback((state: { playedSeconds: number }) => {
    // Single source of truth — zustand. The selector at the top of
    // this hook re-subscribes us to the new value, so any code path
    // that needs reactivity still gets it.
    useIpodStore.getState().setElapsedTime(state.playedSeconds);
  }, []);

  const handleDuration = useCallback((duration: number) => {
    setTotalTime(duration);
    useIpodStore.getState().setTotalTime(duration);
  }, []);

  const handlePlay = useCallback(() => {
    // Don't update state if we're in the middle of a track switch
    if (isTrackSwitchingRef.current) {
      return;
    }
    setIsPlaying(true);
    if (!skipOperationRef.current) showStatus("▶");
    skipOperationRef.current = false;

    const currentTrack = tracks[currentIndex];
    if (currentTrack) {
      const lastTracked = lastTrackedSongRef.current;
      const isNewTrack = !lastTracked || lastTracked.trackId !== currentTrack.id;
      const isStartingFromBeginning = elapsedTime < 1;

      if (isNewTrack || isStartingFromBeginning) {
        track(IPOD_ANALYTICS.SONG_PLAY, {
          trackId: currentTrack.id,
          title: currentTrack.title,
          artist: currentTrack.artist || "",
        });
        lastTrackedSongRef.current = { trackId: currentTrack.id, elapsedTime };
      }
    }
  }, [setIsPlaying, showStatus, tracks, currentIndex, elapsedTime]);

  const handlePause = useCallback(() => {
    // Don't update state if we're in the middle of a track switch
    if (isTrackSwitchingRef.current) {
      return;
    }
    setIsPlaying(false);
    showStatus("⏸︎");
  }, [setIsPlaying, showStatus]);

  const handleReady = useCallback(() => {}, []);

  // Watchdog for blocked autoplay
  useEffect(() => {
    if (!isPlaying || !isIOSSafari || userHasInteractedRef.current) return;

    const startElapsed = elapsedTime;
    const timer = setTimeout(() => {
      if (useIpodStore.getState().isPlaying && elapsedTime === startElapsed) {
        setIsPlaying(false);
        showStatus("⏸");
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [isPlaying, elapsedTime, setIsPlaying, showStatus, isIOSSafari]);

  // Menu button handler
  const handleMenuButton = useCallback(() => {
    playClickSound();
    vibrate();
    registerActivity();

    // Exit Cover Flow if open. Backward direction so the modern UI's
    // inline Cover Flow exits to the right (x: 0 → 100%) and the menu
    // (or now-playing) slides back in from the left — same shape as
    // pressing menu from now-playing.
    //
    // First give Cover Flow a chance to consume the back press itself
    // — it does so when the album cover is currently flipped to its
    // tracklist (Menu unflips back to the carousel before exiting).
    if (isCoverFlowOpen) {
      if (coverFlowRef.current?.handleMenuButton?.()) {
        return;
      }
      setMenuDirection("backward");
      setIsCoverFlowOpen(false);
      return;
    }

    // Exit Music Quiz if open
    if (isMusicQuizOpen) {
      setIsMusicQuizOpen(false);
      return;
    }

    // Exit Brick Game if open
    if (isBrickGameOpen) {
      setIsBrickGameOpen(false);
      return;
    }

    if (showVideo) toggleVideo();

    if (menuMode) {
      if (menuHistory.length > 1) {
        setMenuDirection("backward");
        setMenuHistory((prev) => prev.slice(0, -1));
        const previousMenu = menuHistory[menuHistory.length - 2];
        if (previousMenu) setSelectedMenuItem(previousMenu.selectedIndex);
      } else {
        playClickSound();
      }
    } else {
      setMenuDirection("backward");
      const mainMenu =
        menuHistory.length > 0
          ? menuHistory[0]
          : { title: t("apps.ipod.menuItems.ipod"), items: mainMenuItems, selectedIndex: 0 };

      if (cameFromNowPlayingMenuItem) {
        setMenuHistory([mainMenu]);
        setSelectedMenuItem(mainMenu?.selectedIndex || 0);
        setCameFromNowPlayingMenuItem(false);
      } else if (
        menuHistoryBeforeNowPlayingRef.current &&
        menuHistoryBeforeNowPlayingRef.current.length > 0
      ) {
        // Restore the in-session "menu the user came from" when they
        // tapped a song to enter Now Playing.
        const savedHistory = menuHistoryBeforeNowPlayingRef.current;
        setMenuHistory(savedHistory);
        const lastMenu = savedHistory[savedHistory.length - 1];
        setSelectedMenuItem(lastMenu?.selectedIndex || 0);
      } else if (menuHistory.length > 1) {
        // Reopen-after-close path: `menuHistoryBeforeNowPlayingRef` is
        // null because it doesn't survive unmount, but `menuHistory`
        // was rehydrated from the persisted breadcrumb on mount and
        // already represents the originating menu (playlist, artist,
        // album, etc.). Use it directly so back-from-Now-Playing lands
        // the user where they actually were — not always at All Songs.
        const lastMenu = menuHistory[menuHistory.length - 1];
        setSelectedMenuItem(lastMenu?.selectedIndex || 0);
      } else {
        // Last-resort fallback (truly empty navigation history): go to
        // All Songs with the current track highlighted.
        const allSongsLabel = t("apps.ipod.menuItems.allSongs");
        const songsLabel = t("apps.ipod.menuItems.songs");
        const songsMenuIndex = Math.max(
          0,
          musicMenuItems.findIndex(
            (item) => item.label === songsLabel || item.label === allSongsLabel
          )
        );
        setMenuHistory([
          mainMenu,
          {
            title: t("apps.ipod.menuItems.music"),
            items: musicMenuItems,
            selectedIndex: songsMenuIndex,
          },
          {
            title: allSongsLabel,
            items: allSongsMenuItems,
            selectedIndex: Math.max(0, browseCurrentIndex),
          },
        ]);
        setSelectedMenuItem(Math.max(0, browseCurrentIndex));
      }
      setMenuMode(true);
    }
  }, [playClickSound, vibrate, registerActivity, isCoverFlowOpen, isMusicQuizOpen, isBrickGameOpen, showVideo, toggleVideo, menuMode, menuHistory, mainMenuItems, musicMenuItems, allSongsMenuItems, browseCurrentIndex, cameFromNowPlayingMenuItem, t]);

  // Cover Flow handlers
  const handleCenterLongPress = useCallback(() => {
    // Toggle cover flow on long press of center button
    playClickSound();
    vibrate();
    registerActivity();

    if (isCoverFlowOpen) {
      // Exit cover flow — backward direction so the modern UI's
      // inline Cover Flow slides out to the right and now-playing
      // slides back in from the left.
      setMenuDirection("backward");
      setIsCoverFlowOpen(false);
    } else if (
      !menuMode &&
      !isMusicQuizOpen &&
      !isBrickGameOpen &&
      browsableTracks.length > 0
    ) {
      // Enter cover flow only when in Now Playing mode and no overlay is active.
      // Forward direction so the modern UI's inline Cover Flow slides in
      // from the right (matching menu→now-playing).
      setMenuDirection("forward");
      setIsCoverFlowOpen(true);
    }
  }, [playClickSound, vibrate, registerActivity, isCoverFlowOpen, menuMode, isMusicQuizOpen, isBrickGameOpen, browsableTracks.length]);

  const getAppleMusicAlbumQueueIds = useCallback(
    (track: Track) => {
      const albumKey = getAlbumGroupingKey(
        track,
        unknownAlbumLabel,
        unknownArtistLabel
      );
      return browsableTracks.reduce<string[]>((acc, candidate) => {
        if (
          candidate.source === "appleMusic" &&
          getAlbumGroupingKey(
            candidate,
            unknownAlbumLabel,
            unknownArtistLabel
          ) === albumKey
        ) {
          acc.push(candidate.id);
        }
        return acc;
      }, []);
    },
    [browsableTracks, unknownAlbumLabel, unknownArtistLabel]
  );

  const handleCoverFlowSelect = useCallback((index: number) => {
    playClickSound();
    vibrate();
    registerActivity();
    
    // Switch to the selected track
    const track = browsableTracks[index];
    if (track) {
      startTrackSwitch();
      if (useIpodStore.getState().librarySource === "appleMusic") {
        useIpodStore
          .getState()
          .setAppleMusicPlaybackQueue(getAppleMusicAlbumQueueIds(track));
      }
      setCurrentSongId(track.id);
      setIsPlaying(true);
      setIsCoverFlowOpen(false);
      setMenuDirection("forward");
      setMenuMode(false);
      setCameFromNowPlayingMenuItem(false);
      
      // Show video for the new track
      if (!showVideo) {
        toggleVideo();
      }
    }
  }, [playClickSound, vibrate, registerActivity, browsableTracks, startTrackSwitch, getAppleMusicAlbumQueueIds, setCurrentSongId, setIsPlaying, showVideo, toggleVideo]);

  // Play a track without exiting CoverFlow
  const handleCoverFlowPlayInPlace = useCallback((index: number) => {
    playClickSound();
    vibrate();
    registerActivity();
    
    const track = browsableTracks[index];
    if (track) {
      startTrackSwitch();
      if (useIpodStore.getState().librarySource === "appleMusic") {
        useIpodStore
          .getState()
          .setAppleMusicPlaybackQueue(getAppleMusicAlbumQueueIds(track));
      }
      setCurrentSongId(track.id);
      setIsPlaying(true);
      // Don't close CoverFlow - stay in place
    }
  }, [playClickSound, vibrate, registerActivity, browsableTracks, startTrackSwitch, getAppleMusicAlbumQueueIds, setCurrentSongId, setIsPlaying]);

  const handleCoverFlowExit = useCallback(() => {
    playClickSound();
    vibrate();
    // Backward direction so the modern UI's inline Cover Flow slides
    // out to the right (and the menu / now-playing screen behind it
    // slides in from the left).
    setMenuDirection("backward");
    setIsCoverFlowOpen(false);
  }, [playClickSound, vibrate]);

  const handleCoverFlowRotation = useCallback(() => {
    playScrollSound();
  }, [playScrollSound]);

  // Wheel click handler
  const handleWheelClick = useCallback(
    (area: WheelArea) => {
      playClickSound();
      vibrate();
      registerActivity();

      switch (area) {
        case "top":
          handleMenuButton();
          break;
        case "right":
          if (isMusicQuizOpen && musicQuizRef.current) {
            musicQuizRef.current.navigate("next");
            return;
          }
          if (isBrickGameOpen && brickGameRef.current) {
            brickGameRef.current.navigate("next");
            return;
          }
          if (isOffline) {
            showOfflineStatus();
          } else if (getCurrentAppleMusicCollectionShellTrack()) {
            void skipAppleMusicCollectionShell("next");
          } else {
            skipOperationRef.current = true;
            startTrackSwitch();
            nextTrack();
            showStatus("⏭");
          }
          break;
        case "bottom":
          if (isMusicQuizOpen && musicQuizRef.current) {
            // Replay current snippet
            musicQuizRef.current.replaySnippet();
            return;
          }
          if (isBrickGameOpen && brickGameRef.current) {
            // Pause / resume the game
            brickGameRef.current.togglePause();
            return;
          }
          if (isOffline) {
            showOfflineStatus();
          } else {
            togglePlay();
            showStatus(useIpodStore.getState().isPlaying ? "▶" : "⏸");
          }
          break;
        case "left":
          if (isMusicQuizOpen && musicQuizRef.current) {
            musicQuizRef.current.navigate("previous");
            return;
          }
          if (isBrickGameOpen && brickGameRef.current) {
            brickGameRef.current.navigate("previous");
            return;
          }
          if (isOffline) {
            showOfflineStatus();
          } else if (getCurrentAppleMusicCollectionShellTrack()) {
            void skipAppleMusicCollectionShell("previous");
          } else {
            skipOperationRef.current = true;
            startTrackSwitch();
            previousTrack();
            showStatus("⏮");
          }
          break;
        case "center":
          // Handle Music Quiz selection
          if (isMusicQuizOpen && musicQuizRef.current) {
            musicQuizRef.current.selectCurrent();
            return;
          }
          // Handle Brick Game selection (start / pause / restart)
          if (isBrickGameOpen && brickGameRef.current) {
            brickGameRef.current.selectCurrent();
            return;
          }
          // Handle Cover Flow selection
          if (isCoverFlowOpen && coverFlowRef.current) {
            coverFlowRef.current.selectCurrent();
            return;
          }
          
          if (menuMode) {
            const currentMenu = menuHistory[menuHistory.length - 1];
            if (currentMenu?.items[selectedMenuItem]) {
              currentMenu.items[selectedMenuItem].action();
            }
          } else {
            if (tracks[currentIndex]) {
              if (!isPlaying) {
                if (isOffline) {
                  showOfflineStatus();
                } else {
                  togglePlay();
                  showStatus("▶");
                  setTimeout(() => {
                    if (!useIpodStore.getState().showVideo) toggleVideo();
                  }, 200);
                }
              } else {
                if (!isOffline) toggleVideo();
              }
            }
          }
          break;
      }
    },
    [playClickSound, vibrate, registerActivity, getCurrentAppleMusicCollectionShellTrack, skipAppleMusicCollectionShell, nextTrack, showStatus, togglePlay, previousTrack, menuMode, menuHistory, selectedMenuItem, tracks, currentIndex, isPlaying, toggleVideo, handleMenuButton, isOffline, showOfflineStatus, startTrackSwitch, isCoverFlowOpen, isMusicQuizOpen, isBrickGameOpen]
  );

  // Wheel rotation handler
  const handleWheelRotation = useCallback(
    (direction: RotationDirection) => {
      // Brick game: skip all state-mutating work (registerActivity, playScrollSound)
      // so the RAF loop runs uninterrupted. Only update the ref for interaction tracking.
      if (isBrickGameOpen && brickGameRef.current) {
        registerActivityRef();
        brickGameRef.current.navigate(
          direction === "clockwise" ? "next" : "previous"
        );
        return;
      }

      registerActivity();

      // Handle Music Quiz navigation
      if (isMusicQuizOpen && musicQuizRef.current) {
        playScrollSound();
        const handled = musicQuizRef.current.navigate(
          direction === "clockwise" ? "next" : "previous"
        );
        if (handled) return;
      }

      playScrollSound();

      // Handle Cover Flow navigation
      if (isCoverFlowOpen && coverFlowRef.current) {
        if (direction === "clockwise") {
          coverFlowRef.current.navigateNext();
        } else {
          coverFlowRef.current.navigatePrevious();
        }
        return;
      }

      if (menuMode) {
        const currentMenu = menuHistory[menuHistory.length - 1];
        if (!currentMenu) return;
        const menuLength = currentMenu.items.length;
        if (menuLength === 0) return;

        setSelectedMenuItem((prevIndex) => {
          let newIndex = prevIndex;
          if (direction === "clockwise") {
            newIndex = Math.min(menuLength - 1, prevIndex + 1);
          } else {
            newIndex = Math.max(0, prevIndex - 1);
          }
          return newIndex;
        });
      } else {
        const activePlayer = isFullScreen ? fullScreenPlayerRef.current : playerRef.current;
        const currentTime = activePlayer?.getCurrentTime() || 0;
        let newTime = currentTime;
        if (direction === "clockwise") {
          newTime = currentTime + SEEK_AMOUNT_SECONDS;
          activePlayer?.seekTo(newTime);
        } else {
          newTime = Math.max(0, currentTime - SEEK_AMOUNT_SECONDS);
          activePlayer?.seekTo(newTime);
        }
        showStatus(
          `${direction === "clockwise" ? "⏩︎" : "⏪︎"} ${Math.floor(newTime / 60)}:${String(Math.floor(newTime % 60)).padStart(2, "0")}`
        );
      }
    },
    [playScrollSound, registerActivity, registerActivityRef, menuMode, menuHistory, isFullScreen, showStatus, isCoverFlowOpen, isMusicQuizOpen, isBrickGameOpen]
  );

  // Scaling
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const prevMinimizedRef = useRef(isMinimized);

  useEffect(() => {
    let timeoutId: number;

    const handleResize = () => {
      if (!containerRef.current) return;

      requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight;
        const baseWidth = 250;
        const baseHeight = 400;
        const availableWidth = containerWidth - 50;
        const availableHeight = containerHeight - 50;
        const widthScale = availableWidth / baseWidth;
        const heightScale = availableHeight / baseHeight;
        const newScale = Math.min(widthScale, heightScale, 2);
        const finalScale = Math.max(1, newScale);

        setScale((prevScale) => {
          if (Math.abs(prevScale - finalScale) > 0.01) return finalScale;
          return prevScale;
        });
      });
    };

    timeoutId = window.setTimeout(handleResize, 10);

    if (prevMinimizedRef.current && !isMinimized) {
      [50, 100, 200, 300, 500].forEach((delay) => {
        window.setTimeout(handleResize, delay);
      });
    }
    prevMinimizedRef.current = isMinimized;

    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(handleResize, 10);
    });

    if (containerRef.current) resizeObserver.observe(containerRef.current);

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
    };
  }, [isWindowOpen, isMinimized]);

  // Share and lyrics handlers
  const handleShareSong = useCallback(() => {
    if (tracks.length > 0 && currentIndex >= 0) {
      const track = tracks[currentIndex];
      // YouTube ryOS shares are backed by cached song metadata. Apple Music
      // shares should stay as public Apple Music links and not mark createdBy.
      if (track && shouldCacheSongMetadataForShare(track)) {
        const { username, isAuthenticated } = useChatsStore.getState();
        const auth = username && isAuthenticated ? { username, isAuthenticated } : null;
        saveSongMetadataFromTrack(track, auth, { isShare: true }).catch((error) => {
          console.error("[iPod] Error saving song metadata to cache:", error);
        });
      }
      setIsShareDialogOpen(true);
    }
  }, [tracks, currentIndex]);

  // Song search/add handlers
  const handleAddSong = useCallback(() => {
    setIsSongSearchDialogOpen(true);
  }, []);

  const handleSongSearchSelect = useCallback(
    async (result: SongSearchResult) => {
      try {
        const url = `https://www.youtube.com/watch?v=${result.videoId}`;
        await handleAddTrack(url);
      } catch (error) {
        console.error("Error adding track from search:", error);
        showStatus(`❌ ${t("apps.ipod.dialogs.errorAdding")} ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },
    [handleAddTrack, showStatus, t]
  );

  const handleAddUrl = useCallback(
    async (url: string) => {
      await handleAddTrack(url);
    },
    [handleAddTrack]
  );

  const currentTrack = tracks[currentIndex];
  const lyricsSourceOverride = currentTrack?.lyricsSource;

  // Cover URL for paused state overlay in fullscreen
  const fullscreenCoverUrl = useMemo(() => {
    if (!currentTrack) return null;
    if (currentTrack.source === "appleMusic") {
      // Apple Music returns a templated URL ({w}/{h} placeholders) which is
      // already substituted to 600px when we ingest the library track. Use
      // it as-is in fullscreen as well.
      return currentTrack.cover ?? null;
    }
    const videoId = getYouTubeVideoId(currentTrack.url);
    const youtubeThumbnail = videoId
      ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      : null;
    return formatKugouImageUrl(currentTrack.cover, 800) ?? youtubeThumbnail;
  }, [currentTrack]);

  const handleRefreshLyrics = useCallback(() => {
    if (tracks.length > 0 && currentIndex >= 0) setIsLyricsSearchDialogOpen(true);
  }, [tracks, currentIndex]);

  // Live MusicKit metadata for the currently-streaming song. Read here
  // (earlier than the rest of the lyrics block below) so the
  // override-target / search-handler callbacks can depend on it.
  const appleMusicKitNowPlaying = useIpodStore((s) => s.appleMusicKitNowPlaying);

  // Resolve the id we should persist a manual lyrics-source override
  // against. For Apple Music stations / playlists this MUST be the
  // live MusicKit song id, not the shell — otherwise every song
  // streamed through the same station / playlist would inherit the
  // user's pick. Pure logic lives in `resolveLyricsOverrideTargetId`
  // so it's unit-testable in isolation.
  const resolveLyricsOverrideTargetId = useCallback(
    (): string | null =>
      resolveLyricsOverrideTargetIdHelper(
        tracks[currentIndex] ?? null,
        appleMusicKitNowPlaying
      ),
    [tracks, currentIndex, appleMusicKitNowPlaying]
  );

  const handleLyricsSearchSelect = useCallback(
    (result: { hash: string; albumId: string | number; title: string; artist: string; album?: string }) => {
      const targetId = resolveLyricsOverrideTargetId();
      if (targetId) {
        setTrackLyricsSource(targetId, result);
        refreshLyrics();
      }
    },
    [resolveLyricsOverrideTargetId, setTrackLyricsSource, refreshLyrics]
  );

  const handleLyricsSearchReset = useCallback(() => {
    const targetId = resolveLyricsOverrideTargetId();
    if (targetId) {
      clearTrackLyricsSource(targetId);
      refreshLyrics();
    }
  }, [resolveLyricsOverrideTargetId, clearTrackLyricsSource, refreshLyrics]);

  const ipodGenerateShareUrl = useCallback(
    (songId: string): string => {
      const state = useIpodStore.getState();
      const sourceTracks =
        state.librarySource === "appleMusic"
          ? state.appleMusicTracks
          : state.tracks;
      const track = sourceTracks.find((candidate) => candidate.id === songId);
      if (!track) {
        return `${window.location.origin}/ipod/${encodeURIComponent(songId)}`;
      }

      return generateIpodSongShareUrl(
        track,
        window.location.origin,
        state.appleMusicStorefrontId
      );
    },
    []
  );

  const getCurrentStoreTrack = useCallback(() => {
    const state = useIpodStore.getState();
    if (state.librarySource === "appleMusic") {
      const id = state.appleMusicCurrentSongId;
      if (!id) return state.appleMusicTracks[0] ?? null;
      return state.appleMusicTracks.find((t) => t.id === id) ?? null;
    }
    return state.getCurrentTrack();
  }, []);

  // Volume from audio settings store
  const { ipodVolume } = useAudioSettingsStoreShallow((state) => ({ ipodVolume: state.ipodVolume }));

  // Lyrics hook
  const selectedMatchForLyrics = useMemo(() => {
    if (!lyricsSourceOverride) return undefined;
    return {
      hash: lyricsSourceOverride.hash,
      albumId: lyricsSourceOverride.albumId,
      title: lyricsSourceOverride.title,
      artist: lyricsSourceOverride.artist,
      album: lyricsSourceOverride.album,
    };
  }, [lyricsSourceOverride]);

  // Resolve "auto" translation language to actual ryOS locale (must track i18n so UI updates when system language changes)
  const appLanguage = i18n.resolvedLanguage ?? i18n.language;
  const effectiveTranslationLanguage = useMemo(
    () => getEffectiveTranslationLanguage(lyricsTranslationLanguage),
    [lyricsTranslationLanguage, appLanguage]
  );
  // For Apple Music stations / playlists the iPod's `currentTrack` is
  // a *shell* — its title / artist describe the station or playlist
  // itself ("Today's Hits" / "Apple Music"), NOT the song that's
  // currently playing through it. Resolution lives in
  // `resolveLyricsTrackMetadata` so the rule is unit-tested in
  // isolation (see `tests/test-ipod-lyrics-track-metadata.test.ts`).
  const lyricsMetadata = useMemo(
    () => resolveLyricsTrackMetadata(currentTrack, appleMusicKitNowPlaying),
    [currentTrack, appleMusicKitNowPlaying]
  );
  const { title: lyricsTitle, artist: lyricsArtist, songId: lyricsSongId } =
    lyricsMetadata;

  const lyricsTimingOffsetMs = useMemo(() => {
    if (
      isAppleMusicCollectionTrack(currentTrack) &&
      appleMusicKitNowPlaying?.id
    ) {
      return 0;
    }
    return currentTrack?.lyricOffset ?? 0;
  }, [currentTrack, appleMusicKitNowPlaying?.id]);

  const fullScreenLyricsControls = useLyrics({
    songId: lyricsSongId,
    title: lyricsTitle,
    artist: lyricsArtist,
    currentTime: elapsedTime + lyricsTimingOffsetMs / 1000,
    translateTo: effectiveTranslationLanguage,
    selectedMatch: selectedMatchForLyrics,
    includeFurigana: true, // Fetch furigana info with lyrics to reduce API calls
    // Always include soramimi in request to avoid hydration timing issues
    // (default setting is false, but user's saved setting might be true after hydration)
    // The server only returns cached soramimi data, doesn't generate anything here
    includeSoramimi: true,
    // Pass target language so server returns correct cached soramimi data
    soramimiTargetLanguage: romanization.soramamiTargetLanguage ?? "zh-TW",
    // Auth for force refresh / changing lyrics source
    auth,
  });

  // Show toast with Search button when lyrics fetch fails
  useLyricsErrorToast({
    error: fullScreenLyricsControls.error,
    songId: lyricsSongId || undefined,
    onSearchClick: () => setIsLyricsSearchDialogOpen(true),
    t,
    appId: "ipod",
  });

  // Fetch furigana for lyrics and store in shared state
  // Use pre-fetched info from lyrics request to skip extra API call
  const { 
    furiganaMap, 
    soramimiMap, 
    isFetchingFurigana,
    isFetchingSoramimi,
    furiganaProgress,
    soramimiProgress,
  } = useFurigana({
    songId: lyricsSongId,
    lines: fullScreenLyricsControls.originalLines,
    isShowingOriginal: true,
    romanization,
    prefetchedInfo: fullScreenLyricsControls.furiganaInfo,
    prefetchedSoramimiInfo: fullScreenLyricsControls.soramimiInfo,
    auth,
  });

  // Consolidated activity state for loading indicators
  const activityState = useActivityState({
    lyricsState: {
      isLoading: fullScreenLyricsControls.isLoading,
      isTranslating: fullScreenLyricsControls.isTranslating,
      translationProgress: fullScreenLyricsControls.translationProgress,
    },
    furiganaState: {
      isFetchingFurigana,
      furiganaProgress,
      isFetchingSoramimi,
      soramimiProgress,
    },
    translationLanguage: effectiveTranslationLanguage,
    isAddingSong,
  });

  // Convert furiganaMap to Record for storage - only when content actually changes
  const furiganaRecord = useMemo(() => {
    if (furiganaMap.size === 0) return null;
    const record: Record<string, import("@/utils/romanization").FuriganaSegment[]> = {};
    furiganaMap.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }, [furiganaMap]);

  // Ref to track last stored value to avoid redundant updates
  const lastFuriganaRecordRef = useRef<typeof furiganaRecord>(null);
  
  // Update shared store when furiganaMap changes
  useEffect(() => {
    // Skip if value hasn't actually changed (avoid unnecessary store updates)
    if (furiganaRecord === lastFuriganaRecordRef.current) return;
    lastFuriganaRecordRef.current = furiganaRecord;
    setCurrentFuriganaMap(furiganaRecord);
  }, [furiganaRecord, setCurrentFuriganaMap]);

  // Fullscreen sync
  const prevFullScreenRef = useRef(isFullScreen);

  useEffect(() => {
    const timeoutIds = new Set<ReturnType<typeof setTimeout>>();
    const scheduleTimeout = (callback: () => void, delay: number) => {
      const timeoutId = setTimeout(() => {
        timeoutIds.delete(timeoutId);
        callback();
      }, delay);
      timeoutIds.add(timeoutId);
      return timeoutId;
    };

    if (isFullScreen !== prevFullScreenRef.current) {
      // Apple Music plays through a single shared MusicKit instance, so
      // toggling fullscreen never needs the YouTube-style seek-and-resume
      // dance between two iframes. Skip the sync entirely.
      if (isAppleMusic) {
        prevFullScreenRef.current = isFullScreen;
        return;
      }

      // Mark as track switching to prevent spurious play/pause events during sync
      isTrackSwitchingRef.current = true;
      if (trackSwitchTimeoutRef.current) {
        clearTimeout(trackSwitchTimeoutRef.current);
      }

      if (isFullScreen) {
        const currentTime = playerRef.current?.getCurrentTime() || elapsedTime;
        const wasPlaying = isPlaying;

        // Wait for fullscreen player to be ready before seeking
        const checkAndSync = () => {
          const internalPlayer = fullScreenPlayerRef.current?.getInternalPlayer?.();
          if (internalPlayer && typeof internalPlayer.getPlayerState === "function") {
            const playerState = internalPlayer.getPlayerState();
            // -1 = unstarted, wait for player to be ready
            if (playerState !== -1) {
              fullScreenPlayerRef.current?.seekTo(currentTime);
              if (wasPlaying && typeof internalPlayer.playVideo === "function") {
                // On iOS Safari, only play if user has interacted
                if (!isIOSSafari || userHasInteractedRef.current) {
                  internalPlayer.playVideo();
                }
              }
              // End track switch after sync complete
              trackSwitchTimeoutRef.current = scheduleTimeout(() => {
                isTrackSwitchingRef.current = false;
              }, 500);
              return;
            }
          }
          // Player not ready, retry
          scheduleTimeout(checkAndSync, 100);
        };
        scheduleTimeout(checkAndSync, 100);
      } else {
        const currentTime = fullScreenPlayerRef.current?.getCurrentTime() || elapsedTime;
        const wasPlaying = isPlaying;

        scheduleTimeout(() => {
          if (playerRef.current) {
            playerRef.current.seekTo(currentTime);
            if (wasPlaying && !useIpodStore.getState().isPlaying) {
              setIsPlaying(true);
            }
          }
          // End track switch after sync complete
          trackSwitchTimeoutRef.current = scheduleTimeout(() => {
            isTrackSwitchingRef.current = false;
          }, 500);
        }, 200);
      }
      prevFullScreenRef.current = isFullScreen;
    }
    return () => {
      timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
      timeoutIds.clear();
    };
  }, [isAppleMusic, isFullScreen, elapsedTime, isPlaying, setIsPlaying, isIOSSafari]);

  // Seek time for fullscreen (delta)
  const seekTime = useCallback(
    (delta: number) => {
      if (fullScreenPlayerRef.current) {
        const currentTime = fullScreenPlayerRef.current.getCurrentTime() || 0;
        const newTime = Math.max(0, currentTime + delta);
        fullScreenPlayerRef.current.seekTo(newTime);
        showStatus(`${delta > 0 ? "⏩︎" : "⏪︎"} ${Math.floor(newTime / 60)}:${String(Math.floor(newTime % 60)).padStart(2, "0")}`);
      }
    },
    [showStatus]
  );

  // Seek to absolute time (in ms) and start playing
  // timeMs is in "lyrics time" (player time + offset), so we subtract the offset to get player time
  const seekToTime = useCallback(
    (timeMs: number) => {
      if (fullScreenPlayerRef.current) {
        // Set guard to prevent spurious onPause events during seek from killing playback
        isTrackSwitchingRef.current = true;
        if (trackSwitchTimeoutRef.current) {
          clearTimeout(trackSwitchTimeoutRef.current);
        }
        
        // Subtract lyricOffset to convert from lyrics time to player time
        const playerTimeMs = timeMs - lyricOffset;
        const newTime = Math.max(0, playerTimeMs / 1000);
        fullScreenPlayerRef.current.seekTo(newTime);
        
        // Start playing if paused — also poke the internal player directly
        // so iOS Safari (YouTube) and MusicKit honour the user gesture.
        if (!isPlaying) {
          setIsPlaying(true);
          const internalPlayer = fullScreenPlayerRef.current?.getInternalPlayer?.() as
            | { playVideo?: () => void; play?: () => void }
            | null
            | undefined;
          if (internalPlayer) {
            if (typeof internalPlayer.playVideo === "function") {
              internalPlayer.playVideo();
            } else if (typeof internalPlayer.play === "function") {
              // MusicKit bridge: call instance.play() to unblock autoplay.
              try {
                const result = (
                  internalPlayer.play as () => unknown
                )();
                const maybeThenable = result as
                  | { catch?: (cb: (err: unknown) => void) => void }
                  | undefined;
                if (
                  maybeThenable &&
                  typeof maybeThenable.catch === "function"
                ) {
                  maybeThenable.catch(() => undefined);
                }
              } catch {
                /* MusicKit instances throw when not configured — ignore. */
              }
            }
          }
        }
        showStatus(`▶ ${Math.floor(newTime / 60)}:${String(Math.floor(newTime % 60)).padStart(2, "0")}`);
        
        // Clear guard after a short delay to allow seek + play to complete
        trackSwitchTimeoutRef.current = setTimeout(() => {
          isTrackSwitchingRef.current = false;
        }, 500);
      }
    },
    [showStatus, isPlaying, lyricOffset, setIsPlaying]
  );

  // Fullscreen callbacks
  const handleSelectTranslation = useCallback((code: string | null) => {
    useIpodStore.getState().setLyricsTranslationLanguage(code);
  }, []);

  const cycleAlignment = useCallback(() => {
    const store = useIpodStore.getState();
    const curr = store.lyricsAlignment;
    let next: LyricsAlignment;
    if (curr === LyricsAlignment.FocusThree) next = LyricsAlignment.Center;
    else if (curr === LyricsAlignment.Center) next = LyricsAlignment.Alternating;
    else next = LyricsAlignment.FocusThree;
    store.setLyricsAlignment(next);
    showStatus(
      next === LyricsAlignment.FocusThree
        ? t("apps.ipod.status.layoutFocus")
        : next === LyricsAlignment.Center
        ? t("apps.ipod.status.layoutCenter")
        : t("apps.ipod.status.layoutAlternating")
    );
  }, [showStatus, t]);

  const cycleLyricsFont = useCallback(() => {
    const store = useIpodStore.getState();
    const curr = store.lyricsFont;
    let next: LyricsFont;
    // Cycle: Rounded → Serif → SansSerif → SerifRed → Glow → Gradient → Rounded
    switch (curr) {
      case LyricsFont.Rounded: next = LyricsFont.Serif; break;
      case LyricsFont.Serif: next = LyricsFont.SansSerif; break;
      case LyricsFont.SansSerif: next = LyricsFont.SerifRed; break;
      case LyricsFont.SerifRed: next = LyricsFont.GoldGlow; break;
      case LyricsFont.GoldGlow: next = LyricsFont.Gradient; break;
      default: next = LyricsFont.Rounded;
    }
    store.setLyricsFont(next);
    
    const statusMessages: Record<LyricsFont, string> = {
      [LyricsFont.Rounded]: t("apps.ipod.status.fontRounded"),
      [LyricsFont.Serif]: t("apps.ipod.status.fontSerif"),
      [LyricsFont.SansSerif]: t("apps.ipod.status.fontSansSerif"),
      [LyricsFont.SerifRed]: t("apps.ipod.status.fontSerifRed"),
      [LyricsFont.GoldGlow]: t("apps.ipod.status.fontGoldGlow"),
      [LyricsFont.Gradient]: t("apps.ipod.status.fontGradient"),
    };
    showStatus(statusMessages[next]);
  }, [showStatus, t]);

  // Get CSS class name for current lyrics font
  const lyricsFontClassName = getLyricsFontClassName(lyricsFont);

  // Fullscreen change handler
  useEventListener(
    "fullscreenchange",
    () => {
      if (!document.fullscreenElement && isFullScreen) {
        toggleFullScreen();
      }
    },
    document
  );

  // Listen for App Menu fullscreen toggle
  useCustomEventListener<{ appId: string; instanceId: string }>(
    "toggleAppFullScreen",
    (event) => {
      if (event.detail.instanceId === instanceId) {
        toggleFullScreen();
      }
    }
  );

  const { isWindowsTheme: isXpTheme } = useThemeFlags();

  return {
    // Translation
    t,
    translatedHelpItems,

    // Apple Music / library source
    librarySource,
    isAppleMusic,
    musicKitInstance,
    musicKitStatus,
    appleMusicAuthorized,
    appleMusicLibraryLoading,
    appleMusicLibraryError,
    appleMusicLibrarySize,
    handleAppleMusicSignIn,
    handleAppleMusicSignOut,
    handleAppleMusicRefresh,
    handleSwitchToYoutube,
    handleSwitchToAppleMusic,
    pauseBeforeWindowClose,
    setLibrarySource,

    // Store state
    tracks,
    coverFlowTracks: browsableTracks,
    currentSongId,
    currentIndex,
    coverFlowCurrentIndex,
    nowPlayingScope,
    loopCurrent,
    loopAll,
    isShuffled,
    isPlaying,
    showVideo,
    backlightOn,
    theme,
    lcdFilterOn,
    displayMode,
    showLyrics,
    lyricsAlignment,
    lyricsFont,
    lyricsFontClassName,
    koreanDisplay,
    japaneseFurigana,
    romanization,
    setRomanization,
    lyricsTranslationLanguage,
    lyricOffset,
    isFullScreen,
    toggleFullScreen,
    isMinimized,
    isXpTheme,
    isOffline,

    // Refs
    playerRef,
    fullScreenPlayerRef,
    coverFlowRef,
    containerRef,

    // Sound effects (exposed for quiz / extras)
    playClickSound,
    playScrollSound,
    vibrate,

    // State
    statusMessage,
    elapsedTime,
    totalTime,
    scale,
    menuMode,
    selectedMenuItem,
    menuDirection,
    menuHistory,
    cameFromNowPlayingMenuItem,
    isCoverFlowOpen,
    isMusicQuizOpen,
    setIsMusicQuizOpen,
    musicQuizRef,
    isBrickGameOpen,
    setIsBrickGameOpen,
    brickGameRef,
    isAddingSong,
    activityState,
    skipOperationRef,

    // Dialog state
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isConfirmClearOpen,
    setIsConfirmClearOpen,
    isShareDialogOpen,
    setIsShareDialogOpen,
    isLyricsSearchDialogOpen,
    setIsLyricsSearchDialogOpen,
    isSongSearchDialogOpen,
    setIsSongSearchDialogOpen,
    isSyncModeOpen,
    setIsSyncModeOpen,

    // Current track
    currentTrack,
    lyricsSourceOverride,
    fullscreenCoverUrl,

    // Lyrics
    fullScreenLyricsControls,
    furiganaMap,
    soramimiMap,
    effectiveTranslationLanguage,
    /** Title to use when fetching/searching lyrics (live MusicKit
     *  metadata for stations / playlists, currentTrack title otherwise). */
    lyricsTitle,
    /** Artist to use when fetching/searching lyrics (mirrors lyricsTitle). */
    lyricsArtist,
    /** Song id to use when fetching/searching lyrics (live MusicKit id
     *  for collections, currentTrack.id otherwise). May be empty for a
     *  station / playlist that hasn't received its first
     *  `mediaItemDidChange` event yet. */
    lyricsSongId,

    // Audio
    ipodVolume,

    // Handlers
    handleTrackEnd,
    handleProgress,
    handleDuration,
    handlePlay,
    handlePause,
    handleReady,
    handleMenuButton,
    handleWheelClick,
    handleWheelRotation,
    handleCenterLongPress,
    handleCoverFlowSelect,
    handleCoverFlowPlayInPlace,
    handleCoverFlowExit,
    handleCoverFlowRotation,
    handleShareSong,
    handleAddSong,
    handleSongSearchSelect,
    handleAddUrl,
    handleAppleMusicSearch,
    handleAppleMusicSearchSelect,
    handleAppleMusicAddToFavorites,
    handleRefreshLyrics,
    handleLyricsSearchSelect,
    handleLyricsSearchReset,
    handleSelectTranslation,
    cycleAlignment,
    cycleLyricsFont,
    seekTime,
    seekToTime,
    closeSyncMode,
    registerActivity,
    showStatus,
    showOfflineStatus,
    startTrackSwitch,
    togglePlay,
    setDisplayMode,
    toggleVideo,
    toggleBacklight,
    setCurrentSongId,
    setIsPlaying,
    setMenuMode,
    setSelectedMenuItem,
    setMenuDirection,
    setMenuHistory,
    setCameFromNowPlayingMenuItem,
    setIsCoverFlowOpen,
    nextTrack,
    previousTrack,
    clearLibrary,
    manualSync,
    restoreInstance,

    // Menu items
    mainMenuItems,
    musicMenuItems,
    settingsMenuItems,
    handleMenuItemAction,

    // Screen long press
    screenLongPressTimerRef,
    screenLongPressFiredRef,
    screenLongPressStartPos,
    SCREEN_LONG_PRESS_MOVE_THRESHOLD,

    // Share URL generator
    ipodGenerateShareUrl,
    getCurrentStoreTrack,

    // Store actions
    setLyricOffset,
    adjustLyricOffset: (index: number, delta: number) => {
      useIpodStore.getState().adjustLyricOffset(index, delta);
    },
  };
}
