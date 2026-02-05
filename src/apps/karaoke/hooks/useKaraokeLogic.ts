import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import ReactPlayer from "react-player";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import {
  useIpodStore,
  Track,
  getEffectiveTranslationLanguage,
  flushPendingLyricOffsetSave,
} from "@/stores/useIpodStore";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import { useShallow } from "zustand/react/shallow";
import {
  useIpodStoreShallow,
  useAudioSettingsStoreShallow,
  useAppStoreShallow,
} from "@/stores/helpers";
import { useLyrics } from "@/hooks/useLyrics";
import { useFurigana } from "@/hooks/useFurigana";
import { useThemeStore } from "@/stores/useThemeStore";
import { LyricsAlignment, LyricsFont, getLyricsFontClassName } from "@/types/lyrics";
import { useOffline } from "@/hooks/useOffline";
import { useListenSync } from "@/hooks/useListenSync";
import { TRANSLATION_LANGUAGES, getYouTubeVideoId, formatKugouImageUrl } from "@/apps/ipod/constants";
import { useLibraryUpdateChecker } from "@/apps/ipod/hooks/useLibraryUpdateChecker";
import { saveSongMetadataFromTrack } from "@/utils/songMetadataCache";
import { useChatsStore } from "@/stores/useChatsStore";
import { useListenSessionStore } from "@/stores/useListenSessionStore";
import { useActivityState, isAnyActivityActive } from "@/hooks/useActivityState";
import { useLyricsErrorToast } from "@/hooks/useLyricsErrorToast";
import type { KaraokeInitialData } from "../../base/types";
import type { CoverFlowRef } from "@/apps/ipod/components/CoverFlow";
import type { SongSearchResult } from "@/components/dialogs/SongSearchDialog";
import { helpItems } from "..";

export interface UseKaraokeLogicOptions {
  isWindowOpen: boolean;
  isForeground: boolean | undefined;
  initialData: KaraokeInitialData | undefined;
  instanceId: string | undefined;
}

export function useKaraokeLogic({
  isWindowOpen,
  isForeground,
  initialData,
  instanceId,
}: UseKaraokeLogicOptions) {
  const { t, i18n } = useTranslation();
  const isOffline = useOffline();
  const translatedHelpItems = useTranslatedHelpItems("karaoke", helpItems);

  // Shared state from iPod store (library and display preferences only)
  const {
    tracks,
    showLyrics,
    lyricsAlignment,
    lyricsFont,
    koreanDisplay,
    japaneseFurigana,
    romanization,
    lyricsTranslationLanguage,
  } = useIpodStore(
    useShallow((s) => ({
      tracks: s.tracks,
      showLyrics: s.showLyrics,
      lyricsAlignment: s.lyricsAlignment,
      lyricsFont: s.lyricsFont,
      koreanDisplay: s.koreanDisplay,
      japaneseFurigana: s.japaneseFurigana,
      romanization: s.romanization,
      lyricsTranslationLanguage: s.lyricsTranslationLanguage,
    }))
  );

  const {
    setLyricsAlignment,
    setLyricsFont,
    setRomanization,
    setLyricsTranslationLanguage,
    toggleLyrics,
    clearLibrary,
    refreshLyrics,
    setTrackLyricsSource,
    clearTrackLyricsSource,
    setLyricOffset,
    addTrackFromVideoId,
  } = useIpodStoreShallow((s) => ({
    setLyricsAlignment: s.setLyricsAlignment,
    setLyricsFont: s.setLyricsFont,
    setRomanization: s.setRomanization,
    setLyricsTranslationLanguage: s.setLyricsTranslationLanguage,
    toggleLyrics: s.toggleLyrics,
    clearLibrary: s.clearLibrary,
    refreshLyrics: s.refreshLyrics,
    setTrackLyricsSource: s.setTrackLyricsSource,
    clearTrackLyricsSource: s.clearTrackLyricsSource,
    setLyricOffset: s.setLyricOffset,
    addTrackFromVideoId: s.addTrackFromVideoId,
  }));

  // Library update checker
  const { manualSync } = useLibraryUpdateChecker(
    isWindowOpen && (isForeground ?? false)
  );

  // App store for clearing initial data
  const { clearInstanceInitialData, bringToForeground } = useAppStoreShallow((state) => ({
    clearInstanceInitialData: state.clearInstanceInitialData,
    bringToForeground: state.bringToForeground,
  }));

  // Ref to track processed initial data
  const lastProcessedInitialDataRef = useRef<typeof initialData | null>(null);
  const lastProcessedListenSessionRef = useRef<string | null>(null);

  // Independent playback state from Karaoke store (not shared with iPod)
  const {
    currentSongId,
    isPlaying,
    loopCurrent,
    loopAll,
    isShuffled,
    isFullScreen,
    setCurrentSongId,
    togglePlay,
    setIsPlaying,
    toggleLoopCurrent,
    toggleLoopAll,
    toggleShuffle,
    nextTrack,
    previousTrack,
    toggleFullScreen,
    setFullScreen,
  } = useKaraokeStore(
    useShallow((s) => ({
      currentSongId: s.currentSongId,
      isPlaying: s.isPlaying,
      loopCurrent: s.loopCurrent,
      loopAll: s.loopAll,
      isShuffled: s.isShuffled,
      isFullScreen: s.isFullScreen,
      setCurrentSongId: s.setCurrentSongId,
      togglePlay: s.togglePlay,
      setIsPlaying: s.setIsPlaying,
      toggleLoopCurrent: s.toggleLoopCurrent,
      toggleLoopAll: s.toggleLoopAll,
      toggleShuffle: s.toggleShuffle,
      nextTrack: s.nextTrack,
      previousTrack: s.previousTrack,
      toggleFullScreen: s.toggleFullScreen,
      setFullScreen: s.setFullScreen,
    }))
  );

  // Auth for protected operations (force refresh, change lyrics source)
  const { username, authToken } = useChatsStore(
    useShallow((s) => ({ username: s.username, authToken: s.authToken }))
  );
  const auth = useMemo(
    () => (username && authToken ? { username, authToken } : undefined),
    [username, authToken]
  );

  const {
    currentSession: listenSession,
    isHost: isListenSessionHost,
    isDj: isListenSessionDj,
    isAnonymous: isListenSessionAnonymous,
    listenerCount: listenListenerCount,
    createSession: createListenSession,
    joinSession: joinListenSession,
    leaveSession: leaveListenSession,
    syncSession: syncListenSession,
    sendReaction: sendListenReaction,
  } = useListenSessionStore(
    useShallow((state) => ({
      currentSession: state.currentSession,
      isHost: state.isHost,
      isDj: state.isDj,
      isAnonymous: state.isAnonymous,
      listenerCount: state.listenerCount,
      createSession: state.createSession,
      joinSession: state.joinSession,
      leaveSession: state.leaveSession,
      syncSession: state.syncSession,
      sendReaction: state.sendReaction,
    }))
  );

  // Compute currentIndex from currentSongId
  const currentIndex = useMemo(() => {
    if (!currentSongId) return tracks.length > 0 ? 0 : -1;
    const index = tracks.findIndex((t) => t.id === currentSongId);
    return index >= 0 ? index : (tracks.length > 0 ? 0 : -1);
  }, [tracks, currentSongId]);

  // Dialog state
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const [isPronunciationMenuOpen, setIsPronunciationMenuOpen] = useState(false);
  const anyMenuOpen = isLangMenuOpen || isPronunciationMenuOpen;
  
  // New dialogs for iPod menu features
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isLyricsSearchDialogOpen, setIsLyricsSearchDialogOpen] = useState(false);
  const [isSongSearchDialogOpen, setIsSongSearchDialogOpen] = useState(false);
  const [isSyncModeOpen, setIsSyncModeOpen] = useState(false);
  const [isAddingSong, setIsAddingSong] = useState(false);
  const [isListenInviteOpen, setIsListenInviteOpen] = useState(false);
  const [isJoinListenDialogOpen, setIsJoinListenDialogOpen] = useState(false);
  
  // CoverFlow state
  const [isCoverFlowOpen, setIsCoverFlowOpen] = useState(false);
  const coverFlowRef = useRef<CoverFlowRef>(null);
  
  // Long press refs for CoverFlow toggle
  const screenLongPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const screenLongPressFiredRef = useRef(false);
  const longPressStartPos = useRef<{ x: number; y: number } | null>(null);
  const LONG_PRESS_MOVE_THRESHOLD = 10; // pixels - cancel if moved more than this

  // Full screen additional state
  const fullScreenPlayerRef = useRef<ReactPlayer | null>(null);

  // Playback state
  const [elapsedTime, setElapsedTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const playerRef = useRef<ReactPlayer | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimeoutRef = useRef<number | null>(null);

  // Track switching state to prevent race conditions
  const isTrackSwitchingRef = useRef(false);
  const trackSwitchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Volume from audio settings store
  const { ipodVolume } = useAudioSettingsStoreShallow((state) => ({ ipodVolume: state.ipodVolume }));

  // iOS/Safari detection for autoplay restrictions
  const ua = navigator.userAgent;
  const isIOS = /iP(hone|od|ad)/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);
  const isIOSSafari = isIOS && isSafari;

  // Track user interaction for autoplay guard (iOS Safari blocks autoplay until user interacts)
  const userHasInteractedRef = useRef(false);

  // Current track
  const currentTrack: Track | null = tracks[currentIndex] || null;
  const currentTrackMeta = useMemo(
    () =>
      currentTrack
        ? {
            title: currentTrack.title,
            artist: currentTrack.artist,
            cover: currentTrack.cover,
          }
        : null,
    [currentTrack]
  );

  const getActivePlayer = useCallback(
    () => (isFullScreen ? fullScreenPlayerRef.current : playerRef.current),
    [isFullScreen]
  );

  useListenSync({
    currentTrackId: currentTrack?.id ?? null,
    currentTrackMeta,
    isPlaying,
    setIsPlaying,
    setCurrentTrackId: setCurrentSongId,
    getActivePlayer,
    addTrackFromId: addTrackFromVideoId,
  });
  const lyricsSourceOverride = currentTrack?.lyricsSource;

  // Cover URL for paused state overlay
  const coverUrl = useMemo(() => {
    if (!currentTrack) return null;
    const videoId = getYouTubeVideoId(currentTrack.url);
    const youtubeThumbnail = videoId
      ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      : null;
    return formatKugouImageUrl(currentTrack.cover, 800) ?? youtubeThumbnail;
  }, [currentTrack]);

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

  // Resolve "auto" translation language to actual ryOS locale
  const effectiveTranslationLanguage = useMemo(
    () => getEffectiveTranslationLanguage(lyricsTranslationLanguage),
    [lyricsTranslationLanguage, i18n.language]
  );

  const lyricsControls = useLyrics({
    songId: currentTrack?.id ?? "",
    title: currentTrack?.title ?? "",
    artist: currentTrack?.artist ?? "",
    currentTime: elapsedTime + (currentTrack?.lyricOffset ?? 0) / 1000,
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
    error: lyricsControls.error,
    songId: currentTrack?.id,
    onSearchClick: () => setIsLyricsSearchDialogOpen(true),
    t,
    appId: "karaoke",
  });

  // Fetch furigana for lyrics (shared between main and fullscreen displays)
  // Use pre-fetched info from lyrics request to skip extra API call
  const { 
    furiganaMap, 
    soramimiMap,
    isFetchingFurigana: isFetchingFuriganaFromHook,
    isFetchingSoramimi,
    furiganaProgress,
    soramimiProgress,
  } = useFurigana({
    songId: currentTrack?.id ?? "",
    lines: lyricsControls.originalLines,
    isShowingOriginal: true,
    romanization,
    prefetchedInfo: lyricsControls.furiganaInfo,
    prefetchedSoramimiInfo: lyricsControls.soramimiInfo,
    auth,
  });

  // Consolidated activity state for loading indicators
  const activityState = useActivityState({
    lyricsState: {
      isLoading: lyricsControls.isLoading,
      isTranslating: lyricsControls.isTranslating,
      translationProgress: lyricsControls.translationProgress,
    },
    furiganaState: {
      isFetchingFurigana: isFetchingFuriganaFromHook,
      furiganaProgress,
      isFetchingSoramimi,
      soramimiProgress,
    },
    translationLanguage: effectiveTranslationLanguage,
    isAddingSong,
  });
  
  const hasActiveActivity = isAnyActivityActive(activityState);

  // Translation languages with translated labels
  const translationLanguages = useMemo(
    () =>
      TRANSLATION_LANGUAGES.map((lang) => ({
        label: lang.labelKey ? t(lang.labelKey) : lang.label || "",
        code: lang.code,
        separator: lang.separator,
      })),
    [t]
  );

  // Get CSS class name for current lyrics font
  const lyricsFontClassName = getLyricsFontClassName(lyricsFont);

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
    showStatus("🚫 Offline");
  }, [showStatus]);

  // Auto-hide controls
  const restartAutoHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    // Don't auto-hide when sync mode is open
    if (isPlaying && !anyMenuOpen && !isSyncModeOpen) {
      hideControlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying, anyMenuOpen, isSyncModeOpen]);

  // Register activity (for full screen portal)
  const registerActivity = useCallback(() => {
    restartAutoHideTimer();
    userHasInteractedRef.current = true;
  }, [restartAutoHideTimer]);

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

  // Wrapped handlers for fullscreen controls (with offline check)
  const handlePrevious = useCallback(() => {
    if (isOffline) {
      showOfflineStatus();
    } else {
      startTrackSwitch();
      previousTrack();
      showStatus("⏮");
    }
  }, [isOffline, showOfflineStatus, previousTrack, showStatus, startTrackSwitch]);

  const handlePlayPause = useCallback(() => {
    // Mark user interaction for autoplay guard
    userHasInteractedRef.current = true;
    if (isOffline) {
      showOfflineStatus();
    } else {
      togglePlay();
      showStatus(isPlaying ? "⏸" : "▶");
    }
  }, [isOffline, showOfflineStatus, togglePlay, showStatus, isPlaying]);

  const handleNext = useCallback(() => {
    if (isOffline) {
      showOfflineStatus();
    } else {
      startTrackSwitch();
      nextTrack();
      showStatus("⏭");
    }
  }, [isOffline, showOfflineStatus, nextTrack, showStatus, startTrackSwitch]);

  useEffect(() => {
    // Always show controls when not playing, menu is open, or sync mode is open
    if (!isPlaying || anyMenuOpen || isSyncModeOpen) {
      setShowControls(true);
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
    } else {
      restartAutoHideTimer();
    }
    return () => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
    };
  }, [isPlaying, anyMenuOpen, isSyncModeOpen, restartAutoHideTimer]);

  // Reset elapsed time on track change and set track switching guard
  // This catches track changes from any source (AI tools, shared URLs, menu selections, etc.)
  // Using null as initial value ensures first render triggers the auto-skip check
  const prevCurrentIndexRef = useRef<number | null>(null);
  useEffect(() => {
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
      // and the seek target is reasonable (at least 1 second)
      const seekTarget = -newLyricOffset / 1000;
      
      if (newLyricOffset < 0 && seekTarget >= 1) {
        setElapsedTime(seekTarget);
        
        trackSwitchTimeoutRef.current = setTimeout(() => {
          isTrackSwitchingRef.current = false;
          const activePlayer = isFullScreen ? fullScreenPlayerRef.current : playerRef.current;
          if (activePlayer) {
            activePlayer.seekTo(seekTarget);
            showStatus(`▶ ${Math.floor(seekTarget / 60)}:${String(Math.floor(seekTarget % 60)).padStart(2, "0")}`);
          }
        }, 2000);
      } else {
        // Start from beginning for positive/zero offset or small negative offset
        setElapsedTime(0);
        trackSwitchTimeoutRef.current = setTimeout(() => {
          isTrackSwitchingRef.current = false;
        }, 2000);
      }
    }
    prevCurrentIndexRef.current = currentIndex;
  }, [currentIndex, tracks, isFullScreen, showStatus]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
      if (trackSwitchTimeoutRef.current) {
        clearTimeout(trackSwitchTimeoutRef.current);
      }
    };
  }, []);

  // Exit fullscreen when browser exits fullscreen mode
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isFullScreen) {
        setFullScreen(false);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [isFullScreen, setFullScreen]);

  // Listen for App Menu fullscreen toggle
  useEffect(() => {
    const handleAppMenuFullScreen = (e: CustomEvent<{ appId: string; instanceId: string }>) => {
      if (e.detail.instanceId === instanceId) {
        toggleFullScreen();
      }
    };

    window.addEventListener("toggleAppFullScreen", handleAppMenuFullScreen as EventListener);
    return () => window.removeEventListener("toggleAppFullScreen", handleAppMenuFullScreen as EventListener);
  }, [instanceId, toggleFullScreen]);

  // Sync playback position between main and fullscreen player
  const prevFullScreenRef = useRef(isFullScreen);

  useEffect(() => {
    if (isFullScreen !== prevFullScreenRef.current) {
      // Mark as track switching to prevent spurious play/pause events during sync
      isTrackSwitchingRef.current = true;
      if (trackSwitchTimeoutRef.current) {
        clearTimeout(trackSwitchTimeoutRef.current);
      }
      
      if (isFullScreen) {
        // Entering fullscreen - sync position from main player to fullscreen player
        const currentTime = playerRef.current?.getCurrentTime() || elapsedTime;
        const wasPlaying = isPlaying;

        // Wait for fullscreen player to be ready before seeking
        const checkAndSync = () => {
          const internalPlayer = fullScreenPlayerRef.current?.getInternalPlayer?.();
          if (internalPlayer && typeof internalPlayer.getPlayerState === "function") {
            const playerState = internalPlayer.getPlayerState();
            // -1 = unstarted, 3 = buffering, 5 = cued are "not ready" states
            if (playerState !== -1) {
              fullScreenPlayerRef.current?.seekTo(currentTime);
              if (wasPlaying && typeof internalPlayer.playVideo === "function") {
                internalPlayer.playVideo();
              }
              // End track switch after sync complete
              trackSwitchTimeoutRef.current = setTimeout(() => {
                isTrackSwitchingRef.current = false;
              }, 500);
              return;
            }
          }
          // Player not ready, retry
          setTimeout(checkAndSync, 100);
        };
        setTimeout(checkAndSync, 100);
      } else {
        // Exiting fullscreen - sync position from fullscreen player to main player
        const currentTime = fullScreenPlayerRef.current?.getCurrentTime() || elapsedTime;
        const wasPlaying = isPlaying;

        setTimeout(() => {
          if (playerRef.current) {
            playerRef.current.seekTo(currentTime);
            if (wasPlaying) {
              setIsPlaying(true);
            }
          }
          // End track switch after sync complete
          trackSwitchTimeoutRef.current = setTimeout(() => {
            isTrackSwitchingRef.current = false;
          }, 500);
        }, 200);
      }
      prevFullScreenRef.current = isFullScreen;
    }
  }, [isFullScreen, elapsedTime, isPlaying, setIsPlaying]);

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
      nextTrack();
    }
  }, [loopCurrent, nextTrack, isFullScreen]);

  const handleProgress = useCallback((state: { playedSeconds: number }) => {
    setElapsedTime(state.playedSeconds);
  }, []);

  const handlePlay = useCallback(() => {
    // Don't update state if we're in the middle of a track switch
    if (isTrackSwitchingRef.current) {
      return;
    }
    setIsPlaying(true);
  }, []);

  const handlePause = useCallback(() => {
    // Don't update state if we're in the middle of a track switch
    if (isTrackSwitchingRef.current) {
      return;
    }
    setIsPlaying(false);
  }, []);

  // Main player pause handler - ignore pause when switching to fullscreen or switching tracks
  const handleMainPlayerPause = useCallback(() => {
    // Don't set isPlaying to false if we're in fullscreen mode or switching tracks
    // (the pause was triggered by switching players, not user action)
    if (!isFullScreen && !isTrackSwitchingRef.current) {
      setIsPlaying(false);
    }
  }, [isFullScreen]);

  // Handle player ready
  const handleReady = useCallback(() => {}, []);

  // Watchdog for blocked autoplay on iOS Safari
  // If isPlaying is true but elapsed time hasn't changed, the player needs user interaction
  useEffect(() => {
    if (!isPlaying || !isIOSSafari || userHasInteractedRef.current) return;

    const startElapsed = elapsedTime;
    const timer = setTimeout(() => {
      if (useKaraokeStore.getState().isPlaying && elapsedTime === startElapsed) {
        setIsPlaying(false);
        showStatus("⏸");
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [isPlaying, elapsedTime, setIsPlaying, showStatus, isIOSSafari]);

  // Seek time (delta)
  const seekTime = useCallback(
    (delta: number) => {
      const activePlayer = isFullScreen ? fullScreenPlayerRef.current : playerRef.current;
      if (activePlayer) {
        const currentTime = activePlayer.getCurrentTime() || 0;
        const newTime = Math.max(0, currentTime + delta);
        activePlayer.seekTo(newTime);
        showStatus(
          `${delta > 0 ? "⏩︎" : "⏪︎"} ${Math.floor(newTime / 60)}:${String(Math.floor(newTime % 60)).padStart(2, "0")}`
        );
      }
    },
    [showStatus, isFullScreen]
  );

  // Seek to absolute time (in ms) and start playing
  // timeMs is in "lyrics time" (player time + offset), so we subtract the offset to get player time
  const seekToTime = useCallback(
    (timeMs: number) => {
      const activePlayer = isFullScreen ? fullScreenPlayerRef.current : playerRef.current;
      if (activePlayer) {
        // Set guard to prevent spurious onPause events during seek from killing playback
        isTrackSwitchingRef.current = true;
        if (trackSwitchTimeoutRef.current) {
          clearTimeout(trackSwitchTimeoutRef.current);
        }
        
        // Subtract lyricOffset to convert from lyrics time to player time
        const lyricOffset = currentTrack?.lyricOffset ?? 0;
        const playerTimeMs = timeMs - lyricOffset;
        const newTime = Math.max(0, playerTimeMs / 1000);
        activePlayer.seekTo(newTime);
        
        // Start playing if paused - also call playVideo() directly for iOS Safari
        if (!isPlaying) {
          setIsPlaying(true);
          // Directly call playVideo on the internal player to ensure it plays
          const internalPlayer = activePlayer?.getInternalPlayer?.();
          if (internalPlayer && typeof internalPlayer.playVideo === "function") {
            internalPlayer.playVideo();
          }
        }
        showStatus(
          `▶ ${Math.floor(newTime / 60)}:${String(Math.floor(newTime % 60)).padStart(2, "0")}`
        );
        
        // Clear guard after a short delay to allow seek + play to complete
        trackSwitchTimeoutRef.current = setTimeout(() => {
          isTrackSwitchingRef.current = false;
        }, 500);
      }
    },
    [showStatus, isFullScreen, isPlaying, currentTrack?.lyricOffset]
  );

  // Alignment cycle
  const cycleAlignment = useCallback(() => {
    const curr = lyricsAlignment;
    let next: LyricsAlignment;
    if (curr === LyricsAlignment.FocusThree) next = LyricsAlignment.Center;
    else if (curr === LyricsAlignment.Center) next = LyricsAlignment.Alternating;
    else next = LyricsAlignment.FocusThree;
    setLyricsAlignment(next);
    showStatus(
      next === LyricsAlignment.FocusThree
        ? t("apps.ipod.status.layoutFocus")
        : next === LyricsAlignment.Center
        ? t("apps.ipod.status.layoutCenter")
        : t("apps.ipod.status.layoutAlternating")
    );
  }, [lyricsAlignment, setLyricsAlignment, showStatus, t]);

  // Font style cycle
  const cycleLyricsFont = useCallback(() => {
    const curr = lyricsFont;
    let next: LyricsFont;
    // Cycle: Rounded → Serif → SansSerif → SerifRed → GoldGlow → NeonPink → Rounded
    switch (curr) {
      case LyricsFont.Rounded: next = LyricsFont.Serif; break;
      case LyricsFont.Serif: next = LyricsFont.SansSerif; break;
      case LyricsFont.SansSerif: next = LyricsFont.SerifRed; break;
      case LyricsFont.SerifRed: next = LyricsFont.GoldGlow; break;
      case LyricsFont.GoldGlow: next = LyricsFont.NeonPink; break;
      default: next = LyricsFont.Rounded;
    }
    setLyricsFont(next);
    
    const statusMessages: Record<LyricsFont, string> = {
      [LyricsFont.Rounded]: t("apps.ipod.status.fontRounded"),
      [LyricsFont.Serif]: t("apps.ipod.status.fontSerif"),
      [LyricsFont.SansSerif]: t("apps.ipod.status.fontSansSerif"),
      [LyricsFont.SerifRed]: t("apps.ipod.status.fontSerifRed"),
      [LyricsFont.GoldGlow]: t("apps.ipod.status.fontGoldGlow"),
      [LyricsFont.NeonPink]: t("apps.ipod.status.fontNeonPink"),
    };
    showStatus(statusMessages[next]);
  }, [lyricsFont, setLyricsFont, showStatus, t]);

  // Track handling for add dialog
  const handleAddTrack = useCallback(
    async (url: string, autoplay = true) => {
      setIsAddingSong(true);
      try {
        const addedTrack = await useIpodStore.getState().addTrackFromVideoId(url);
        if (addedTrack) {
          showStatus(t("apps.ipod.status.added"));
          // New tracks are added at the beginning, set current to the new track
          startTrackSwitch();
          setCurrentSongId(addedTrack.id);
          if (autoplay) setIsPlaying(true);
        } else {
          throw new Error("Failed to add track");
        }
      } finally {
        setIsAddingSong(false);
      }
    },
    [showStatus, t, setCurrentSongId, setIsPlaying, startTrackSwitch]
  );

  // Process video ID from shared link (add if not in library, then play)
  const processVideoId = useCallback(
    async (videoId: string) => {
      const currentTracks = useIpodStore.getState().tracks;
      const existingTrack = currentTracks.find((track) => track.id === videoId);
      // Don't autoplay on iOS/Safari due to autoplay restrictions
      const shouldAutoplay = !(isIOS || isSafari);

      if (existingTrack) {
        toast.info(t("apps.ipod.dialogs.openedSharedTrack"));
        startTrackSwitch();
        setCurrentSongId(videoId);
        if (shouldAutoplay) setIsPlaying(true);
      } else {
        toast.info(t("apps.ipod.dialogs.addingNewTrack"));
        await handleAddTrack(`https://www.youtube.com/watch?v=${videoId}`, shouldAutoplay);
        if (isOffline) {
          showOfflineStatus();
        }
      }
    },
    [setCurrentSongId, setIsPlaying, handleAddTrack, isOffline, showOfflineStatus, t, isIOS, isSafari, startTrackSwitch]
  );

  // Share song handler
  const handleShareSong = useCallback(() => {
    if (tracks.length > 0 && currentIndex >= 0) {
      const track = tracks[currentIndex];
      // Save song metadata to cache when sharing (requires auth)
      // Pass isShare: true to update createdBy (if allowed)
      if (track) {
        const { username, authToken } = useChatsStore.getState();
        const auth = username && authToken ? { username, authToken } : null;
        saveSongMetadataFromTrack(track, auth, { isShare: true }).catch((error) => {
          console.error("[Karaoke] Error saving song metadata to cache:", error);
        });
      }
      setIsShareDialogOpen(true);
    }
  }, [tracks, currentIndex]);

  const handleStartListenSession = useCallback(async () => {
    if (!username) {
      toast.error("Login required", {
        description: "Set a username in Chats to start a session.",
      });
      return;
    }
    const result = await createListenSession(username);
    if (!result.ok) {
      toast.error("Failed to start session", {
        description: result.error || "Please try again.",
      });
      return;
    }
    setIsListenInviteOpen(true);
  }, [createListenSession, username]);

  const handleJoinListenSession = useCallback(
    async (sessionId: string) => {
      // Allow anonymous users to join (username will be undefined)
      const result = await joinListenSession(sessionId, username || undefined);
      if (!result.ok) {
        toast.error("Failed to join session", {
          description: result.error || "Please try again.",
        });
        return;
      }
    },
    [joinListenSession, username]
  );

  const handleLeaveListenSession = useCallback(async () => {
    const result = await leaveListenSession();
    if (!result.ok) {
      toast.error("Failed to leave session", {
        description: result.error || "Please try again.",
      });
      return;
    }
    setIsListenInviteOpen(false);
  }, [leaveListenSession]);

  const handlePassDj = useCallback(
    async (nextDj: string) => {
      const activePlayer = getActivePlayer();
      const positionMs = Math.max(0, (activePlayer?.getCurrentTime() ?? 0) * 1000);
      const result = await syncListenSession({
        currentTrackId: currentTrack?.id ?? null,
        currentTrackMeta,
        isPlaying,
        positionMs,
        djUsername: nextDj,
      });
      if (!result.ok) {
        toast.error("Failed to pass DJ", {
          description: result.error || "Please try again.",
        });
      } else {
        toast.success("DJ passed", {
          description: `@${nextDj} is now the DJ.`,
        });
      }
    },
    [currentTrack, currentTrackMeta, getActivePlayer, isPlaying, syncListenSession]
  );

  const handleSendReaction = useCallback(
    async (emoji: string) => {
      const result = await sendListenReaction(emoji);
      if (!result.ok) {
        toast.error("Failed to send reaction", {
          description: result.error || "Please try again.",
        });
      }
    },
    [sendListenReaction]
  );

  // Generate share URL for song
  const karaokeGenerateShareUrl = useCallback(
    (videoId: string): string => `${window.location.origin}/karaoke/${videoId}`,
    []
  );

  // Lyrics search handlers
  const handleRefreshLyrics = useCallback(() => {
    if (tracks.length > 0 && currentIndex >= 0) setIsLyricsSearchDialogOpen(true);
  }, [tracks, currentIndex]);

  const handleLyricsSearchSelect = useCallback(
    (result: { hash: string; albumId: string | number; title: string; artist: string; album?: string }) => {
      const track = tracks[currentIndex];
      if (track) {
        setTrackLyricsSource(track.id, result);
        refreshLyrics();
      }
    },
    [tracks, currentIndex, setTrackLyricsSource, refreshLyrics]
  );

  const handleLyricsSearchReset = useCallback(() => {
    const track = tracks[currentIndex];
    if (track) {
      clearTrackLyricsSource(track.id);
      refreshLyrics();
    }
  }, [tracks, currentIndex, clearTrackLyricsSource, refreshLyrics]);

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

  // Play track handler for Library menu
  const handlePlayTrack = useCallback((index: number) => {
    const trackId = tracks[index]?.id;
    if (trackId) {
      startTrackSwitch();
      setCurrentSongId(trackId);
      setIsPlaying(true);
    }
  }, [tracks, startTrackSwitch, setCurrentSongId, setIsPlaying]);

  // CoverFlow toggle handler (for long press and menu)
  const handleToggleCoverFlow = useCallback(() => {
    if (isCoverFlowOpen) {
      setIsCoverFlowOpen(false);
    } else if (tracks.length > 0) {
      setIsCoverFlowOpen(true);
    }
  }, [isCoverFlowOpen, tracks.length]);

  // CoverFlow track selection handler
  const handleCoverFlowSelectTrack = useCallback((index: number) => {
    const trackId = tracks[index]?.id;
    if (trackId) {
      startTrackSwitch();
      setCurrentSongId(trackId);
      setIsPlaying(true);
      setIsCoverFlowOpen(false);
    }
  }, [tracks, startTrackSwitch, setCurrentSongId, setIsPlaying]);

  // Play a track without exiting CoverFlow
  const handleCoverFlowPlayInPlace = useCallback((index: number) => {
    const trackId = tracks[index]?.id;
    if (trackId) {
      startTrackSwitch();
      setCurrentSongId(trackId);
      setIsPlaying(true);
      // Don't close CoverFlow - stay in place
    }
  }, [tracks, startTrackSwitch, setCurrentSongId, setIsPlaying]);

  // CoverFlow rotation feedback
  const handleCoverFlowRotation = useCallback(() => {
    // Optional: play click sound or vibrate here if desired
  }, []);

  // Keyboard controls
  useEffect(() => {
    if (!isForeground) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === " ") {
        e.preventDefault();
        // Mark user interaction for autoplay guard
        userHasInteractedRef.current = true;
        if (isOffline) {
          showOfflineStatus();
        } else {
          togglePlay();
          showStatus(isPlaying ? "⏸" : "▶");
        }
      } else if (e.key === "ArrowLeft") {
        seekTime(-5);
      } else if (e.key === "ArrowRight") {
        seekTime(5);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        previousTrack();
        showStatus("⏮");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        nextTrack();
        showStatus("⏭");
      } else if (e.key === "[" || e.key === "]") {
        // Offset adjustment: [ = lyrics earlier (negative), ] = lyrics later (positive)
        const delta = e.key === "[" ? -50 : 50;
        useIpodStore.getState().adjustLyricOffset(currentIndex, delta);
        const newOffset = (currentTrack?.lyricOffset ?? 0) + delta;
        const sign = newOffset > 0 ? "+" : newOffset < 0 ? "" : "";
        showStatus(`${t("apps.ipod.status.offset")} ${sign}${(newOffset / 1000).toFixed(2)}s`);
        lyricsControls.updateCurrentTimeManually(elapsedTime + newOffset / 1000);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isForeground, isPlaying, isOffline, togglePlay, nextTrack, previousTrack, seekTime, showStatus, showOfflineStatus, currentIndex, currentTrack, elapsedTime, lyricsControls, t]);

  // Handle initial data (shared track) - process video ID to add/play
  useEffect(() => {
    if (isWindowOpen && initialData?.videoId && typeof initialData.videoId === "string") {
      if (lastProcessedInitialDataRef.current === initialData) return;

      const videoIdToProcess = initialData.videoId;
      setTimeout(() => {
        processVideoId(videoIdToProcess)
          .then(() => {
            if (instanceId) clearInstanceInitialData(instanceId);
          })
          .catch((error) => {
            console.error(`[Karaoke] Error processing initial videoId ${videoIdToProcess}:`, error);
          });
      }, 100);
      lastProcessedInitialDataRef.current = initialData;
    } else if (isWindowOpen && tracks.length > 0 && currentSongId && !tracks.some((t) => t.id === currentSongId)) {
      // Reset to first track if current song no longer exists in library
      setCurrentSongId(tracks[0]?.id ?? null);
    }
  }, [isWindowOpen, initialData, processVideoId, clearInstanceInitialData, instanceId, tracks, currentSongId, setCurrentSongId]);

  useEffect(() => {
    if (
      isWindowOpen &&
      initialData?.listenSessionId &&
      typeof initialData.listenSessionId === "string"
    ) {
      if (lastProcessedListenSessionRef.current === initialData.listenSessionId) return;

      const sessionIdToProcess = initialData.listenSessionId;
      setTimeout(() => {
        joinListenSession(sessionIdToProcess, username || undefined)
          .then((result) => {
            if (!result.ok) {
              toast.error("Failed to join session", {
                description: result.error || "Please try again.",
              });
            }
            if (instanceId) clearInstanceInitialData(instanceId);
          })
          .catch((error) => {
            console.error(`[Karaoke] Error joining listen session ${sessionIdToProcess}:`, error);
          });
      }, 100);
      lastProcessedListenSessionRef.current = initialData.listenSessionId;
    }
  }, [isWindowOpen, initialData, joinListenSession, username, clearInstanceInitialData, instanceId]);

  // Handle updateApp event for when app is already open and receives new video
  useEffect(() => {
    const handleUpdateApp = (
      event: CustomEvent<{
        appId: string;
        initialData?: { videoId?: string; listenSessionId?: string };
      }>
    ) => {
      if (event.detail.appId === "karaoke" && event.detail.initialData?.videoId) {
        if (lastProcessedInitialDataRef.current === event.detail.initialData) return;

        const videoId = event.detail.initialData.videoId;
        bringToForeground("karaoke");
        processVideoId(videoId).catch((error) => {
          console.error(`[Karaoke] Error processing videoId ${videoId}:`, error);
          toast.error("Failed to load shared track", { description: `Video ID: ${videoId}` });
        });
        lastProcessedInitialDataRef.current = event.detail.initialData;
      }

      if (event.detail.appId === "karaoke" && event.detail.initialData?.listenSessionId) {
        const sessionId = event.detail.initialData.listenSessionId;
        if (lastProcessedListenSessionRef.current === sessionId) return;
        bringToForeground("karaoke");
        joinListenSession(sessionId, username || undefined)
          .then((result) => {
            if (!result.ok) {
              toast.error("Failed to join session", {
                description: result.error || "Please try again.",
              });
            }
          })
          .catch((error) => {
            console.error(`[Karaoke] Error joining listen session ${sessionId}:`, error);
          });
        lastProcessedListenSessionRef.current = sessionId;
      }
    };

    window.addEventListener("updateApp", handleUpdateApp as EventListener);
    return () => window.removeEventListener("updateApp", handleUpdateApp as EventListener);
  }, [processVideoId, bringToForeground, joinListenSession, username]);

  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const getCurrentKaraokeTrack = useCallback(() => {
    return useKaraokeStore.getState().getCurrentTrack();
  }, []);

  return {
    t,
    translatedHelpItems,
    tracks,
    currentSongId,
    currentIndex,
    loopCurrent,
    loopAll,
    isShuffled,
    isPlaying,
    isFullScreen,
    showLyrics,
    lyricsAlignment,
    lyricsFont,
    lyricsFontClassName,
    koreanDisplay,
    japaneseFurigana,
    romanization,
    lyricsTranslationLanguage,
    setLyricsAlignment,
    setLyricsFont,
    setRomanization,
    setLyricsTranslationLanguage,
    toggleLyrics,
    setCurrentSongId,
    togglePlay,
    setIsPlaying,
    toggleLoopCurrent,
    toggleLoopAll,
    toggleShuffle,
    nextTrack,
    previousTrack,
    toggleFullScreen,
    isOffline,
    manualSync,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isLangMenuOpen,
    setIsLangMenuOpen,
    isPronunciationMenuOpen,
    setIsPronunciationMenuOpen,
    anyMenuOpen,
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
    isListenInviteOpen,
    setIsListenInviteOpen,
    isJoinListenDialogOpen,
    setIsJoinListenDialogOpen,
    isAddingSong,
    isCoverFlowOpen,
    setIsCoverFlowOpen,
    coverFlowRef,
    screenLongPressTimerRef,
    screenLongPressFiredRef,
    longPressStartPos,
    LONG_PRESS_MOVE_THRESHOLD,
    fullScreenPlayerRef,
    playerRef,
    elapsedTime,
    duration,
    setDuration,
    statusMessage,
    showControls,
    ipodVolume,
    userHasInteractedRef,
    currentTrack,
    lyricsSourceOverride,
    coverUrl,
    lyricsControls,
    furiganaMap,
    soramimiMap,
    activityState,
    hasActiveActivity,
    translationLanguages,
    showStatus,
    showOfflineStatus,
    restartAutoHideTimer,
    registerActivity,
    startTrackSwitch,
    handlePrevious,
    handlePlayPause,
    handleNext,
    closeSyncMode,
    handleTrackEnd,
    handleProgress,
    handlePlay,
    handlePause,
    handleMainPlayerPause,
    handleReady,
    seekTime,
    seekToTime,
    cycleAlignment,
    cycleLyricsFont,
    handleAddTrack,
    processVideoId,
    listenSession,
    listenListenerCount,
    isListenSessionHost,
    isListenSessionDj,
    isListenSessionAnonymous,
    handleStartListenSession,
    handleJoinListenSession,
    handleLeaveListenSession,
    handlePassDj,
    handleSendReaction,
    handleShareSong,
    karaokeGenerateShareUrl,
    handleRefreshLyrics,
    handleLyricsSearchSelect,
    handleLyricsSearchReset,
    handleAddSong,
    handleSongSearchSelect,
    handleAddUrl,
    handlePlayTrack,
    handleToggleCoverFlow,
    handleCoverFlowSelectTrack,
    handleCoverFlowPlayInPlace,
    handleCoverFlowRotation,
    clearLibrary,
    setLyricOffset,
    isXpTheme,
    getCurrentKaraokeTrack,
    adjustLyricOffset: (index: number, delta: number) => {
      useIpodStore.getState().adjustLyricOffset(index, delta);
    },
  };
}
