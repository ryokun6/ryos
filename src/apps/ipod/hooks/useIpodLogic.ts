import { useState, useRef, useEffect, useCallback, useMemo, useReducer } from "react";
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
import { useMediaAppDialogs } from "@/hooks/useMediaAppDialogs";
import { useCustomEventListener, useEventListener } from "@/hooks/useEventListener";
import { useLibraryUpdateChecker } from "./useLibraryUpdateChecker";
import { useIpodActiveLibrary } from "./useIpodActiveLibrary";
import { useIpodPlayback } from "./useIpodPlayback";
import { useActiveMediaPlayer } from "@/shared/media/useActiveMediaPlayer";
import { useLyricOffsetTrackChange } from "@/shared/media/useLyricOffsetTrackChange";
import { useIpodScale } from "./useIpodScale";
import { useIpodStatusBacklight } from "./useIpodStatusBacklight";
import {
  useAppleMusicLibrary,
  syncAppleMusicResource,
  searchAppleMusicTracks,
  fetchAppleMusicGeniusTrack,
  addAppleMusicTrackToFavorites,
  cacheAppleMusicFavoriteSongTrack,
  type AppleMusicSearchScope,
} from "./useAppleMusicLibrary";
import { useMusicKit } from "@/hooks/useMusicKit";
import { clearAppleMusicLibrary } from "@/utils/appleMusicLibraryCache";
import { useThemeStore } from "@/stores/useThemeStore";
import {
  useIpodStore,
  Track,
  IpodBacklightTimeout,
  getEffectiveTranslationLanguage,
  flushPendingLyricOffsetSave,
  isAppleMusicCollectionTrack,
} from "@/stores/useIpodStore";
import { resolveChineseLyricsLanguage } from "@/shared/media/chineseLyrics";
import {
  resolveLyricsOverrideTargetId as resolveLyricsOverrideTargetIdHelper,
  resolveLyricsTrackMetadata,
} from "../utils/lyricsTrackMetadata";
import { useShallow } from "zustand/react/shallow";
import { useIpodStoreShallow } from "@/stores/useIpodStore";
import { shouldRestartTrackOnPrevious } from "@/shared/media/previousTrackBehavior";
import { useAppStoreShallow } from "@/stores/useAppStore";
import { useAudioSettingsStoreShallow } from "@/stores/useAudioSettingsStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { useListenSessionStore } from "@/stores/useListenSessionStore";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { LyricsAlignment, LyricsFont, DisplayMode, getLyricsFontClassName } from "@/types/lyrics";
import { IPOD_ANALYTICS } from "@/utils/analytics";
import { saveSongMetadataFromTrack } from "@/utils/songMetadataCache";
import { formatSecondsAsMinutesSeconds } from "@/utils/timeFormat";
import { resolveMediaCoverUrl } from "@/utils/coverArt";
import {
  generateIpodSongShareUrl,
  shouldCacheSongMetadataForShare,
} from "@/utils/sharedUrl";
import { onAppUpdate } from "@/utils/appEventBus";
import {
  SEEK_AMOUNT_SECONDS,
  IPOD_NOW_PLAYING_SONG_MENU_KEY as NOW_PLAYING_SONG_MENU_KEY,
  getAlbumGroupingKey,
  getArtistGroupingDisplayName,
  getArtistGroupingKey,
  resolveTrackCoverUrl,
} from "../constants";
import type {
  MenuHistoryEntry,
  MenuItem,
  WheelArea,
  RotationDirection,
} from "../types";
import type { IpodInitialData } from "../../base/types";
import type { CoverFlowRef } from "../components/cover-flow/types";
import type { MusicQuizRef } from "../components/music-quiz/types";
import type { BrickGameRef } from "../components/brick-game/types";
import type { SongSearchResult } from "@/components/dialogs/SongSearchDialog";
import { helpItems } from "..";
import {
  appleMusicLoadingPlaceholderMenuItems,
  resolveAppleMusicMenuTitlebarLoading,
  shouldUseModernAppleMusicTitlebarLoading,
} from "../utils/appleMusicMenuLoading";
import {
  getAppleMusicPlaylistIdFromMenuTitle,
  getAppleMusicPlaylistMenuTitle,
  resolveAppleMusicPlaylistMenu,
} from "../utils/appleMusicPlaylistMenu";
import { getMenuMemoryKey, isNowPlayingSongMenu } from "../utils/menuIdentity";
import { shouldPlayIpodWheelSound } from "../utils/wheelSound";
import { shouldEnableAppleMusicIntegration } from "../utils/appleMusicActivation";
import { createClientLogger } from "@/utils/logger";

// User-agent sniffing is constant for the document lifetime, so compute once
// at module load instead of re-running these regexes on every render of the
// hook. The fallback for non-browser contexts (e.g. SSR, tests) keeps the
// module import safe.
const UA = typeof navigator !== "undefined" ? navigator.userAgent : "";
const IS_IOS = /iP(hone|od|ad)/.test(UA);
const IS_SAFARI =
  /Safari/.test(UA) && !/Chrome/.test(UA) && !/CriOS/.test(UA);
const IS_IOS_SAFARI = IS_IOS && IS_SAFARI;
const ipodLog = createClientLogger("iPod");

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
  const { play: playScrollSoundSource } = useSound(Sounds.IPOD_CLICK_WHEEL);
  const lastScrollSoundAtRef = useRef<number | null>(null);
  const playScrollSound = useCallback(() => {
    const now = Date.now();
    if (!shouldPlayIpodWheelSound(lastScrollSoundAtRef.current, now)) return;
    lastScrollSoundAtRef.current = now;
    void playScrollSoundSource();
  }, [playScrollSoundSource]);
  const vibrate = useVibration(100, 50);
  const isOffline = useOffline();
  const translatedHelpItems = useTranslatedHelpItems("ipod", helpItems);

  // Active library and playback state
  const {
    appleMusicPlaylists,
    appleMusicPlaylistTracks,
    appleMusicPlaylistTracksLoading,
    appleMusicPlaylistsLoading,
    librarySource,
    isAppleMusic,
    tracks,
    browsableTracks,
    currentSongId,
    currentIndex,
    browseCurrentIndex,
    coverFlowCurrentIndex,
    nowPlayingScope,
    loopCurrent,
    loopAll,
    isShuffled,
    isPlaying,
    showVideo,
    backlightOn,
  } = useIpodActiveLibrary();

  const {
    theme: persistedTheme,
    backlightTimeout,
    lcdFilterOn,
    displayMode,
    showLyrics,
    lyricsAlignment,
    lyricsFont,
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
    playbackRequested,
    confirmPlayback,
    setDisplayMode,
    toggleVideo,
    toggleBacklight,
    setBacklightTimeout,
    setTheme,
    setUiVariant,
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
    backlightTimeout: s.backlightTimeout,
    lcdFilterOn: s.lcdFilterOn,
    displayMode: s.displayMode ?? DisplayMode.Video,
    showLyrics: s.showLyrics,
    lyricsAlignment: s.lyricsAlignment,
    lyricsFont: s.lyricsFont,
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
    playbackRequested: s.playbackRequested,
    confirmPlayback: s.confirmPlayback,
    toggleVideo: s.toggleVideo,
    toggleBacklight: s.toggleBacklight,
    setBacklightTimeout: s.setBacklightTimeout,
    setTheme: s.setTheme,
    setUiVariant: s.setUiVariant,
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

  // System dark-mode override for the iPod skin: when the OS is in dark mode
  // and the user's persisted iPod theme is "classic" (the only one with a
  // light shell), render as "black" so the iPod fits the rest of the dark
  // chrome. The persisted preference itself isn't mutated — flip dark mode off
  // and the classic skin returns. Menu radio checks read the persisted value
  // directly so the user always sees what they actually picked.
  const isSystemDark = useThemeStore((s) => s.isDark);
  const theme: typeof persistedTheme =
    isSystemDark && persistedTheme === "classic" ? "black" : persistedTheme;

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
  // Keep every Apple Music side effect dormant while the YouTube library is
  // active. Switching sources enables MusicKit first, then library hydration.
  const enableMusicKit = shouldEnableAppleMusicIntegration(librarySource);
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
    enabled: enableMusicKit,
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

  const previousPlaybackDebugRef = useRef<{
    isWindowOpen: boolean;
    librarySource: typeof librarySource;
    currentSongId: string | null;
    currentIndex: number;
    playbackRequested: boolean;
    isPlaying: boolean;
    isFullScreen: boolean;
  } | null>(null);
  useEffect(() => {
    const snapshot = {
      isWindowOpen,
      librarySource,
      currentSongId,
      currentIndex,
      playbackRequested,
      isPlaying,
      isFullScreen,
    };
    const previous = previousPlaybackDebugRef.current;
    if (previous === null) {
      ipodLog.debug("Initial playback state", snapshot);
    } else if (
      previous.isWindowOpen !== snapshot.isWindowOpen ||
      previous.librarySource !== snapshot.librarySource ||
      previous.currentSongId !== snapshot.currentSongId ||
      previous.currentIndex !== snapshot.currentIndex ||
      previous.playbackRequested !== snapshot.playbackRequested ||
      previous.isPlaying !== snapshot.isPlaying ||
      previous.isFullScreen !== snapshot.isFullScreen
    ) {
      ipodLog.debug("Playback state changed", { previous, next: snapshot });
    }
    previousPlaybackDebugRef.current = snapshot;
  }, [
    currentIndex,
    currentSongId,
    isFullScreen,
    isPlaying,
    isWindowOpen,
    librarySource,
    playbackRequested,
  ]);


  // Derived from the active-library subscription instead of a store selector:
  // a selector would run its O(n) track lookup on every store mutation
  // (including each playback tick), while `tracks`/`currentIndex` only change
  // on library or track-selection updates.
  const lyricOffset = tracks[currentIndex]?.lyricOffset ?? 0;

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

  // Status / backlight / activity state is owned by useIpodStatusBacklight
  // (composed below, after the playback + games state it depends on).

  // Dialog state
  const {
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
    isAddingSong,
    setIsAddingSong,
  } = useMediaAppDialogs();
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
              entry.kind === "radio" ||
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

  const uiVariant = useIpodStore((s) => s.uiVariant);
  const useModernAppleMusicTitlebarLoading =
    shouldUseModernAppleMusicTitlebarLoading(uiVariant);
  
  // Cover Flow state
  const [isCoverFlowOpen, setIsCoverFlowOpen] = useState(false);

  // Music Quiz state
  const [isMusicQuizOpen, setIsMusicQuizOpen] = useState(false);
  const wasPlayingBeforeQuizRef = useRef(false);

  // Brick Game state
  const [isBrickGameOpen, setIsBrickGameOpen] = useState(false);
  const wasPlayingBeforeBrickGameRef = useRef(false);

  const {
    totalTime,
    setTotalTime,
    playerRef,
    fullScreenPlayerRef,
    lastTrackedSongRef,
    skipOperationRef,
    userHasInteractedRef,
    isTrackSwitchingRef,
    trackSwitchTimeoutRef,
    startTrackSwitch: startTrackSwitchGuard,
    pauseBeforeWindowClose,
  } = useIpodPlayback({
    isWindowOpen,
    isFullScreen,
    musicKitInstanceRef,
  });
  const coverFlowRef = useRef<CoverFlowRef | null>(null);
  const musicQuizRef = useRef<MusicQuizRef | null>(null);
  const brickGameRef = useRef<BrickGameRef | null>(null);
  
  // Screen long press for CoverFlow toggle
  const screenLongPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const screenLongPressFiredRef = useRef(false);
  const screenLongPressStartPos = useRef<{ x: number; y: number } | null>(null);
  const SCREEN_LONG_PRESS_MOVE_THRESHOLD = 10; // pixels - cancel if moved more than this
  
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
  /** When set, Menu pops back to the Now Playing song menu (not up the browse stack). */
  const returnToNowPlayingSongMenuRef = useRef(false);
  const nowPlayingSongMenuSnapshotRef = useRef<{
    displayTitle: string;
    selectedIndex: number;
  } | null>(null);

  const clearReturnToNowPlayingSongMenu = useCallback(() => {
    returnToNowPlayingSongMenuRef.current = false;
    nowPlayingSongMenuSnapshotRef.current = null;
  }, []);

  // Mirror the latest cursor position for use inside callbacks (especially
  // setMenuHistory updaters) without forcing every menu-item factory to
  // re-memoize on every wheel tick.
  const selectedMenuItemRef = useRef(selectedMenuItem);
  useEffect(() => {
    selectedMenuItemRef.current = selectedMenuItem;
  }, [selectedMenuItem]);

  // Remember the last cursor position for each stable menu identity. This keeps
  // forward navigation symmetric with back navigation: if the user backs
  // out of a playlist/artist/album and then enters it again, we restore
  // the item they were on instead of resetting that child menu to row 0.
  const rememberedMenuSelectedIndexRef = useRef<Record<string, number>>({});

  const getRememberedMenuSelectedIndex = useCallback(
    (menu: MenuHistoryEntry, fallback: number, itemCount: number) => {
      const remembered =
        rememberedMenuSelectedIndexRef.current[getMenuMemoryKey(menu)];
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
          child,
          child.selectedIndex,
          child.items.length
        ),
      };
      setMenuHistory((prev) => {
        if (prev.length === 0) return [childWithRememberedSelection];
        const updated = prev.slice();
        const parent = updated[updated.length - 1];
        rememberedMenuSelectedIndexRef.current[getMenuMemoryKey(parent)] =
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

  // Status message, last-activity clock, and backlight auto-off/foreground-wake.
  const {
    statusMessage,
    setLastActivityTime,
    showStatus,
    showOfflineStatus,
    registerActivity,
    registerActivityRef,
  } = useIpodStatusBacklight({
    t,
    menuLocale,
    isForeground,
    toggleBacklight,
    userHasInteractedRef,
    isMusicQuizOpen,
    isBrickGameOpen,
    backlightOn,
    backlightTimeout,
  });

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

  const memoizedCycleBacklightTimeout = useCallback(() => {
    const currentSetting = useIpodStore.getState().backlightTimeout;
    const nextSetting: IpodBacklightTimeout =
      currentSetting === "2s"
        ? "10s"
        : currentSetting === "10s"
        ? "always-on"
        : currentSetting === "always-on"
        ? "off"
        : "2s";
    setBacklightTimeout(nextSetting);

    if (nextSetting === "off") {
      if (useIpodStore.getState().backlightOn) {
        toggleBacklight();
      }
      showStatus(t("apps.ipod.menuItems.off"));
      return;
    }

    if (nextSetting === "always-on") {
      if (!useIpodStore.getState().backlightOn) {
        toggleBacklight();
      }
      showStatus(t("apps.ipod.menuItems.alwaysOn", "Keep On"));
      registerActivity();
      return;
    }

    if (!useIpodStore.getState().backlightOn) {
      toggleBacklight();
    }
    showStatus(nextSetting);
    registerActivity();
  }, [setBacklightTimeout, toggleBacklight, showStatus, registerActivity, menuLocale]);

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
      if (action === memoizedToggleBacklight || action === memoizedCycleBacklightTimeout) {
        action();
      } else {
        registerActivity();
        action();
      }
    },
    [registerActivity, memoizedToggleBacklight, memoizedCycleBacklightTimeout]
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

  const memoizedHandleUiThemeChange = useCallback(() => {
    const currentVariant = useIpodStore.getState().uiVariant;
    const nextVariant = currentVariant === "classic" ? "modern" : "classic";
    setUiVariant(nextVariant);
    showStatus(
      nextVariant === "modern"
        ? t("apps.ipod.menu.screenModern")
        : t("apps.ipod.menu.screenClassic")
    );
    registerActivity();
  }, [setUiVariant, showStatus, registerActivity, menuLocale]);

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
      clearReturnToNowPlayingSongMenu();
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
      clearReturnToNowPlayingSongMenu,
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
    // Lazy per-playlist sync: only fetch when this playlist has never
    // been loaded (in-memory or IndexedDB) or its cache is stale.
    // `syncAppleMusicResource` routes through the playlist-track SWR fetcher
    // and shares dedupe behavior with other Apple Music resources.
    void syncAppleMusicResource({ kind: "playlistTracks", playlistId }).catch(
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
      toast.error(t("apps.ipod.dialogs.appleMusicNotConfigured"), {
        description: t("apps.ipod.dialogs.appleMusicNotConfiguredDescription"),
      });
      return;
    }
    if (musicKitStatus === "idle" || musicKitStatus === "loading") {
      showStatus(t("apps.ipod.menuItems.loading"));
      return;
    }
    if (musicKitStatus !== "ready") {
      toast.error(t("apps.ipod.dialogs.appleMusicSignInFailed"));
      return;
    }
    try {
      await musicKitAuthorize();
      showStatus(t("apps.ipod.status.appleMusicSignedIn", "Apple Music ✓"));
    } catch (err) {
      toast.error(t("apps.ipod.dialogs.appleMusicSignInFailed"), {
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
      appleMusicPlaylistsLoading: false,
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
  // resolves. The modern UI uses a titlebar spinner (not a list row)
  // on first load; every subsequent open shows cached entries while
  // the refresh runs and updates the list when done.
  const loadAppleMusicRecentlyAdded = useCallback(async () => {
    if (!appleMusicAuthorized) {
      void handleAppleMusicSignIn();
      return;
    }
    try {
      const tracks = await syncAppleMusicResource({
        kind: "recentlyAdded",
        force: true,
      });
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
      const tracks = await syncAppleMusicResource({
        kind: "favorites",
        force: true,
      });
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

  const loadAppleMusicPlaylists = useCallback(async () => {
    if (!appleMusicAuthorized) {
      void handleAppleMusicSignIn();
      return;
    }
    try {
      // Use the regular SWR window (15 min by default) so opening the
      // Playlists menu serves cached results immediately when fresh,
      // instead of forcing a round-trip on every entry. The opportunistic
      // background refresh in `useAppleMusicLibrary` still revalidates
      // the list when it goes stale or when the tab regains visibility,
      // so cross-device additions/deletions still show up promptly
      // without paying a network fetch for every menu open.
      await syncAppleMusicResource({
        kind: "playlists",
        allowEmpty: true,
      });
    } catch (err) {
      const hasCached = useIpodStore.getState().appleMusicPlaylists.length > 0;
      if (!hasCached) {
        toast.error(
          t(
            "apps.ipod.dialogs.appleMusicPlaylistsFailed",
            "Failed to load playlists"
          ),
          {
            description: err instanceof Error ? err.message : String(err),
          }
        );
      } else {
        console.warn(
          "[apple music] playlist refresh failed (using cached playlist list)",
          err
        );
      }
    }
  }, [appleMusicAuthorized, handleAppleMusicSignIn, menuLocale]);

  const loadAppleMusicRadioStations = useCallback(async (options?: {
    promptForAuth?: boolean;
    showErrors?: boolean;
  }) => {
    const promptForAuth = options?.promptForAuth ?? true;
    const showErrors = options?.showErrors ?? true;
    const hadCached = appleMusicRadioTracks.length > 0;
    setIsAppleMusicRadioLoading(true);
    try {
      const stations = await syncAppleMusicResource({
        kind: "radio",
      });
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
      setIsAppleMusicRadioLoading(false);
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
        menu.kind === "radio" ||
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
    setMenuMode(true);
    showStatus(
      t("apps.ipod.status.libraryAppleMusic", "Library: Apple Music")
    );
  }, [
    librarySource,
    pauseBeforeWindowClose,
    registerActivity,
    setLibrarySource,
    showStatus,
    menuLocale,
  ]);

  // Backlight timer + foreground handling live in useIpodStatusBacklight.

  // Reset elapsed time on track change, arm the track-switch guard, and
  // auto-seek for negative lyric offsets (shared MediaCore behavior).
  const getActiveReactPlayer = useActiveMediaPlayer(
    isFullScreen,
    playerRef,
    fullScreenPlayerRef
  );
  const setIpodElapsedTime = useCallback((seconds: number) => {
    useIpodStore.getState().setElapsedTime(seconds);
  }, []);
  useLyricOffsetTrackChange({
    currentIndex,
    tracks,
    isFullScreen,
    guard: { isTrackSwitchingRef, trackSwitchTimeoutRef, startTrackSwitch: startTrackSwitchGuard },
    getActivePlayer: getActiveReactPlayer,
    setElapsedTime: setIpodElapsedTime,
    showStatus,
  });

  // Cleanup track-switch timeout on unmount (status timeout cleanup lives in
  // useIpodStatusBacklight).
  useEffect(() => {
    return () => {
      if (trackSwitchTimeoutRef.current) {
        clearTimeout(trackSwitchTimeoutRef.current);
      }
    };
  }, [trackSwitchTimeoutRef]);

  // Group tracks by artist once per `tracks` change. With large libraries
  // (e.g. an Apple Music sync of several thousand songs) this is expensive
  // enough that we don't want it running on every IpodScreen re-render.
  // Apple Music groups by album artist, so feature/collaboration variants
  // collapse under the artist the library uses for album browsing.
  const unknownArtistLabel = t("apps.ipod.menu.unknownArtist");
  const unknownAlbumLabel = t("apps.ipod.menuItems.unknownAlbum");
  const artistGroupsByKey = useMemo(() => {
    const grouped: Record<
      string,
      {
        key: string;
        name: string;
        tracks: { track: Track; index: number }[];
      }
    > = {};
    for (let index = 0; index < browsableTracks.length; index++) {
      const track = browsableTracks[index];
      const key = getArtistGroupingKey(track, unknownArtistLabel);
      const name = getArtistGroupingDisplayName(track, unknownArtistLabel);
      const group =
        grouped[key] ||
        (grouped[key] = {
          key,
          name,
          tracks: [],
        });
      group.tracks.push({ track, index });
    }
    return grouped;
  }, [browsableTracks, unknownArtistLabel]);

  const sortedArtistKeys = useMemo(
    () =>
      Object.keys(artistGroupsByKey).sort((a, b) =>
        artistGroupsByKey[a].name.localeCompare(
          artistGroupsByKey[b].name,
          undefined,
          { sensitivity: "base" }
        )
      ),
    [artistGroupsByKey]
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
      const artistKey = getArtistGroupingKey(track, unknownArtistLabel);
      const albumKey = getAlbumGroupingKey(
        track,
        unknownAlbumLabel,
        unknownArtistLabel
      );
      const artistAlbums = grouped[artistKey] || (grouped[artistKey] = {});
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
  //
  // The list is sorted by track title so the classic iPod "scroll by
  // letter" affordance lands on the right alphabetic group (the menu
  // pushes that surface this list — Music > Songs and Music > Albums >
  // All — opt into `alphabetic: true` so the wheel switches into
  // letter-jump mode after a sustained fast spin). The playback queue
  // mirrors the displayed order: tapping a song sets an Apple Music
  // contextual queue of the sorted ids so next/previous walks the list
  // exactly as the user sees it.
  const sortedBrowsableTracks = useMemo(
    () =>
      [...browsableTracks].sort((a, b) => {
        const byTitle = a.title.localeCompare(b.title, undefined, {
          sensitivity: "base",
        });
        if (byTitle !== 0) return byTitle;
        return a.id.localeCompare(b.id, undefined, { sensitivity: "base" });
      }),
    [browsableTracks]
  );
  const allSongsMenuItems = useMemo(() => {
    const queueIds = sortedBrowsableTracks.map((track) => track.id);
    return sortedBrowsableTracks.map((track, index) => ({
      label: track.title,
      action: () => playTrackFromMenu(track, index, queueIds),
      showChevron: false,
      coverUrl: resolveTrackCoverUrl(track),
    }));
  }, [sortedBrowsableTracks, playTrackFromMenu]);

  const appleMusicRecentlyAddedMenuItems = useMemo(() => {
    const loadingLabel = t("apps.ipod.menuItems.loading", "Loading…");
    if (
      isAppleMusicRecentlyAddedLoading &&
      appleMusicRecentlyAddedTracks.length === 0
    ) {
      return appleMusicLoadingPlaceholderMenuItems(
        loadingLabel,
        useModernAppleMusicTitlebarLoading
      );
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
    return appleMusicRecentlyAddedTracks.map((track, index) => {
      const displayArtist = (track.albumArtist || track.artist)?.trim();
      return {
        label: track.title,
        subtitle:
          displayArtist && displayArtist.length > 0 ? displayArtist : undefined,
        action: () =>
          playAppleMusicTrackFromMenu(
            track,
            index,
            queueIds,
            appleMusicRecentlyAddedTracks
          ),
        showChevron: false,
        coverUrl: resolveTrackCoverUrl(track),
      };
    });
  }, [
    appleMusicRecentlyAddedTracks,
    isAppleMusicRecentlyAddedLoading,
    playAppleMusicTrackFromMenu,
    menuLocale,
    useModernAppleMusicTitlebarLoading,
  ]);

  const appleMusicFavoritesMenuItems = useMemo(() => {
    const loadingLabel = t("apps.ipod.menuItems.loading", "Loading…");
    if (isAppleMusicFavoritesLoading && appleMusicFavoriteTracks.length === 0) {
      return appleMusicLoadingPlaceholderMenuItems(
        loadingLabel,
        useModernAppleMusicTitlebarLoading
      );
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
    return appleMusicFavoriteTracks.map((track, index) => {
      const displayArtist = (track.albumArtist || track.artist)?.trim();
      return {
        label: track.title,
        subtitle:
          displayArtist && displayArtist.length > 0 ? displayArtist : undefined,
        action: () =>
          playAppleMusicTrackFromMenu(
            track,
            index,
            queueIds,
            appleMusicFavoriteTracks
          ),
        showChevron: false,
        coverUrl: resolveTrackCoverUrl(track),
      };
    });
  }, [
    appleMusicFavoriteTracks,
    isAppleMusicFavoritesLoading,
    playAppleMusicTrackFromMenu,
    menuLocale,
    useModernAppleMusicTitlebarLoading,
  ]);

  const appleMusicRadioMenuItems = useMemo(() => {
    const loadingLabel = t("apps.ipod.menuItems.loading", "Loading…");
    if (isAppleMusicRadioLoading && appleMusicRadioTracks.length === 0) {
      return appleMusicLoadingPlaceholderMenuItems(
        loadingLabel,
        useModernAppleMusicTitlebarLoading
      );
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
    useModernAppleMusicTitlebarLoading,
  ]);

  const artistAllSongsMenuItemsByTitle = useMemo(() => {
    const result: Record<
      string,
      { label: string; action: () => void; showChevron: boolean }[]
    > = {};
    const allSongsLabel = t("apps.ipod.menuItems.allSongs");
    for (const artistKey of sortedArtistKeys) {
      const artist = artistGroupsByKey[artistKey];
      // Per-artist "All" lists are sorted by track title so the wheel's
      // "scroll by letter" mode lands on the right group. The
      // playback queue mirrors this order so next/previous walks the
      // list as it appears on screen.
      const artistTracks = [...artist.tracks].sort((a, b) => {
        const byTitle = a.track.title.localeCompare(b.track.title, undefined, {
          sensitivity: "base",
        });
        if (byTitle !== 0) return byTitle;
        return a.track.id.localeCompare(b.track.id, undefined, {
          sensitivity: "base",
        });
      });
      const queueIds = artistTracks.map(({ track }) => track.id);
      const title = `${artistKey} - ${allSongsLabel}`;
      const legacyTitle = `${artist.name} - ${allSongsLabel}`;
      result[title] = artistTracks.map(({ track }, trackListIndex) => ({
        label: track.title,
        action: () => playTrackFromMenu(track, trackListIndex, queueIds),
        showChevron: false,
        coverUrl: resolveTrackCoverUrl(track),
      }));
      if (legacyTitle !== title && !result[legacyTitle]) {
        result[legacyTitle] = result[title];
      }
    }
    return result;
  }, [artistGroupsByKey, sortedArtistKeys, playTrackFromMenu, t]);

  const artistAlbumMenuItemsByTitle = useMemo(() => {
    const result: Record<
      string,
      { label: string; action: () => void; showChevron: boolean }[]
    > = {};
    for (const artistKey of sortedArtistKeys) {
      const artist = artistGroupsByKey[artistKey];
      const albums = sortedAlbumsByArtist[artistKey] ?? [];
      for (const albumKey of albums) {
        const albumTracks = tracksByArtistAlbum[artistKey]?.[albumKey] ?? [];
        const queueIds = albumTracks.map(({ track }) => track.id);
        const title = `${artistKey}\u0000${albumKey}`;
        const legacyTitle = `${artist.name}\u0000${albumKey}`;
        result[title] = albumTracks.map(({ track }, trackListIndex) => ({
          label: track.title,
          action: () => playTrackFromMenu(track, trackListIndex, queueIds),
          showChevron: false,
          coverUrl: resolveTrackCoverUrl(track),
        }));
        if (legacyTitle !== title && !result[legacyTitle]) {
          result[legacyTitle] = result[title];
        }
      }
    }
    return result;
  }, [
    artistGroupsByKey,
    sortedArtistKeys,
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
    for (const artistKey of sortedArtistKeys) {
      const artist = artistGroupsByKey[artistKey];
      const allSongsTitle = `${artistKey} - ${allSongsLabel}`;
      const artistTracks = artist.tracks;
      const artistAllCoverTrack = artistTracks.find(
        ({ track }) => resolveTrackCoverUrl(track) !== null
      )?.track ?? artistTracks[0]?.track ?? null;
      const albumItems = (sortedAlbumsByArtist[artistKey] ?? []).map((albumKey) => {
        const album = albumGroupsByKey[albumKey]?.album ?? albumKey;
        const albumTitle = `${artistKey}\u0000${albumKey}`;
        const albumTracks = tracksByArtistAlbum[artistKey]?.[albumKey] ?? [];
        const albumCoverTrack = albumTracks.find(
          ({ track }) => resolveTrackCoverUrl(track) !== null
        )?.track ?? albumTracks[0]?.track ?? null;
        return {
          label: album,
          subtitle: artist.name,
          action: () => {
            registerActivity();
            pushMenuChild({
              kind: "artistAlbum",
              id: albumTitle,
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

      result[artistKey] = [
        {
          label: allLabel,
          subtitle: allSongsLabel,
          action: () => {
            registerActivity();
            pushMenuChild({
              kind: "artistAllSongs",
              id: artistKey,
              title: allSongsTitle,
              displayTitle: `${artist.name} - ${allSongsLabel}`,
              items: artistAllSongsMenuItemsByTitle[allSongsTitle] ?? EMPTY_IPOD_MENU_ITEMS,
              selectedIndex: 0,
              alphabetic: true,
            });
          },
          showChevron: true,
          coverUrl: resolveTrackCoverUrl(artistAllCoverTrack),
        },
        ...albumItems,
      ];
      if (artist.name !== artistKey && !result[artist.name]) {
        result[artist.name] = result[artistKey];
      }
    }
    return result;
  }, [
    artistGroupsByKey,
    sortedArtistKeys,
    sortedAlbumsByArtist,
    albumGroupsByKey,
    artistAllSongsMenuItemsByTitle,
    artistAlbumMenuItemsByTitle,
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
              kind: "songs",
              id: "all",
              title: allSongsLabel,
              items: allSongsMenuItems,
              selectedIndex: 0,
              alphabetic: true,
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
                kind: "album",
                id: albumKey,
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
              kind: "albums",
              id: "all",
              title: albumsLabel,
              items: albumsListMenuItems,
              selectedIndex: 0,
              alphabetic: true,
            });
          },
          showChevron: true,
        },
        ...sortedArtistKeys.map((artistKey) => {
          const artist = artistGroupsByKey[artistKey];
          const artistTracks = artist.tracks;
          const artistCoverTrack = artistTracks.find(
            ({ track }) => resolveTrackCoverUrl(track) !== null
          )?.track ?? artistTracks[0]?.track ?? null;
          return {
            label: artist.name,
            action: () => {
              registerActivity();
              pushMenuChild({
                kind: "artist",
                id: artistKey,
                title: artistKey,
                displayTitle: artist.name,
                items: artistMenuItemsByArtist[artistKey],
                selectedIndex: 0,
              });
            },
            showChevron: true,
            coverUrl: resolveTrackCoverUrl(artistCoverTrack),
          };
        }),
      ];
    },
    [
      artistGroupsByKey,
      sortedArtistKeys,
      artistMenuItemsByArtist,
      albumsListMenuItems,
      registerActivity,
      pushMenuChild,
      menuLocale,
    ]
  );

  const loadingLabel = t("apps.ipod.menuItems.loading", "Loading…");
  const applePlaylistTrackMenuItemsByPlaylist = useMemo(() => {
    const result: Record<string, MenuItem[]> = {};
    for (const playlist of appleMusicPlaylists) {
      const playlistTracks = appleMusicPlaylistTracks[playlist.id] ?? [];
      const isLoading =
        appleMusicPlaylistTracksLoading[playlist.id] === true &&
        playlistTracks.length === 0;
      if (isLoading) {
        result[playlist.id] = appleMusicLoadingPlaceholderMenuItems(
          loadingLabel,
          useModernAppleMusicTitlebarLoading
        );
      } else {
        const queueIds = playlistTracks.map((t) => t.id);
        result[playlist.id] = playlistTracks.map((track, trackListIndex) => {
          const displayArtist = (track.albumArtist || track.artist)?.trim();
          return {
            label: track.title,
            subtitle: displayArtist && displayArtist.length > 0 ? displayArtist : undefined,
            action: () =>
              playAppleMusicTrackFromMenu(
                track,
                trackListIndex,
                queueIds,
                playlistTracks
              ),
            showChevron: false,
            coverUrl: resolveTrackCoverUrl(track),
          };
        });
      }
    }
    return result;
  }, [
    appleMusicPlaylists,
    appleMusicPlaylistTracks,
    appleMusicPlaylistTracksLoading,
    playAppleMusicTrackFromMenu,
    loadingLabel,
    useModernAppleMusicTitlebarLoading,
  ]);

  const appleMusicMenuTitlebarLoading = useMemo(() => {
    if (
      !useModernAppleMusicTitlebarLoading ||
      !isAppleMusic ||
      !menuMode ||
      menuHistory.length === 0
    ) {
      return false;
    }
    const currentMenu = menuHistory[menuHistory.length - 1];
    const menuTitle = currentMenu.displayTitle ?? currentMenu.title;
    return resolveAppleMusicMenuTitlebarLoading({
      menuTitle,
      recentlyAddedTitle: t(
        "apps.ipod.menuItems.recentlyAdded",
        "Recently Added"
      ),
      favoriteSongsTitle: t(
        "apps.ipod.menuItems.favoriteSongs",
        "Favorite Songs"
      ),
      radioTitle: t("apps.ipod.menuItems.radio", "Radio"),
      playlistsTitle: t("apps.ipod.menuItems.playlists"),
      isRecentlyAddedLoading: isAppleMusicRecentlyAddedLoading,
      isFavoritesLoading: isAppleMusicFavoritesLoading,
      isRadioLoading: isAppleMusicRadioLoading,
      isLibraryLoading: appleMusicLibraryLoading,
      isPlaylistsLoading: appleMusicPlaylistsLoading,
      playlistTracksLoading: appleMusicPlaylistTracksLoading,
      playlists: appleMusicPlaylists,
      playlistsCount: appleMusicPlaylists.length,
    });
  }, [
    useModernAppleMusicTitlebarLoading,
    isAppleMusic,
    menuMode,
    menuHistory,
    isAppleMusicRecentlyAddedLoading,
    isAppleMusicFavoritesLoading,
    isAppleMusicRadioLoading,
    appleMusicLibraryLoading,
    appleMusicPlaylistsLoading,
    appleMusicPlaylistTracksLoading,
    appleMusicPlaylists,
    menuLocale,
  ]);

  // Preserve the original playlist order returned by Apple Music
  // (`/v1/me/library/playlists` returns playlists in the user's chosen
  // order — pinned/recently-modified first, etc.). Sorting alphabetically
  // here hides that intent, and on the iPod the Playlists menu is short
  // enough that the wheel's fast scroll-by-letter mode isn't worth the
  // trade-off. The submenu is also pushed WITHOUT `alphabetic: true` so
  // the wheel doesn't try to group rows by leading letter.
  const applePlaylistsMenuItems = useMemo(
    (): MenuItem[] =>
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
        const description = playlist.description?.trim();
        const songCount =
          typeof playlist.trackCount === "number" && playlist.trackCount >= 0
            ? playlist.trackCount
            : playlistTracks.length;
        const subtitle =
          description && description.length > 0
            ? description
            : t("apps.ipod.menuItems.playlistTrackCount", { count: songCount });
        return {
          label: playlist.name,
          subtitle,
          action: () => {
            registerActivity();
            requestPlaylistTracksIfNeeded(playlist.id);
            pushMenuChild({
              kind: "appleMusicPlaylist",
              id: playlist.id,
              title: getAppleMusicPlaylistMenuTitle(playlist.id),
              displayTitle: playlist.name,
              items: applePlaylistTrackMenuItemsByPlaylist[playlist.id] ?? EMPTY_IPOD_MENU_ITEMS,
              selectedIndex: 0,
              modernMediaList: true,
            });
          },
          showChevron: true,
          coverUrl,
          emptyArtworkKind: "playlist",
        };
      }),
    [
      appleMusicPlaylists,
      appleMusicPlaylistTracks,
      applePlaylistTrackMenuItemsByPlaylist,
      registerActivity,
      requestPlaylistTracksIfNeeded,
      pushMenuChild,
      menuLocale,
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
      options?: {
        kind?: MenuHistoryEntry["kind"];
        id?: string;
        modernMediaList?: boolean;
        alphabetic?: boolean;
      }
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
              kind: "recentlyAdded",
              id: "recentlyAdded",
              title: recentlyAddedLabel,
              items: appleMusicRecentlyAddedMenuItems,
              selectedIndex: 0,
              modernMediaList: true,
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
              kind: "favorites",
              id: "favorites",
              title: favoriteSongsLabel,
              items: appleMusicFavoritesMenuItems,
              selectedIndex: 0,
              modernMediaList: true,
            });
            void loadAppleMusicFavorites();
          },
          showChevron: true,
        },
        {
          label: playlistsLabel,
          action: () => {
            pushSubmenu(playlistsLabel, applePlaylistsMenuItems, {
              kind: "playlists",
              id: "playlists",
              modernMediaList: true,
            });
            void loadAppleMusicPlaylists();
          },
          showChevron: true,
        },
        {
          label: artistsLabel,
          action: () =>
            pushSubmenu(artistsLabel, artistsListMenuItems, {
              kind: "artists",
              id: "artists",
              alphabetic: true,
            }),
          showChevron: true,
        },
        {
          label: albumsLabel,
          action: () =>
            pushSubmenu(albumsLabel, albumsListMenuItems, {
              kind: "albums",
              id: "albums",
              alphabetic: true,
            }),
          showChevron: true,
        },
        {
          label: songsLabel,
          action: () =>
            pushSubmenu(songsLabel, allSongsMenuItems, {
              kind: "songs",
              id: "songs",
              alphabetic: true,
            }),
          showChevron: true,
        },
        {
          label: radioLabel,
          action: () => {
            registerActivity();
            pushMenuChild({
              kind: "radio",
              id: "radio",
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
        action: () =>
          pushSubmenu(artistsLabel, artistsListMenuItems, {
            kind: "artists",
            id: "artists",
            alphabetic: true,
          }),
        showChevron: true,
      },
      {
        label: albumsLabel,
        action: () =>
          pushSubmenu(albumsLabel, albumsListMenuItems, {
            kind: "albums",
            id: "albums",
            alphabetic: true,
          }),
        showChevron: true,
      },
      {
        label: songsLabel,
        action: () =>
          pushSubmenu(allSongsLabel, allSongsMenuItems, {
            kind: "songs",
            id: "all",
            alphabetic: true,
          }),
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
    loadAppleMusicPlaylists,
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
        action: memoizedCycleBacklightTimeout,
        showChevron: false,
        value:
          backlightTimeout === "2s"
            ? "2s"
            : backlightTimeout === "10s"
            ? "10s"
            : backlightTimeout === "always-on"
            ? t("apps.ipod.menuItems.alwaysOn", "Keep On")
            : t("apps.ipod.menuItems.off"),
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
        label: t("apps.ipod.menu.uiTheme", "UI Theme"),
        action: memoizedHandleUiThemeChange,
        showChevron: false,
        value:
          uiVariant === "modern"
            ? t("apps.ipod.menu.screenModern")
            : t("apps.ipod.menu.screenClassic"),
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
    backlightTimeout,
    theme,
    uiVariant,
    memoizedToggleRepeat,
    memoizedToggleShuffle,
    memoizedCycleBacklightTimeout,
    memoizedHandleThemeChange,
    memoizedHandleUiThemeChange,
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
            kind: "music",
            id: "music",
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
              label: t("apps.ipod.menu.searchSongs", "Search Songs"),
              action: () => {
                registerActivity();
                setIsSongSearchDialogOpen(true);
              },
              showChevron: false,
            },
          ];
          pushMenuChild({
            kind: "extras",
            id: "extras",
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
            kind: "settings",
            id: "settings",
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
          const store = useIpodStore.getState();
          if (store.showVideo) toggleVideo();
          // Always force shuffle ON (don't toggle off if already on) so the
          // root "Shuffle Songs" item starts a fresh shuffle every time.
          if (!store.isShuffled) {
            store.toggleShuffle();
          }
          // Shuffle across the full library — drop any contextual queue.
          const isAppleMusicSource = store.librarySource === "appleMusic";
          if (isAppleMusicSource) {
            store.setAppleMusicPlaybackQueue(null);
          }

          // Pick a random track from the active library and play it. Avoid
          // landing on the current song when there are alternatives so the
          // user gets a fresh start every time.
          const refreshed = useIpodStore.getState();
          let pool: Track[];
          let currentId: string | null;
          if (isAppleMusicSource) {
            pool = refreshed.appleMusicTracks.filter(
              (track) => !isAppleMusicCollectionTrack(track)
            );
            currentId = refreshed.appleMusicCurrentSongId;
          } else {
            pool = refreshed.tracks;
            currentId = refreshed.currentSongId;
          }

          if (pool.length === 0) {
            setMenuMode(false);
            return;
          }

          const candidates =
            pool.length > 1
              ? pool.filter((track) => track.id !== currentId)
              : pool;
          const picked =
            candidates[Math.floor(Math.random() * candidates.length)] ?? null;

          if (picked) {
            if (isAppleMusicSource) {
              useIpodStore.getState().setAppleMusicCurrentSongId(picked.id);
            } else {
              useIpodStore.getState().setCurrentSongId(picked.id);
            }
            setIsPlaying(true);
          }

          showStatus(t("apps.ipod.status.shuffleOn"));
          setMenuDirection("forward");
          setMenuMode(false);
          setCameFromNowPlayingMenuItem(false);
          clearReturnToNowPlayingSongMenu();
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
  }, [registerActivity, toggleVideo, memoizedToggleBacklight, menuLocale, isOffline, showOfflineStatus, setIsPlaying, pushMenuChild, showStatus, clearReturnToNowPlayingSongMenu]);

  const findMenuItemIndexByLabel = useCallback(
    (items: MenuItem[], label: string) =>
      Math.max(0, items.findIndex((item) => item.label === label)),
    []
  );

  const isNowPlayingSongMenuOpen =
    menuMode &&
    menuHistory.length > 0 &&
    isNowPlayingSongMenu(
      menuHistory[menuHistory.length - 1],
      NOW_PLAYING_SONG_MENU_KEY
    );

  // Source the user was browsing when they opened the now-playing
  // song menu. `userPlaylist` covers Music > Playlists > <name>; the
  // `system` variants cover the dedicated Music > Recently Added and
  // Music > Favorite Songs collections, which are NOT exposed under
  // the Playlists submenu and therefore need their own navigation
  // path back from "Go to Playlist".
  type NowPlayingPlaylistContext =
    | { kind: "system"; system: "recentlyAdded" | "favorites" }
    | { kind: "userPlaylist"; playlist: { id: string; name: string } };

  const findPlaylistContextForNowPlaying = useCallback((): NowPlayingPlaylistContext | null => {
    const musicLabel = t("apps.ipod.menuItems.music");
    const recentlyAddedLabel = t(
      "apps.ipod.menuItems.recentlyAdded",
      "Recently Added"
    );
    const favoriteSongsLabel = t(
      "apps.ipod.menuItems.favoriteSongs",
      "Favorite Songs"
    );
    const playlistsLabel = t("apps.ipod.menuItems.playlists");
    const radioLabel = t("apps.ipod.menuItems.radio", "Radio");
    const matchFromHistory = (
      hist: MenuHistoryEntry[] | null
    ): NowPlayingPlaylistContext | null => {
      if (!hist) return null;
      for (let i = hist.length - 1; i >= 0; i--) {
        const entry = hist[i];
        const parent = i > 0 ? hist[i - 1] : null;
        // Dedicated system collections under `Music` — match BEFORE the
        // user-playlist fall-through so an Apple Music library playlist
        // literally named "Favorite Songs" (which also lives in
        // `appleMusicPlaylists`) doesn't hijack Go to Playlist when the
        // user originally entered via Music > Favorite Songs instead of
        // Music > Playlists > Favorite Songs.
        if (entry.kind === "recentlyAdded") {
          return { kind: "system", system: "recentlyAdded" };
        }
        if (entry.kind === "favorites") {
          return { kind: "system", system: "favorites" };
        }
        if (
          entry.title === recentlyAddedLabel &&
          parent?.title === musicLabel
        ) {
          return { kind: "system", system: "recentlyAdded" };
        }
        if (
          entry.title === favoriteSongsLabel &&
          parent?.title === musicLabel
        ) {
          return { kind: "system", system: "favorites" };
        }
        const playlist = resolveAppleMusicPlaylistMenu(entry, appleMusicPlaylists);
        const isAppleMusicPlaylistsMenu =
          entry.title === playlistsLabel && parent?.title === musicLabel;
        const isAppleMusicRadioMenu =
          entry.title === radioLabel && parent?.title === musicLabel;
        if (playlist && !isAppleMusicPlaylistsMenu && !isAppleMusicRadioMenu) {
          return { kind: "userPlaylist", playlist };
        }
      }
      return null;
    };
    return (
      matchFromHistory(menuHistoryBeforeNowPlayingRef.current) ??
      matchFromHistory(
        menuHistory.length > 0 &&
          !isNowPlayingSongMenu(
            menuHistory[menuHistory.length - 1],
            NOW_PLAYING_SONG_MENU_KEY
          )
          ? menuHistory
          : null
      )
    );
  }, [appleMusicPlaylists, menuHistory, t]);

  const enterMenuNavigationFromNowPlaying = useCallback(
    (entries: MenuHistoryEntry[]) => {
      registerActivity();
      if (useIpodStore.getState().showVideo) toggleVideo();
      setMenuDirection("forward");
      setMenuMode(true);
      setCameFromNowPlayingMenuItem(false);
      setMenuHistory(entries);
      const last = entries[entries.length - 1];
      setSelectedMenuItem(last?.selectedIndex ?? 0);
    },
    [registerActivity, toggleVideo, setCameFromNowPlayingMenuItem]
  );

  const navigateFromNowPlayingSongMenu = useCallback(
    (entries: MenuHistoryEntry[]) => {
      const track = tracks[currentIndex];
      if (track) {
        nowPlayingSongMenuSnapshotRef.current = {
          displayTitle: track.title,
          selectedIndex: selectedMenuItemRef.current,
        };
        returnToNowPlayingSongMenuRef.current = true;
      }
      enterMenuNavigationFromNowPlaying(entries);
    },
    [tracks, currentIndex, enterMenuNavigationFromNowPlaying]
  );

  const navigateToAlbumFromNowPlaying = useCallback(
    (track: Track) => {
      const ipodLabel = t("apps.ipod.menuItems.ipod");
      const musicLabel = t("apps.ipod.menuItems.music");
      const albumsLabel = t("apps.ipod.menuItems.albums");
      const albumKey = getAlbumGroupingKey(
        track,
        unknownAlbumLabel,
        unknownArtistLabel
      );
      const albumDisplay =
        albumGroupsByKey[albumKey]?.album ?? track.album ?? unknownAlbumLabel;
      const albumTracks = albumGroupsByKey[albumKey]?.tracks ?? [];
      const trackIdx = Math.max(
        0,
        albumTracks.findIndex(({ track: candidate }) => candidate.id === track.id)
      );
      const albumListIdx = sortedAlbums.indexOf(albumKey);
      const albumRowIdx = albumListIdx >= 0 ? albumListIdx + 1 : 1;

      navigateFromNowPlayingSongMenu([
        {
          kind: "root",
          id: "ipod",
          title: ipodLabel,
          items: mainMenuItems,
          selectedIndex: findMenuItemIndexByLabel(mainMenuItems, musicLabel),
        },
        {
          kind: "music",
          id: "music",
          title: musicLabel,
          items: musicMenuItems,
          selectedIndex: findMenuItemIndexByLabel(musicMenuItems, albumsLabel),
        },
        {
          kind: "albums",
          id: "albums",
          title: albumsLabel,
          items: albumsListMenuItems,
          selectedIndex: albumRowIdx,
        },
        {
          kind: "album",
          id: albumKey,
          title: albumKey,
          displayTitle: albumDisplay,
          items: albumMenuItemsByAlbum[albumKey] ?? EMPTY_IPOD_MENU_ITEMS,
          selectedIndex: trackIdx,
        },
      ]);
    },
    [
      t,
      unknownAlbumLabel,
      unknownArtistLabel,
      albumGroupsByKey,
      sortedAlbums,
      navigateFromNowPlayingSongMenu,
      mainMenuItems,
      musicMenuItems,
      albumsListMenuItems,
      albumMenuItemsByAlbum,
      findMenuItemIndexByLabel,
    ]
  );

  const navigateToArtistFromNowPlaying = useCallback(
    (track: Track) => {
      const ipodLabel = t("apps.ipod.menuItems.ipod");
      const musicLabel = t("apps.ipod.menuItems.music");
      const artistsLabel = t("apps.ipod.menuItems.artists");
      const artistKey = getArtistGroupingKey(track, unknownArtistLabel);
      const artistDisplay =
        artistGroupsByKey[artistKey]?.name ??
        getArtistGroupingDisplayName(track, unknownArtistLabel);
      const artistRowIdx = sortedArtistKeys.indexOf(artistKey);
      const artistListIdx = artistRowIdx >= 0 ? artistRowIdx + 1 : 1;

      navigateFromNowPlayingSongMenu([
        {
          kind: "root",
          id: "ipod",
          title: ipodLabel,
          items: mainMenuItems,
          selectedIndex: findMenuItemIndexByLabel(mainMenuItems, musicLabel),
        },
        {
          kind: "music",
          id: "music",
          title: musicLabel,
          items: musicMenuItems,
          selectedIndex: findMenuItemIndexByLabel(musicMenuItems, artistsLabel),
        },
        {
          kind: "artists",
          id: "artists",
          title: artistsLabel,
          items: artistsListMenuItems,
          selectedIndex: artistListIdx,
        },
        {
          kind: "artist",
          id: artistKey,
          title: artistKey,
          displayTitle: artistDisplay,
          items: artistMenuItemsByArtist[artistKey] ?? EMPTY_IPOD_MENU_ITEMS,
          selectedIndex: 0,
        },
      ]);
    },
    [
      t,
      unknownArtistLabel,
      artistGroupsByKey,
      sortedArtistKeys,
      navigateFromNowPlayingSongMenu,
      mainMenuItems,
      musicMenuItems,
      artistsListMenuItems,
      artistMenuItemsByArtist,
      findMenuItemIndexByLabel,
    ]
  );

  const navigateToPlaylistFromNowPlaying = useCallback(
    (track: Track, playlist: { id: string; name: string }) => {
      const ipodLabel = t("apps.ipod.menuItems.ipod");
      const musicLabel = t("apps.ipod.menuItems.music");
      const playlistsLabel = t("apps.ipod.menuItems.playlists");
      requestPlaylistTracksIfNeeded(playlist.id);
      const playlistTracks = appleMusicPlaylistTracks[playlist.id] ?? [];
      const trackIdx = Math.max(
        0,
        playlistTracks.findIndex((candidate) => candidate.id === track.id)
      );
      const playlistListIdx = Math.max(
        0,
        appleMusicPlaylists.findIndex((entry) => entry.id === playlist.id)
      );

      navigateFromNowPlayingSongMenu([
        {
          kind: "root",
          id: "ipod",
          title: ipodLabel,
          items: mainMenuItems,
          selectedIndex: findMenuItemIndexByLabel(mainMenuItems, musicLabel),
        },
        {
          kind: "music",
          id: "music",
          title: musicLabel,
          items: musicMenuItems,
          selectedIndex: findMenuItemIndexByLabel(musicMenuItems, playlistsLabel),
        },
        {
          kind: "playlists",
          id: "playlists",
          title: playlistsLabel,
          items: applePlaylistsMenuItems,
          selectedIndex: playlistListIdx,
          modernMediaList: true,
        },
        {
          kind: "appleMusicPlaylist",
          id: playlist.id,
          title: getAppleMusicPlaylistMenuTitle(playlist.id),
          displayTitle: playlist.name,
          items:
            applePlaylistTrackMenuItemsByPlaylist[playlist.id] ??
            EMPTY_IPOD_MENU_ITEMS,
          selectedIndex: trackIdx,
          modernMediaList: true,
        },
      ]);
    },
    [
      t,
      requestPlaylistTracksIfNeeded,
      appleMusicPlaylistTracks,
      appleMusicPlaylists,
      applePlaylistsMenuItems,
      applePlaylistTrackMenuItemsByPlaylist,
      navigateFromNowPlayingSongMenu,
      mainMenuItems,
      musicMenuItems,
      findMenuItemIndexByLabel,
    ]
  );

  const navigateToSystemPlaylistFromNowPlaying = useCallback(
    (track: Track, system: "recentlyAdded" | "favorites") => {
      const ipodLabel = t("apps.ipod.menuItems.ipod");
      const musicLabel = t("apps.ipod.menuItems.music");
      const recentlyAddedLabel = t(
        "apps.ipod.menuItems.recentlyAdded",
        "Recently Added"
      );
      const favoriteSongsLabel = t(
        "apps.ipod.menuItems.favoriteSongs",
        "Favorite Songs"
      );
      const targetLabel =
        system === "recentlyAdded" ? recentlyAddedLabel : favoriteSongsLabel;
      const sourceTracks =
        system === "recentlyAdded"
          ? appleMusicRecentlyAddedTracks
          : appleMusicFavoriteTracks;
      const sourceItems =
        system === "recentlyAdded"
          ? appleMusicRecentlyAddedMenuItems
          : appleMusicFavoritesMenuItems;
      const trackIdx = Math.max(
        0,
        sourceTracks.findIndex((candidate) => candidate.id === track.id)
      );

      navigateFromNowPlayingSongMenu([
        {
          kind: "root",
          id: "ipod",
          title: ipodLabel,
          items: mainMenuItems,
          selectedIndex: findMenuItemIndexByLabel(mainMenuItems, musicLabel),
        },
        {
          kind: "music",
          id: "music",
          title: musicLabel,
          items: musicMenuItems,
          selectedIndex: findMenuItemIndexByLabel(musicMenuItems, targetLabel),
        },
        {
          kind: system === "recentlyAdded" ? "recentlyAdded" : "favorites",
          id: system,
          title: targetLabel,
          items: sourceItems,
          selectedIndex: trackIdx,
          modernMediaList: true,
        },
      ]);

      if (system === "recentlyAdded") {
        void loadAppleMusicRecentlyAdded();
      } else {
        void loadAppleMusicFavorites();
      }
    },
    [
      t,
      appleMusicRecentlyAddedTracks,
      appleMusicFavoriteTracks,
      appleMusicRecentlyAddedMenuItems,
      appleMusicFavoritesMenuItems,
      navigateFromNowPlayingSongMenu,
      mainMenuItems,
      musicMenuItems,
      findMenuItemIndexByLabel,
      loadAppleMusicRecentlyAdded,
      loadAppleMusicFavorites,
    ]
  );

  const nowPlayingSongMenuItems = useMemo(() => {
    const track = tracks[currentIndex];
    if (!track) return EMPTY_IPOD_MENU_ITEMS;

    const coverFlowLabel = t("apps.ipod.menu.coverFlow", "Cover Flow");
    const addToFavoritesLabel = t(
      "apps.ipod.menu.addToFavorites",
      "Add to Favorites"
    );
    const goToPlaylistLabel = t("apps.ipod.menu.goToPlaylist", "Go to Playlist");
    const goToAlbumLabel = t("apps.ipod.menu.goToAlbum", "Go to Album");
    const goToArtistLabel = t("apps.ipod.menu.goToArtist", "Go to Artist");
    const playlistContext = isAppleMusic
      ? findPlaylistContextForNowPlaying()
      : null;

    const items: MenuItem[] = [
      {
        label: coverFlowLabel,
        action: () => {
          registerActivity();
          setMenuMode(false);
          setMenuDirection("forward");
          setIsCoverFlowOpen(true);
        },
        showChevron: true,
      },
    ];

    if (isAppleMusic && track.source === "appleMusic") {
      items.push({
        label: addToFavoritesLabel,
        action: () => {
          setMenuMode(false);
          setMenuDirection("backward");
          void handleAppleMusicAddToFavorites();
        },
        showChevron: false,
      });
    }

    if (playlistContext) {
      items.push({
        label: goToPlaylistLabel,
        action: () => {
          if (playlistContext.kind === "system") {
            navigateToSystemPlaylistFromNowPlaying(
              track,
              playlistContext.system
            );
          } else {
            navigateToPlaylistFromNowPlaying(
              track,
              playlistContext.playlist
            );
          }
        },
        showChevron: true,
      });
    }

    items.push(
      {
        label: goToAlbumLabel,
        action: () => navigateToAlbumFromNowPlaying(track),
        showChevron: true,
      },
      {
        label: goToArtistLabel,
        action: () => navigateToArtistFromNowPlaying(track),
        showChevron: true,
      }
    );

    return items;
  }, [
    tracks,
    currentIndex,
    t,
    isAppleMusic,
    findPlaylistContextForNowPlaying,
    registerActivity,
    setIsCoverFlowOpen,
    handleAppleMusicAddToFavorites,
    navigateToPlaylistFromNowPlaying,
    navigateToSystemPlaylistFromNowPlaying,
    navigateToAlbumFromNowPlaying,
    navigateToArtistFromNowPlaying,
    menuLocale,
  ]);

  const openNowPlayingSongMenu = useCallback(() => {
    const track = tracks[currentIndex];
    if (!track || browsableTracks.length === 0) return;
    registerActivity();
    setMenuDirection("forward");
    setMenuMode(true);
    setMenuHistory([
      {
        kind: "nowPlayingSong",
        id: "nowPlayingSong",
        title: NOW_PLAYING_SONG_MENU_KEY,
        displayTitle: track.title,
        items: nowPlayingSongMenuItems,
        selectedIndex: 0,
      },
    ]);
    setSelectedMenuItem(0);
  }, [
    tracks,
    currentIndex,
    browsableTracks.length,
    registerActivity,
    nowPlayingSongMenuItems,
  ]);

  const restoreNowPlayingSongMenu = useCallback(() => {
    clearReturnToNowPlayingSongMenu();
    const snapshot = nowPlayingSongMenuSnapshotRef.current;
    const track = tracks[currentIndex];
    const selectedIndex = snapshot?.selectedIndex ?? 0;
    setMenuDirection("backward");
    setMenuMode(true);
    setMenuHistory([
      {
        kind: "nowPlayingSong",
        id: "nowPlayingSong",
        title: NOW_PLAYING_SONG_MENU_KEY,
        displayTitle: snapshot?.displayTitle ?? track?.title ?? "",
        items: nowPlayingSongMenuItems,
        selectedIndex,
      },
    ]);
    setSelectedMenuItem(selectedIndex);
  }, [
    clearReturnToNowPlayingSongMenu,
    tracks,
    currentIndex,
    nowPlayingSongMenuItems,
  ]);

  const closeNowPlayingSongMenu = useCallback(() => {
    clearReturnToNowPlayingSongMenu();
    setMenuDirection("backward");
    setMenuMode(false);
    const saved = menuHistoryBeforeNowPlayingRef.current;
    if (saved && saved.length > 0) {
      setMenuHistory(saved);
      const last = saved[saved.length - 1];
      setSelectedMenuItem(last?.selectedIndex ?? 0);
      return;
    }
    const ipodLabel = t("apps.ipod.menuItems.ipod");
    setMenuHistory([
      {
        kind: "root",
        id: "ipod",
        title: ipodLabel,
        items: mainMenuItems,
        selectedIndex: 0,
      },
    ]);
    setSelectedMenuItem(0);
  }, [mainMenuItems, t, clearReturnToNowPlayingSongMenu]);

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
        kind: "root",
        id: "ipod",
        title: ipodLabel,
        items: mainMenuItemsRef.current,
        selectedIndex: 0,
      },
    ]);
    menuHistoryBeforeNowPlayingRef.current = null;
    clearReturnToNowPlayingSongMenu();
    setIsCoverFlowOpen(false);
    queueMicrotask(() => {
      suppressMenuSyncRef.current = false;
    });
  }, [librarySource, menuLocale, setIsCoverFlowOpen, setMenuDirection, setSelectedMenuItem, clearReturnToNowPlayingSongMenu, t]);

  // Helper function to rebuild menu items based on current tracks
  const rebuildMenuItems = useCallback((menu: typeof menuHistory[0]): typeof menuHistory[0]["items"] | null => {
    const playlistsLabel = t("apps.ipod.menuItems.playlists");
    const recentlyAddedLabel = t(
      "apps.ipod.menuItems.recentlyAdded",
      "Recently Added"
    );
    const favoriteSongsLabel = t(
      "apps.ipod.menuItems.favoriteSongs",
      "Favorite Songs"
    );
    const radioLabel = t("apps.ipod.menuItems.radio", "Radio");

    if (menu.kind) {
      switch (menu.kind) {
        case "root":
          return mainMenuItems;
        case "music":
          return musicMenuItems;
        case "settings":
          return settingsMenuItems;
        case "extras":
          return menu.items;
        case "nowPlayingSong":
          return nowPlayingSongMenuItems;
        case "recentlyAdded":
          return isAppleMusic ? appleMusicRecentlyAddedMenuItems : null;
        case "favorites":
          return isAppleMusic ? appleMusicFavoritesMenuItems : null;
        case "radio":
          return isAppleMusic ? appleMusicRadioMenuItems : null;
        case "songs":
          return allSongsMenuItems;
        case "playlists":
          return isAppleMusic ? applePlaylistsMenuItems : null;
        case "artists":
          return artistsListMenuItems;
        case "albums":
          return albumsListMenuItems;
        case "artistAllSongs": {
          if (menu.id && artistAllSongsMenuItemsByTitle[menu.title]) {
            return artistAllSongsMenuItemsByTitle[menu.title];
          }
          const fallbackTitle = menu.id ? `${menu.id} - ${t("apps.ipod.menuItems.allSongs")}` : menu.title;
          return artistAllSongsMenuItemsByTitle[fallbackTitle] ?? null;
        }
        case "artistAlbum":
          return menu.id ? artistAlbumMenuItemsByTitle[menu.id] ?? null : null;
        case "artist":
          return menu.id ? artistMenuItemsByArtist[menu.id] ?? null : null;
        case "album":
          return menu.id ? albumMenuItemsByAlbum[menu.id] ?? null : null;
        case "appleMusicPlaylist": {
          const playlistMenu = resolveAppleMusicPlaylistMenu(
            menu,
            appleMusicPlaylists
          );
          return playlistMenu
            ? applePlaylistTrackMenuItemsByPlaylist[playlistMenu.id] ??
                EMPTY_IPOD_MENU_ITEMS
            : null;
        }
      }
    }

    const playlistMenu = resolveAppleMusicPlaylistMenu(menu, appleMusicPlaylists);
    const playlistMenuUsesOpaqueTitle =
      getAppleMusicPlaylistIdFromMenuTitle(menu.title) !== null;
    if (
      playlistMenu &&
      (playlistMenuUsesOpaqueTitle ||
        (menu.title !== playlistsLabel &&
          menu.title !== recentlyAddedLabel &&
          menu.title !== favoriteSongsLabel &&
          menu.title !== radioLabel))
    ) {
      return (
        applePlaylistTrackMenuItemsByPlaylist[playlistMenu.id] ??
        EMPTY_IPOD_MENU_ITEMS
      );
    }

    if (menu.title === t("apps.ipod.menuItems.ipod")) {
      return mainMenuItems;
    } else if (menu.title === t("apps.ipod.menuItems.music")) {
      return musicMenuItems;
    } else if (menu.title === t("apps.ipod.menuItems.settings")) {
      return settingsMenuItems;
    } else if (menu.title === NOW_PLAYING_SONG_MENU_KEY) {
      return nowPlayingSongMenuItems;
    } else if (
      !isAppleMusic &&
      (menu.title === recentlyAddedLabel ||
        menu.title === favoriteSongsLabel ||
        menu.title === radioLabel ||
        menu.title === playlistsLabel)
    ) {
      return null;
    } else if (menu.title === recentlyAddedLabel) {
      return appleMusicRecentlyAddedMenuItems;
    } else if (menu.title === favoriteSongsLabel) {
      return appleMusicFavoritesMenuItems;
    } else if (menu.title === radioLabel) {
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
    } else if (menu.title === playlistsLabel) {
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
      if (playlistMenu) {
        return (
          applePlaylistTrackMenuItemsByPlaylist[playlistMenu.id] ??
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
    nowPlayingSongMenuItems,
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
      kind: "root" as const,
      id: "ipod",
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
      rememberedMenuSelectedIndexRef.current[getMenuMemoryKey(entry)] =
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
          kind: "root",
          id: "ipod",
          title: ipodLabel,
          items: mainMenuItems,
          selectedIndex: Math.max(0, Math.min(entry.selectedIndex, mainMenuItems.length - 1)),
        });
        continue;
      }
      const skeleton = {
        kind: entry.kind,
        id: entry.id,
        title: entry.title,
        items: [],
        selectedIndex: 0,
      };
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
        kind: entry.kind,
        id: entry.id,
        title: entry.title,
        displayTitle: entry.displayTitle,
        modernMediaList: entry.modernMediaList,
        alphabetic: entry.alphabetic,
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
  // the menus or moves the cursor. We only store identity/display fields
  // per level — actions and item arrays are recomputed on restore via
  // `rebuildMenuItems`. The deepest entry's `selectedIndex` mirrors the
  // live cursor (`selectedMenuItem`) so reopening lands the user on the
  // exact item they were sitting on.
  useEffect(() => {
    if (!hasInitializedMenuRef.current) return;
    if (menuHistory.length === 0) return;

    const breadcrumb = menuHistory.map((menu, i) => ({
      kind: menu.kind,
      id: menu.id,
      title: menu.title,
      displayTitle: menu.displayTitle,
      modernMediaList: menu.modernMediaList,
      alphabetic: menu.alphabetic,
      selectedIndex:
        i === menuHistory.length - 1 ? selectedMenuItem : menu.selectedIndex,
    }));
    for (const entry of breadcrumb) {
      rememberedMenuSelectedIndexRef.current[getMenuMemoryKey(entry)] =
        entry.selectedIndex;
    }

    const store = useIpodStore.getState();
    const prev = store.ipodMenuBreadcrumb;
    const isSame =
      prev != null &&
      prev.length === breadcrumb.length &&
      prev.every(
        (entry, i) =>
          entry.kind === breadcrumb[i].kind &&
          entry.id === breadcrumb[i].id &&
          entry.title === breadcrumb[i].title &&
          entry.displayTitle === breadcrumb[i].displayTitle &&
          entry.modernMediaList === breadcrumb[i].modernMediaList &&
          entry.alphabetic === breadcrumb[i].alphabetic &&
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
    const state = useIpodStore.getState();
    ipodLog.debug("Started track-switch guard", {
      librarySource: state.librarySource,
      currentSongId:
        state.librarySource === "appleMusic"
          ? state.appleMusicCurrentSongId
          : state.currentSongId,
      playbackRequested: state.playbackRequested,
      isPlaying: state.isPlaying,
    });
    startTrackSwitchGuard();
  }, [startTrackSwitchGuard]);

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
        ipodLog.debug("Skipping within Apple Music collection", {
          requestedDirection: direction,
          effectiveDirection: skipNext ? "next" : "previous",
          trackId: shellTrack.id,
          isStation,
        });
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
        ipodLog.debug("Skipped within Apple Music collection", {
          requestedDirection: direction,
          effectiveDirection: skipNext ? "next" : "previous",
          trackId: shellTrack.id,
        });
        return true;
      } catch (err) {
        ipodLog.warn("Could not skip within Apple Music collection", {
          error: err,
          requestedDirection: direction,
          effectiveDirection: skipNext ? "next" : "previous",
          trackId: shellTrack.id,
        });
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
    const shellTrack = getCurrentAppleMusicCollectionShellTrack();
    ipodLog.debug("Moving to next track", {
      librarySource: useIpodStore.getState().librarySource,
      currentTrackId: tracks[currentIndex]?.id ?? null,
      collectionShellTrackId: shellTrack?.id ?? null,
    });
    if (shellTrack) {
      void skipAppleMusicCollectionShell("next");
      return;
    }
    rawNextTrack();
  }, [
    getCurrentAppleMusicCollectionShellTrack,
    rawNextTrack,
    skipAppleMusicCollectionShell,
    tracks,
    currentIndex,
  ]);

  // Classic click-wheel iPod behavior: restart the current track when the
  // back button is pressed after the song is already well underway. Seeks the
  // active player to 0 and snaps the shared clock back to 0 so lyrics and the
  // progress bar follow. A second press (now near 0s) skips for real.
  const restartCurrentTrack = useCallback(() => {
    const activePlayer = isFullScreen
      ? fullScreenPlayerRef.current
      : playerRef.current;
    activePlayer?.seekTo(0);
    useIpodStore.getState().setElapsedTime(0);
  }, [isFullScreen, fullScreenPlayerRef, playerRef]);

  const previousTrack = useCallback(() => {
    const shellTrack = getCurrentAppleMusicCollectionShellTrack();
    if (shellTrack) {
      ipodLog.debug("Moving to previous Apple Music collection item", {
        librarySource: "appleMusic",
        currentTrackId: shellTrack.id,
        behavior: "collectionSkip",
      });
      void skipAppleMusicCollectionShell("previous");
      return;
    }
    const { elapsedTime } = useIpodStore.getState();
    const hasCurrentTrack = Boolean(tracks[currentIndex]);
    if (shouldRestartTrackOnPrevious(elapsedTime, hasCurrentTrack)) {
      ipodLog.debug("Restarting current track", {
        librarySource: useIpodStore.getState().librarySource,
        currentTrackId: tracks[currentIndex]?.id ?? null,
        elapsedTime,
        behavior: "restart",
      });
      restartCurrentTrack();
      return;
    }
    ipodLog.debug("Moving to previous track", {
      librarySource: useIpodStore.getState().librarySource,
      currentTrackId: tracks[currentIndex]?.id ?? null,
      elapsedTime,
      behavior: "previousTrack",
    });
    rawPreviousTrack();
  }, [
    getCurrentAppleMusicCollectionShellTrack,
    rawPreviousTrack,
    restartCurrentTrack,
    skipAppleMusicCollectionShell,
    tracks,
    currentIndex,
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
              toast.error(t("apps.ipod.dialogs.listenSessionJoinFailed"), {
                description:
                  result.error || t("apps.ipod.dialogs.pleaseTryAgain"),
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
          toast.error(t("apps.ipod.dialogs.failedToLoadSharedTrack"), {
            description: t("apps.ipod.dialogs.sharedTrackVideoId", { videoId }),
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
              toast.error(t("apps.ipod.dialogs.listenSessionJoinFailed"), {
                description:
                  result.error || t("apps.ipod.dialogs.pleaseTryAgain"),
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
    ipodLog.debug("Player reported track ended", {
      trackId: tracks[currentIndex]?.id ?? null,
      librarySource,
      loopCurrent,
      isFullScreen,
    });
    if (loopCurrent) {
      const activePlayer = isFullScreen ? fullScreenPlayerRef.current : playerRef.current;
      activePlayer?.seekTo(0);
      setIsPlaying(true);
    } else {
      startTrackSwitch();
      nextTrack();
    }
  }, [
    currentIndex,
    isFullScreen,
    librarySource,
    loopCurrent,
    nextTrack,
    setIsPlaying,
    startTrackSwitch,
    tracks,
  ]);

  const handleProgress = useCallback((state: { playedSeconds: number }) => {
    // Single source of truth — zustand. This hook intentionally does NOT
    // subscribe to `elapsedTime` (that would re-run all of useIpodLogic on
    // every tick); leaf components subscribe via `useIpodElapsedTime()`.
    useIpodStore.getState().setElapsedTime(state.playedSeconds);
  }, []);

  const handleDuration = useCallback((duration: number) => {
    ipodLog.debug("Player reported track duration", {
      duration,
      trackId:
        useIpodStore.getState().librarySource === "appleMusic"
          ? useIpodStore.getState().appleMusicCurrentSongId
          : useIpodStore.getState().currentSongId,
    });
    setTotalTime(duration);
    useIpodStore.getState().setTotalTime(duration);
  }, []);

  const handlePlay = useCallback(() => {
    ipodLog.debug("Player started playback", {
      trackId: tracks[currentIndex]?.id ?? null,
      librarySource,
      wasTrackSwitching: isTrackSwitchingRef.current,
      skipOperationPending: skipOperationRef.current,
    });
    confirmPlayback();
    // Don't update state if we're in the middle of a track switch
    if (isTrackSwitchingRef.current) {
      ipodLog.debug("Ignored play event during track switch");
      return;
    }
    if (!skipOperationRef.current) showStatus("▶");
    skipOperationRef.current = false;

    const currentTrack = tracks[currentIndex];
    if (currentTrack) {
      const elapsedTime = useIpodStore.getState().elapsedTime;
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
  }, [
    confirmPlayback,
    currentIndex,
    librarySource,
    showStatus,
    tracks,
  ]);

  const handlePause = useCallback(() => {
    ipodLog.debug("Player paused playback", {
      trackId: tracks[currentIndex]?.id ?? null,
      librarySource,
      wasTrackSwitching: isTrackSwitchingRef.current,
    });
    // Don't update state if we're in the middle of a track switch
    if (isTrackSwitchingRef.current) {
      ipodLog.debug("Ignored pause event during track switch");
      return;
    }
    setIsPlaying(false);
    showStatus("⏸︎");
  }, [
    currentIndex,
    librarySource,
    setIsPlaying,
    showStatus,
    tracks,
  ]);

  const handleReady = useCallback(() => {
    const state = useIpodStore.getState();
    ipodLog.debug("Player ready", {
      librarySource: state.librarySource,
      currentTrackId:
        state.librarySource === "appleMusic"
          ? state.appleMusicCurrentSongId
          : state.currentSongId,
      playbackRequested: state.playbackRequested,
    });
  }, []);

  const handlePlaybackAttemptFailed = useCallback(() => {
    const state = useIpodStore.getState();
    ipodLog.warn("Playback attempt failed", {
      librarySource: state.librarySource,
      currentTrackId:
        state.librarySource === "appleMusic"
          ? state.appleMusicCurrentSongId
          : state.currentSongId,
      playbackRequested: state.playbackRequested,
      elapsedTime: state.elapsedTime,
    });
    setIsPlaying(false);
  }, [setIsPlaying]);

  // Watchdog for blocked autoplay: if the clock hasn't advanced 1.2s after
  // entering the playing state, autoplay was likely blocked — flip back to
  // paused. Reads the clock via getState() so this effect doesn't subscribe
  // the whole hook to per-tick updates.
  useEffect(() => {
    if (!playbackRequested || !isIOSSafari || userHasInteractedRef.current) return;

    const startElapsed = useIpodStore.getState().elapsedTime;
    const timer = setTimeout(() => {
      const { playbackRequested: stillRequested, elapsedTime: nowElapsed } =
        useIpodStore.getState();
      if (stillRequested && nowElapsed === startElapsed) {
        ipodLog.warn("Autoplay watchdog detected blocked playback", {
          currentTrackId:
            useIpodStore.getState().librarySource === "appleMusic"
              ? useIpodStore.getState().appleMusicCurrentSongId
              : useIpodStore.getState().currentSongId,
          elapsedTime: nowElapsed,
          isIOSSafari,
          userHasInteracted: userHasInteractedRef.current,
        });
        setIsPlaying(false);
        showStatus("⏸");
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [playbackRequested, setIsPlaying, showStatus, isIOSSafari]);

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

    if (isNowPlayingSongMenuOpen) {
      closeNowPlayingSongMenu();
      return;
    }

    if (showVideo) toggleVideo();

    if (menuMode) {
      if (returnToNowPlayingSongMenuRef.current) {
        restoreNowPlayingSongMenu();
        return;
      }
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
          : {
              kind: "root" as const,
              id: "ipod",
              title: t("apps.ipod.menuItems.ipod"),
              items: mainMenuItems,
              selectedIndex: 0,
            };

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
        // All Songs with the current track highlighted. `allSongsMenuItems`
        // is sorted by title, so look up the current song's index in
        // that sorted order rather than reusing `browseCurrentIndex`
        // (which is an index into the unsorted browsable library).
        const allSongsLabel = t("apps.ipod.menuItems.allSongs");
        const songsLabel = t("apps.ipod.menuItems.songs");
        const songsMenuIndex = Math.max(
          0,
          musicMenuItems.findIndex(
            (item) => item.label === songsLabel || item.label === allSongsLabel
          )
        );
        const currentBrowseTrack =
          browseCurrentIndex >= 0
            ? browsableTracks[browseCurrentIndex]
            : null;
        const allSongsSelectedIndex = currentBrowseTrack
          ? Math.max(
              0,
              sortedBrowsableTracks.findIndex(
                (track) => track.id === currentBrowseTrack.id
              )
            )
          : 0;
        setMenuHistory([
          mainMenu,
          {
            kind: "music",
            id: "music",
            title: t("apps.ipod.menuItems.music"),
            items: musicMenuItems,
            selectedIndex: songsMenuIndex,
          },
          {
            kind: "songs",
            id: "all",
            title: allSongsLabel,
            items: allSongsMenuItems,
            selectedIndex: allSongsSelectedIndex,
            alphabetic: true,
          },
        ]);
        setSelectedMenuItem(allSongsSelectedIndex);
      }
      setMenuMode(true);
    }
  }, [playClickSound, vibrate, registerActivity, isCoverFlowOpen, isMusicQuizOpen, isBrickGameOpen, isNowPlayingSongMenuOpen, closeNowPlayingSongMenu, restoreNowPlayingSongMenu, showVideo, toggleVideo, menuMode, menuHistory, mainMenuItems, musicMenuItems, allSongsMenuItems, browsableTracks, sortedBrowsableTracks, browseCurrentIndex, cameFromNowPlayingMenuItem, t]);

  // Cover Flow handlers
  const handleCenterLongPress = useCallback(() => {
    playClickSound();
    vibrate();
    registerActivity();

    if (isCoverFlowOpen) {
      // Exit cover flow — backward direction so the modern UI's
      // inline Cover Flow slides out to the right and now-playing
      // slides back in from the left.
      setMenuDirection("backward");
      setIsCoverFlowOpen(false);
      return;
    }

    if (isNowPlayingSongMenuOpen) {
      return;
    }

    if (
      !menuMode &&
      !isMusicQuizOpen &&
      !isBrickGameOpen &&
      tracks[currentIndex]
    ) {
      openNowPlayingSongMenu();
    }
  }, [
    playClickSound,
    vibrate,
    registerActivity,
    isCoverFlowOpen,
    isNowPlayingSongMenuOpen,
    menuMode,
    isMusicQuizOpen,
    isBrickGameOpen,
    tracks,
    currentIndex,
    openNowPlayingSongMenu,
  ]);

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
            showStatus(
              useIpodStore.getState().playbackRequested ? "▶" : "⏸"
            );
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

  // -------------------------------------------------------------------
  // "Scroll by letter" fast-scroll affordance.
  //
  // Classic iPod behavior: when the user spins the wheel through an
  // alphabetic menu (Artists / Albums) for a sustained stretch, each
  // rotation begins jumping to the next/previous letter group instead
  // of one row at a time, and a letter chip appears on screen so the
  // user can see which section they're skimming. After a brief idle
  // period the iPod drops back to normal per-item scrolling.
  //
  // We count consecutive rotations (any rotation within
  // `FAST_SCROLL_RESET_MS` of the previous counts). Letter mode kicks
  // in after the user has scrolled at least `FAST_SCROLL_THRESHOLD`
  // items in one continuous gesture — roughly five pages of the
  // 6-row modern menu — so it never fires from a casual flick of the
  // wheel. The mode is sticky until `FAST_SCROLL_IDLE_MS` of no
  // rotation, so a brief pause between letter jumps still feels like
  // one continuous fast scroll.
  // -------------------------------------------------------------------
  const FAST_SCROLL_RESET_MS = 600;
  const FAST_SCROLL_THRESHOLD = 30; // 5 pages × 6 rows per page
  const FAST_SCROLL_IDLE_MS = 900;
  const rotationStreakCountRef = useRef(0);
  const rotationStreakLastAtRef = useRef(0);
  const fastScrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const [fastScrollLetter, setFastScrollLetter] = useState<string | null>(null);
  const fastScrollActiveRef = useRef(false);

  const getMenuItemLetter = useCallback((label: string | undefined): string => {
    if (!label) return "#";
    const trimmed = label.trim();
    if (trimmed.length === 0) return "#";
    // First-code-point upper case; non-ASCII (CJK, etc.) keeps its own glyph.
    const first = Array.from(trimmed)[0] ?? "";
    if (/[0-9]/.test(first)) return "#";
    return first.toLocaleUpperCase();
  }, []);

  const scheduleFastScrollIdle = useCallback(() => {
    if (fastScrollIdleTimerRef.current) {
      clearTimeout(fastScrollIdleTimerRef.current);
    }
    fastScrollIdleTimerRef.current = setTimeout(() => {
      fastScrollActiveRef.current = false;
      rotationStreakCountRef.current = 0;
      rotationStreakLastAtRef.current = 0;
      setFastScrollLetter(null);
      fastScrollIdleTimerRef.current = null;
    }, FAST_SCROLL_IDLE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (fastScrollIdleTimerRef.current) {
        clearTimeout(fastScrollIdleTimerRef.current);
        fastScrollIdleTimerRef.current = null;
      }
    };
  }, []);

  // If the user navigates away from the alphabetic menu (back button,
  // selection, etc.) drop the letter overlay immediately instead of
  // waiting for the idle timer.
  useEffect(() => {
    const top = menuHistory[menuHistory.length - 1];
    if (!menuMode || !top?.alphabetic) {
      if (fastScrollActiveRef.current || fastScrollLetter !== null) {
        fastScrollActiveRef.current = false;
        rotationStreakCountRef.current = 0;
        rotationStreakLastAtRef.current = 0;
        if (fastScrollIdleTimerRef.current) {
          clearTimeout(fastScrollIdleTimerRef.current);
          fastScrollIdleTimerRef.current = null;
        }
        setFastScrollLetter(null);
      }
    }
  }, [menuMode, menuHistory, fastScrollLetter]);

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

        // Track rotation streak for the letter-jump affordance. We
        // count consecutive rotations (any rotation within
        // `FAST_SCROLL_RESET_MS` of the last) and trigger letter-jump
        // mode once the user has scrolled enough rows in one
        // continuous gesture (~3 pages of the modern 6-row menu).
        const now = Date.now();
        const sinceLast = now - rotationStreakLastAtRef.current;
        if (
          rotationStreakLastAtRef.current === 0 ||
          sinceLast > FAST_SCROLL_RESET_MS
        ) {
          rotationStreakCountRef.current = 1;
        } else {
          rotationStreakCountRef.current += 1;
        }
        rotationStreakLastAtRef.current = now;
        const isAlphabetic = Boolean(currentMenu.alphabetic);
        if (
          isAlphabetic &&
          !fastScrollActiveRef.current &&
          rotationStreakCountRef.current >= FAST_SCROLL_THRESHOLD
        ) {
          fastScrollActiveRef.current = true;
        }
        const useLetterJump = isAlphabetic && fastScrollActiveRef.current;

        setSelectedMenuItem((prevIndex) => {
          const safePrev = Math.max(0, Math.min(prevIndex, menuLength - 1));
          let newIndex = safePrev;
          if (!useLetterJump) {
            if (direction === "clockwise") {
              newIndex = Math.min(menuLength - 1, safePrev + 1);
            } else {
              newIndex = Math.max(0, safePrev - 1);
            }
          } else {
            const items = currentMenu.items;
            const currentLetter = getMenuItemLetter(items[safePrev]?.label);
            if (direction === "clockwise") {
              // Jump to the first item whose letter differs from the
              // current one; if we're already on the last letter,
              // sit on the final row.
              let next = safePrev;
              for (let i = safePrev + 1; i < menuLength; i++) {
                if (getMenuItemLetter(items[i]?.label) !== currentLetter) {
                  next = i;
                  break;
                }
                next = i;
              }
              newIndex = next;
            } else {
              // Jump to the first item of the previous letter group.
              // Walk back until the letter changes (that's the last
              // row of the prior group), then keep walking until the
              // letter changes again — the row after that is the
              // first row of the prior group.
              let cursor = safePrev;
              let priorLetter: string | null = null;
              for (let i = safePrev - 1; i >= 0; i--) {
                const letter = getMenuItemLetter(items[i]?.label);
                if (priorLetter === null) {
                  if (letter !== currentLetter) {
                    priorLetter = letter;
                    cursor = i;
                  }
                } else if (letter !== priorLetter) {
                  cursor = i + 1;
                  priorLetter = null;
                  break;
                } else {
                  cursor = i;
                }
              }
              newIndex = cursor;
            }
          }
          if (useLetterJump) {
            const letter = getMenuItemLetter(currentMenu.items[newIndex]?.label);
            setFastScrollLetter(letter);
          }
          return newIndex;
        });

        if (isAlphabetic && fastScrollActiveRef.current) {
          scheduleFastScrollIdle();
        }
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
          `${direction === "clockwise" ? "⏩︎" : "⏪︎"} ${formatSecondsAsMinutesSeconds(newTime)}`
        );
      }
    },
    [playScrollSound, registerActivity, registerActivityRef, menuMode, menuHistory, isFullScreen, showStatus, isCoverFlowOpen, isMusicQuizOpen, isBrickGameOpen, getMenuItemLetter, scheduleFastScrollIdle, setSelectedMenuItem]
  );

  // Scaling (extracted to useIpodScale)
  const { containerRef, scale } = useIpodScale({ isWindowOpen, isMinimized });

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
        showStatus(
          `❌ ${t("apps.ipod.dialogs.errorAdding")} ${
            error instanceof Error
              ? error.message
              : t("apps.ipod.dialogs.unknownError")
          }`
        );
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
    return resolveMediaCoverUrl(currentTrack, { kugouSize: 800 });
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
  const effectiveChineseLyricsLanguage = useMemo(
    () =>
      resolveChineseLyricsLanguage(
        romanization.chineseLyricsLanguage,
        appLanguage
      ),
    [romanization.chineseLyricsLanguage, appLanguage]
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
    // Static value: passing the live clock here would re-render this entire
    // hook ~20x/sec. Current-line tracking is driven by the store
    // subscription effect below via `updateCurrentTimeManually`.
    currentTime: 0,
    translateTo: effectiveTranslationLanguage,
    lyricsLanguage: effectiveChineseLyricsLanguage,
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

  // Drive lyrics current-line tracking from the playback clock without
  // subscribing this (very large) hook to `elapsedTime`. The store
  // subscription runs outside React; `updateCurrentTimeManually` only
  // triggers a re-render when the current lyric line index changes.
  const updateLyricsTimeRef = useRef(
    fullScreenLyricsControls.updateCurrentTimeManually
  );
  updateLyricsTimeRef.current =
    fullScreenLyricsControls.updateCurrentTimeManually;
  const lyricsTimingOffsetMsRef = useRef(lyricsTimingOffsetMs);
  lyricsTimingOffsetMsRef.current = lyricsTimingOffsetMs;

  useEffect(() => {
    const syncLyricsTime = (elapsedSeconds: number) => {
      updateLyricsTimeRef.current(
        elapsedSeconds + lyricsTimingOffsetMsRef.current / 1000
      );
    };
    // Re-sync immediately when lyrics load or the timing offset changes
    // (deps below), then follow the clock.
    syncLyricsTime(useIpodStore.getState().elapsedTime);
    return useIpodStore.subscribe((state, prevState) => {
      if (state.elapsedTime !== prevState.elapsedTime) {
        syncLyricsTime(state.elapsedTime);
      }
    });
  }, [fullScreenLyricsControls.loadedSongId, lyricsTimingOffsetMs]);

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
        const currentTime =
          playerRef.current?.getCurrentTime() ||
          useIpodStore.getState().elapsedTime;
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
        const currentTime =
          fullScreenPlayerRef.current?.getCurrentTime() ||
          useIpodStore.getState().elapsedTime;
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
  }, [isAppleMusic, isFullScreen, isPlaying, setIsPlaying, isIOSSafari]);

  // Seek time for fullscreen (delta)
  const seekTime = useCallback(
    (delta: number) => {
      if (fullScreenPlayerRef.current) {
        const currentTime = fullScreenPlayerRef.current.getCurrentTime() || 0;
        const newTime = Math.max(0, currentTime + delta);
        fullScreenPlayerRef.current.seekTo(newTime);
        showStatus(
          `${delta > 0 ? "⏩︎" : "⏪︎"} ${formatSecondsAsMinutesSeconds(newTime)}`
        );
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
        showStatus(`▶ ${formatSecondsAsMinutesSeconds(newTime)}`);
        
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

  const { isWindowsTheme, isMacOSTheme } = useThemeFlags();

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
    playbackRequested,
    showVideo,
    backlightOn,
    theme,
    lcdFilterOn,
    displayMode,
    showLyrics,
    lyricsAlignment,
    lyricsFont,
    lyricsFontClassName,
    romanization,
    setRomanization,
    lyricsTranslationLanguage,
    lyricOffset,
    isFullScreen,
    toggleFullScreen,
    isMinimized,
    isWindowsTheme,
    isMacOSTheme,
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
    // NOTE: `elapsedTime` is intentionally NOT exposed here. Subscribing to
    // the ~20Hz playback clock from this hook would re-render the whole iPod
    // tree per tick — leaf components use `useIpodElapsedTime()` instead.
    totalTime,
    scale,
    menuMode,
    selectedMenuItem,
    menuDirection,
    menuHistory,
    appleMusicMenuTitlebarLoading,
    fastScrollLetter,
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
    handlePlaybackAttemptFailed,
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
