import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import ReactPlayer from "react-player";
import { cn } from "@/lib/utils";
import { AppProps, IpodInitialData } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { KaraokeMenuBar } from "./KaraokeMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { LyricsSearchDialog } from "@/components/dialogs/LyricsSearchDialog";
import { SongSearchDialog, SongSearchResult } from "@/components/dialogs/SongSearchDialog";
import { helpItems, appMetadata } from "..";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { LyricsDisplay } from "@/apps/ipod/components/LyricsDisplay";
import { FullScreenPortal } from "@/apps/ipod/components/FullScreenPortal";
import { LyricsSyncMode } from "@/components/shared/LyricsSyncMode";
import { useIpodStore, Track, getEffectiveTranslationLanguage } from "@/stores/useIpodStore";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import { useShallow } from "zustand/react/shallow";
import { useIpodStoreShallow, useAudioSettingsStoreShallow, useAppStoreShallow } from "@/stores/helpers";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useLyrics } from "@/hooks/useLyrics";
import { useFurigana } from "@/hooks/useFurigana";
import { useThemeStore } from "@/stores/useThemeStore";
import { LyricsAlignment, LyricsFont } from "@/types/lyrics";
import { getTranslatedAppName } from "@/utils/i18n";
import { useOffline } from "@/hooks/useOffline";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { TRANSLATION_LANGUAGES } from "@/apps/ipod/constants";
import { FullscreenPlayerControls } from "@/components/shared/FullscreenPlayerControls";
import { useLibraryUpdateChecker } from "@/apps/ipod/hooks/useLibraryUpdateChecker";
import { saveSongMetadataFromTrack } from "@/utils/songMetadataCache";
import { useChatsStore } from "@/stores/useChatsStore";

export function KaraokeAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  initialData,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps<IpodInitialData>) {
  const { t, i18n } = useTranslation();
  const isOffline = useOffline();
  const translatedHelpItems = useTranslatedHelpItems("karaoke", helpItems);

  // Shared state from iPod store (library and display preferences only)
  const {
    tracks,
    showLyrics,
    lyricsAlignment,
    lyricsFont,
    chineseVariant,
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
      chineseVariant: s.chineseVariant,
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

  // Independent playback state from Karaoke store (not shared with iPod)
  const {
    currentIndex,
    isPlaying,
    loopCurrent,
    loopAll,
    isShuffled,
    isFullScreen,
    setCurrentIndex,
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
      currentIndex: s.currentIndex,
      isPlaying: s.isPlaying,
      loopCurrent: s.loopCurrent,
      loopAll: s.loopAll,
      isShuffled: s.isShuffled,
      isFullScreen: s.isFullScreen,
      setCurrentIndex: s.setCurrentIndex,
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


  // Dialog state
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const [isPronunciationMenuOpen, setIsPronunciationMenuOpen] = useState(false);
  const anyMenuOpen = isLangMenuOpen || isPronunciationMenuOpen;
  const [isFetchingFurigana, setIsFetchingFurigana] = useState(false);
  
  // New dialogs for iPod menu features
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isLyricsSearchDialogOpen, setIsLyricsSearchDialogOpen] = useState(false);
  const [isSongSearchDialogOpen, setIsSongSearchDialogOpen] = useState(false);
  const [isSyncModeOpen, setIsSyncModeOpen] = useState(false);

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

  // Volume from audio settings store
  const { ipodVolume } = useAudioSettingsStoreShallow((state) => ({ ipodVolume: state.ipodVolume }));

  // iOS/Safari detection for autoplay restrictions
  const ua = navigator.userAgent;
  const isIOS = /iP(hone|od|ad)/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);

  // Current track
  const currentTrack: Track | null = tracks[currentIndex] || null;
  const lyricsSourceOverride = currentTrack?.lyricsSource;

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
  });

  // Full screen lyrics hook (separate instance for independent time tracking)
  const fullScreenLyricsControls = useLyrics({
    songId: currentTrack?.id ?? "",
    title: currentTrack?.title ?? "",
    artist: currentTrack?.artist ?? "",
    currentTime: elapsedTime + (currentTrack?.lyricOffset ?? 0) / 1000,
    translateTo: effectiveTranslationLanguage,
    selectedMatch: selectedMatchForLyrics,
  });

  // Track last song ID we showed a lyrics error toast for to avoid duplicates
  const lastLyricsErrorToastSongRef = useRef<string | null>(null);

  // Show toast with Search button when lyrics fetch fails
  useEffect(() => {
    const lyricsError = lyricsControls.error;
    const songId = currentTrack?.id;
    
    // Only show toast for "No lyrics available" type errors (not network errors, timeouts, etc.)
    const isNoLyricsError = lyricsError && (
      lyricsError.includes("No lyrics") ||
      lyricsError.includes("not found") ||
      lyricsError.includes("400") ||
      lyricsError.includes("No valid lyrics") ||
      lyricsError.includes("No lyrics source")
    );
    
    // Show toast if we have a no-lyrics error and haven't shown one for this song yet
    if (isNoLyricsError && songId && lastLyricsErrorToastSongRef.current !== songId) {
      lastLyricsErrorToastSongRef.current = songId;
      toast(t("apps.karaoke.lyrics.noLyricsFound", { defaultValue: "No lyrics found" }), {
        id: `lyrics-error-${songId}`,
        description: t("apps.karaoke.lyrics.searchForLyrics", { defaultValue: "Search for lyrics manually" }),
        action: {
          label: t("apps.karaoke.lyrics.search", { defaultValue: "Search" }),
          onClick: () => setIsLyricsSearchDialogOpen(true),
        },
        duration: 5000,
      });
    }
    
    // Reset when song changes
    if (songId !== lastLyricsErrorToastSongRef.current && !lyricsError) {
      lastLyricsErrorToastSongRef.current = null;
    }
  }, [lyricsControls.error, currentTrack?.id, t]);

  // Fetch furigana for lyrics (shared between main and fullscreen displays)
  const { furiganaMap } = useFurigana({
    songId: currentTrack?.id ?? "",
    lines: lyricsControls.originalLines,
    isShowingOriginal: true,
    romanization,
    onLoadingChange: setIsFetchingFurigana,
  });

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
  const lyricsFontClassName = useMemo(() => {
    switch (lyricsFont) {
      case LyricsFont.Serif:
        return "font-lyrics-serif";
      case LyricsFont.SansSerif:
        return "font-lyrics-sans";
      case LyricsFont.Rounded:
      default:
        return "font-lyrics-rounded";
    }
  }, [lyricsFont]);

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
  }, [restartAutoHideTimer]);

  // Wrapped handlers for fullscreen controls (with offline check)
  const handlePrevious = useCallback(() => {
    if (isOffline) {
      showOfflineStatus();
    } else {
      previousTrack();
      showStatus("⏮");
    }
  }, [isOffline, showOfflineStatus, previousTrack, showStatus]);

  const handlePlayPause = useCallback(() => {
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
      nextTrack();
      showStatus("⏭");
    }
  }, [isOffline, showOfflineStatus, nextTrack, showStatus]);

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

  // Reset elapsed time on track change
  useEffect(() => {
    setElapsedTime(0);
  }, [currentIndex]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
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

  // Sync playback position between main and fullscreen player
  const prevFullScreenRef = useRef(isFullScreen);

  useEffect(() => {
    if (isFullScreen !== prevFullScreenRef.current) {
      if (isFullScreen) {
        // Entering fullscreen - sync position from main player to fullscreen player
        const currentTime = playerRef.current?.getCurrentTime() || elapsedTime;
        const wasPlaying = isPlaying;

        setTimeout(() => {
          if (fullScreenPlayerRef.current) {
            fullScreenPlayerRef.current.seekTo(currentTime);
            if (wasPlaying) {
              setTimeout(() => {
                const internalPlayer = fullScreenPlayerRef.current?.getInternalPlayer?.();
                if (internalPlayer && typeof internalPlayer.playVideo === "function") {
                  internalPlayer.playVideo();
                }
              }, 200);
            }
          }
        }, 100);
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
        }, 200);
      }
      prevFullScreenRef.current = isFullScreen;
    }
  }, [isFullScreen, elapsedTime, isPlaying, setIsPlaying]);

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
    setIsPlaying(true);
  }, []);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  // Main player pause handler - ignore pause when switching to fullscreen
  const handleMainPlayerPause = useCallback(() => {
    // Don't set isPlaying to false if we're in fullscreen mode
    // (the pause was triggered by switching players, not user action)
    if (!isFullScreen) {
      setIsPlaying(false);
    }
  }, [isFullScreen]);

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
        // Subtract lyricOffset to convert from lyrics time to player time
        const lyricOffset = currentTrack?.lyricOffset ?? 0;
        const playerTimeMs = timeMs - lyricOffset;
        const newTime = Math.max(0, playerTimeMs / 1000);
        activePlayer.seekTo(newTime);
        // Start playing if paused
        if (!isPlaying) {
          setIsPlaying(true);
        }
        showStatus(
          `▶ ${Math.floor(newTime / 60)}:${String(Math.floor(newTime % 60)).padStart(2, "0")}`
        );
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
    if (curr === LyricsFont.Rounded) next = LyricsFont.Serif;
    else if (curr === LyricsFont.Serif) next = LyricsFont.SansSerif;
    else next = LyricsFont.Rounded;
    setLyricsFont(next);
    showStatus(
      next === LyricsFont.Rounded
        ? t("apps.ipod.status.fontRounded")
        : next === LyricsFont.Serif
        ? t("apps.ipod.status.fontSerif")
        : t("apps.ipod.status.fontSansSerif")
    );
  }, [lyricsFont, setLyricsFont, showStatus, t]);

  // Track handling for add dialog
  const handleAddTrack = useCallback(
    async (url: string, autoplay = true) => {
      const addedTrack = await useIpodStore.getState().addTrackFromVideoId(url);
      if (addedTrack) {
        showStatus(t("apps.ipod.status.added"));
        // New tracks are added at the beginning of the array, so set index to 0
        setCurrentIndex(0);
        if (autoplay) setIsPlaying(true);
      } else {
        throw new Error("Failed to add track");
      }
    },
    [showStatus, t, setCurrentIndex, setIsPlaying]
  );

  // Process video ID from shared link (add if not in library, then play)
  const processVideoId = useCallback(
    async (videoId: string) => {
      const currentTracks = useIpodStore.getState().tracks;
      const existingTrackIndex = currentTracks.findIndex((track) => track.id === videoId);
      // Don't autoplay on iOS/Safari due to autoplay restrictions
      const shouldAutoplay = !(isIOS || isSafari);

      if (existingTrackIndex !== -1) {
        toast.info(t("apps.ipod.dialogs.openedSharedTrack"));
        setCurrentIndex(existingTrackIndex);
        if (shouldAutoplay) setIsPlaying(true);
      } else {
        toast.info(t("apps.ipod.dialogs.addingNewTrack"));
        await handleAddTrack(`https://www.youtube.com/watch?v=${videoId}`, shouldAutoplay);
        if (isOffline) {
          showOfflineStatus();
        }
      }
    },
    [setCurrentIndex, setIsPlaying, handleAddTrack, isOffline, showOfflineStatus, t, isIOS, isSafari]
  );

  // Share song handler
  const handleShareSong = useCallback(() => {
    if (tracks.length > 0 && currentIndex >= 0) {
      const track = tracks[currentIndex];
      // Save song metadata to cache when sharing (requires auth)
      if (track) {
        const { username, authToken } = useChatsStore.getState();
        const auth = username && authToken ? { username, authToken } : null;
        saveSongMetadataFromTrack(track, auth).catch((error) => {
          console.error("[Karaoke] Error saving song metadata to cache:", error);
        });
      }
      setIsShareDialogOpen(true);
    }
  }, [tracks, currentIndex]);

  // Generate share URL for song
  const karaokeGenerateShareUrl = (videoId: string): string => {
    return `${window.location.origin}/karaoke/${videoId}`;
  };

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
    setCurrentIndex(index);
    setIsPlaying(true);
  }, []);

  // Keyboard controls
  useEffect(() => {
    if (!isForeground) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === " ") {
        e.preventDefault();
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
    } else if (isWindowOpen && tracks.length > 0 && currentIndex >= tracks.length) {
      // Reset to first track if current index is out of bounds
      setCurrentIndex(0);
    }
  }, [isWindowOpen, initialData, processVideoId, clearInstanceInitialData, instanceId, tracks.length, currentIndex]);

  // Handle updateApp event for when app is already open and receives new video
  useEffect(() => {
    const handleUpdateApp = (
      event: CustomEvent<{ appId: string; initialData?: { videoId?: string } }>
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
    };

    window.addEventListener("updateApp", handleUpdateApp as EventListener);
    return () => window.removeEventListener("updateApp", handleUpdateApp as EventListener);
  }, [processVideoId, bringToForeground]);

  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const menuBar = (
    <KaraokeMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onAddSong={handleAddSong}
      onShareSong={handleShareSong}
      onClearLibrary={() => setIsConfirmClearOpen(true)}
      onSyncLibrary={manualSync}
      onPlayTrack={handlePlayTrack}
      onTogglePlay={togglePlay}
      onPreviousTrack={previousTrack}
      onNextTrack={nextTrack}
      isPlaying={isPlaying}
      isShuffled={isShuffled}
      onToggleShuffle={toggleShuffle}
      loopAll={loopAll}
      onToggleLoopAll={toggleLoopAll}
      loopCurrent={loopCurrent}
      onToggleLoopCurrent={toggleLoopCurrent}
      showLyrics={showLyrics}
      onToggleLyrics={toggleLyrics}
      onToggleFullScreen={toggleFullScreen}
      onRefreshLyrics={handleRefreshLyrics}
      onAdjustTiming={() => setIsSyncModeOpen(true)}
      tracks={tracks}
      currentIndex={currentIndex}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={currentTrack ? `${currentTrack.title}${currentTrack.artist ? ` - ${currentTrack.artist}` : ""}` : getTranslatedAppName("karaoke")}
        onClose={onClose}
        isForeground={isForeground}
        appId="karaoke"
        material="notitlebar"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <div
          className="relative w-full h-full bg-black select-none overflow-hidden @container"
          onMouseMove={restartAutoHideTimer}
          onClick={() => {
            if (isOffline) {
              showOfflineStatus();
            } else if (currentTrack) {
              togglePlay();
              showStatus(isPlaying ? "⏸" : "▶");
            }
          }}
        >
          {/* Video Player - container clips YouTube UI by extending height and using negative margin */}
          {currentTrack ? (
            <div className="absolute inset-0 overflow-hidden">
              <div className="w-full h-[calc(100%+400px)] mt-[-200px]">
                <ReactPlayer
                  ref={playerRef}
                  url={currentTrack.url}
                  playing={isPlaying && !isFullScreen}
                  width="100%"
                  height="100%"
                  volume={ipodVolume * useAudioSettingsStore.getState().masterVolume}
                  loop={loopCurrent}
                  onEnded={handleTrackEnd}
                  onProgress={handleProgress}
                  onDuration={setDuration}
                  progressInterval={100}
                  onPlay={handlePlay}
                  onPause={handleMainPlayerPause}
                  style={{ pointerEvents: "none" }}
                  config={{
                    youtube: {
                      playerVars: {
                        modestbranding: 1,
                        rel: 0,
                        showinfo: 0,
                        iv_load_policy: 3,
                        cc_load_policy: 0,
                        fs: 0,
                        playsinline: 1,
                        enablejsapi: 1,
                        origin: window.location.origin,
                        controls: 0,
                      },
                      embedOptions: {
                        referrerPolicy: "strict-origin-when-cross-origin",
                      },
                    },
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/50 font-geneva-12">
              {t("apps.karaoke.noTrack")}
            </div>
          )}

          {/* Lyrics overlay */}
          {showLyrics && currentTrack && (
            <>
              <div className="absolute inset-0 bg-black/50 pointer-events-none" />
              <div className="absolute inset-0 pointer-events-none karaoke-force-font">
              <LyricsDisplay
                        songId={currentTrack?.id ?? ""}
                        lines={lyricsControls.lines}
                        originalLines={lyricsControls.originalLines}
                        currentLine={lyricsControls.currentLine}
                        isLoading={lyricsControls.isLoading}
                        error={lyricsControls.error}
                        visible={true}
                        videoVisible={true}
                        alignment={lyricsAlignment}
                        chineseVariant={chineseVariant}
                        koreanDisplay={koreanDisplay}
                        japaneseFurigana={japaneseFurigana}
                        fontClassName={lyricsFontClassName}
                        onAdjustOffset={(delta) => {
                          useIpodStore.getState().adjustLyricOffset(currentIndex, delta);
                          const newOffset = (currentTrack?.lyricOffset ?? 0) + delta;
                          const sign = newOffset > 0 ? "+" : newOffset < 0 ? "" : "";
                          showStatus(`${t("apps.ipod.status.offset")} ${sign}${(newOffset / 1000).toFixed(2)}s`);
                          lyricsControls.updateCurrentTimeManually(elapsedTime + newOffset / 1000);
                        }}
                        onSwipeUp={() => {
                          if (isOffline) {
                            showOfflineStatus();
                          } else {
                            nextTrack();
                            showStatus("⏭");
                          }
                        }}
                        onSwipeDown={() => {
                          if (isOffline) {
                            showOfflineStatus();
                          } else {
                            previousTrack();
                            showStatus("⏮");
                          }
                        }}
                        isTranslating={lyricsControls.isTranslating}
                        textSizeClass="karaoke-lyrics-text"
                        gapClass="gap-1"
                        containerStyle={{
                          gap: "clamp(0.3rem, 2.5cqw, 1rem)",
                        }}
                        interactive={true}
                        bottomPaddingClass={showControls || anyMenuOpen || !isPlaying ? "pb-20" : "pb-16"}
                        furiganaMap={furiganaMap}
                        currentTimeMs={(elapsedTime + (currentTrack?.lyricOffset ?? 0) / 1000) * 1000}
                        onSeekToTime={seekToTime}
                      />
              </div>
            </>
          )}

          {/* Status message - scales with container size */}
          <AnimatePresence>
            {statusMessage && (
              <motion.div
                className="absolute top-8 left-6 z-40 pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="relative">
                  <div
                    className="font-chicago text-white relative z-10 karaoke-status-text"
                  >
                    {statusMessage}
                  </div>
                  <div
                    className="font-chicago text-black absolute inset-0 karaoke-status-text"
                    style={{ WebkitTextStroke: "5px black", textShadow: "none" }}
                  >
                    {statusMessage}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Activity indicator - scales with container size */}
          <AnimatePresence>
            {(lyricsControls.isLoading || lyricsControls.isTranslating || isFetchingFurigana) && (
              <motion.div
                className="absolute top-8 right-6 z-40 pointer-events-none"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
              >
                <ActivityIndicator
                  size={32}
                  className="karaoke-activity-indicator text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Control toolbar */}
          <div
            data-toolbar
            className={cn(
              "absolute bottom-0 left-0 right-0 flex justify-center z-[60] pb-6 transition-opacity duration-200",
              showControls || anyMenuOpen || !isPlaying
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none"
            )}
            onClick={(e) => {
              e.stopPropagation();
              restartAutoHideTimer();
            }}
          >
            <FullscreenPlayerControls
              isPlaying={isPlaying}
              onPrevious={handlePrevious}
              onPlayPause={handlePlayPause}
              onNext={handleNext}
              onSyncMode={() => setIsSyncModeOpen((prev) => !prev)}
              currentAlignment={lyricsAlignment}
              onAlignmentCycle={cycleAlignment}
              currentFont={lyricsFont}
              onFontCycle={cycleLyricsFont}
              romanization={romanization}
              onRomanizationChange={setRomanization}
              isPronunciationMenuOpen={isPronunciationMenuOpen}
              setIsPronunciationMenuOpen={setIsPronunciationMenuOpen}
              currentTranslationCode={lyricsTranslationLanguage}
              onTranslationSelect={setLyricsTranslationLanguage}
              translationLanguages={translationLanguages}
              isLangMenuOpen={isLangMenuOpen}
              setIsLangMenuOpen={setIsLangMenuOpen}
              onFullscreen={toggleFullScreen}
              variant="compact"
              bgOpacity="60"
              onInteraction={restartAutoHideTimer}
            />
          </div>
        </div>

        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setIsHelpDialogOpen}
          helpItems={translatedHelpItems}
          appId="karaoke"
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={appMetadata}
          appId="karaoke"
        />
        <ConfirmDialog
          isOpen={isConfirmClearOpen}
          onOpenChange={setIsConfirmClearOpen}
          onConfirm={() => {
            clearLibrary();
            setIsConfirmClearOpen(false);
            showStatus(t("apps.ipod.status.libraryCleared"));
          }}
          title={t("apps.ipod.dialogs.clearLibraryTitle")}
          description={t("apps.ipod.dialogs.clearLibraryDescription")}
        />
        <ShareItemDialog
          isOpen={isShareDialogOpen}
          onClose={() => setIsShareDialogOpen(false)}
          itemType="Song"
          itemIdentifier={tracks[currentIndex]?.id || ""}
          title={tracks[currentIndex]?.title}
          details={tracks[currentIndex]?.artist}
          generateShareUrl={karaokeGenerateShareUrl}
        />
        {currentTrack && (
          <LyricsSearchDialog
            isOpen={isLyricsSearchDialogOpen}
            onOpenChange={setIsLyricsSearchDialogOpen}
            trackTitle={currentTrack.title}
            trackArtist={currentTrack.artist}
            initialQuery={`${currentTrack.title} ${currentTrack.artist || ""}`.trim()}
            onSelect={handleLyricsSearchSelect}
            onReset={handleLyricsSearchReset}
            hasOverride={!!lyricsSourceOverride}
            currentSelection={lyricsSourceOverride}
          />
        )}
        <SongSearchDialog
          isOpen={isSongSearchDialogOpen}
          onOpenChange={setIsSongSearchDialogOpen}
          onSelect={handleSongSearchSelect}
          onAddUrl={handleAddUrl}
        />

        {/* Lyrics Sync Mode (non-fullscreen only - fullscreen renders in portal) */}
        {/* z-40 so the notitlebar hover titlebar (z-50) appears above it */}
        {!isFullScreen && isSyncModeOpen && lyricsControls.originalLines.length > 0 && (
          <div className="absolute inset-0 z-40" style={{ borderRadius: "inherit" }}>
            <LyricsSyncMode
              lines={lyricsControls.originalLines}
              currentTimeMs={elapsedTime * 1000}
              durationMs={duration * 1000}
              currentOffset={currentTrack?.lyricOffset ?? 0}
              romanization={romanization}
              furiganaMap={furiganaMap}
              onSetOffset={(offsetMs) => {
                setLyricOffset(currentIndex, offsetMs);
                showStatus(
                  `${t("apps.ipod.status.offset")} ${offsetMs >= 0 ? "+" : ""}${(offsetMs / 1000).toFixed(2)}s`
                );
              }}
              onAdjustOffset={(deltaMs) => {
                useIpodStore.getState().adjustLyricOffset(currentIndex, deltaMs);
                const newOffset = (currentTrack?.lyricOffset ?? 0) + deltaMs;
                showStatus(
                  `${t("apps.ipod.status.offset")} ${newOffset >= 0 ? "+" : ""}${(newOffset / 1000).toFixed(2)}s`
                );
              }}
              onSeek={(timeMs) => {
                playerRef.current?.seekTo(timeMs / 1000);
              }}
              onClose={() => setIsSyncModeOpen(false)}
              onSearchLyrics={handleRefreshLyrics}
            />
          </div>
        )}
      </WindowFrame>

      {/* Full screen portal */}
      {isFullScreen && (
        <FullScreenPortal
          onClose={toggleFullScreen}
          togglePlay={togglePlay}
          nextTrack={() => {
            nextTrack();
            // Show status with correct track info (using setTimeout to get updated state)
            setTimeout(() => {
              const newIndex = (currentIndex + 1) % tracks.length;
              const newTrack = tracks[newIndex];
              if (newTrack) {
                const artistInfo = newTrack.artist ? ` - ${newTrack.artist}` : "";
                showStatus(`⏭ ${newTrack.title}${artistInfo}`);
              }
            }, 150);
          }}
          previousTrack={() => {
            previousTrack();
            // Show status with correct track info (using setTimeout to get updated state)
            setTimeout(() => {
              const newIndex = currentIndex === 0 ? tracks.length - 1 : currentIndex - 1;
              const newTrack = tracks[newIndex];
              if (newTrack) {
                const artistInfo = newTrack.artist ? ` - ${newTrack.artist}` : "";
                showStatus(`⏮ ${newTrack.title}${artistInfo}`);
              }
            }, 150);
          }}
          seekTime={seekTime}
          showStatus={showStatus}
          showOfflineStatus={showOfflineStatus}
          registerActivity={registerActivity}
          isPlaying={isPlaying}
          statusMessage={statusMessage}
          currentTranslationCode={lyricsTranslationLanguage}
          onSelectTranslation={setLyricsTranslationLanguage}
          currentAlignment={lyricsAlignment}
          onCycleAlignment={cycleAlignment}
          currentLyricsFont={lyricsFont}
          onCycleLyricsFont={cycleLyricsFont}
          romanization={romanization}
          onRomanizationChange={setRomanization}
          onSyncMode={() => setIsSyncModeOpen((prev) => !prev)}
          isSyncModeOpen={isSyncModeOpen}
          syncModeContent={
            lyricsControls.originalLines.length > 0 ? (
              <LyricsSyncMode
                lines={lyricsControls.originalLines}
                currentTimeMs={elapsedTime * 1000}
                durationMs={duration * 1000}
                currentOffset={currentTrack?.lyricOffset ?? 0}
                romanization={romanization}
                furiganaMap={furiganaMap}
                onSetOffset={(offsetMs) => {
                  setLyricOffset(currentIndex, offsetMs);
                  showStatus(
                    `${t("apps.ipod.status.offset")} ${offsetMs >= 0 ? "+" : ""}${(offsetMs / 1000).toFixed(2)}s`
                  );
                }}
                onAdjustOffset={(deltaMs) => {
                  useIpodStore.getState().adjustLyricOffset(currentIndex, deltaMs);
                  const newOffset = (currentTrack?.lyricOffset ?? 0) + deltaMs;
                  showStatus(
                    `${t("apps.ipod.status.offset")} ${newOffset >= 0 ? "+" : ""}${(newOffset / 1000).toFixed(2)}s`
                  );
                }}
                onSeek={(timeMs) => {
                  const activePlayer = isFullScreen ? fullScreenPlayerRef.current : playerRef.current;
                  activePlayer?.seekTo(timeMs / 1000);
                }}
                onClose={() => setIsSyncModeOpen(false)}
                onSearchLyrics={handleRefreshLyrics}
              />
            ) : undefined
          }
          fullScreenPlayerRef={fullScreenPlayerRef}
          isLoadingLyrics={fullScreenLyricsControls.isLoading}
          isProcessingLyrics={fullScreenLyricsControls.isTranslating}
          isFetchingFurigana={isFetchingFurigana}
        >
          {({ controlsVisible }) => (
            <div className="flex flex-col w-full h-full">
              <div className="relative w-full h-full overflow-visible">
                <div
                  className="w-full relative"
                  style={{
                    height: "calc(100% + clamp(480px, 60dvh, 800px))",
                    transform: "translateY(-240px)",
                  }}
                >
                    {currentTrack && (
                      <div className="w-full h-full pointer-events-none">
                        <ReactPlayer
                          ref={fullScreenPlayerRef}
                          url={currentTrack.url}
                          playing={isPlaying && isFullScreen}
                          controls
                          width="100%"
                          height="100%"
                          volume={ipodVolume * useAudioSettingsStore.getState().masterVolume}
                          loop={loopCurrent}
                          onEnded={handleTrackEnd}
                          onProgress={handleProgress}
                          progressInterval={100}
                          onPlay={handlePlay}
                          onPause={handlePause}
                          config={{
                            youtube: {
                              playerVars: {
                                modestbranding: 1,
                                rel: 0,
                                showinfo: 0,
                                iv_load_policy: 3,
                                cc_load_policy: 0,
                                fs: 1,
                                playsinline: 1,
                                enablejsapi: 1,
                                origin: window.location.origin,
                              },
                              embedOptions: {
                                referrerPolicy: "strict-origin-when-cross-origin",
                              },
                            },
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Lyrics overlays - positioned relative to viewport, not video container */}
                  {showLyrics && currentTrack && (
                    <div className="fixed inset-0 bg-black/50 z-10 pointer-events-none" />
                  )}

                  {showLyrics && currentTrack && (
                    <div className="absolute inset-0 pointer-events-none z-20">
                      <LyricsDisplay
                        songId={currentTrack?.id ?? ""}
                        lines={fullScreenLyricsControls.lines}
                        originalLines={fullScreenLyricsControls.originalLines}
                        currentLine={fullScreenLyricsControls.currentLine}
                        isLoading={fullScreenLyricsControls.isLoading}
                        error={fullScreenLyricsControls.error}
                        visible={true}
                        videoVisible={true}
                        alignment={lyricsAlignment}
                        chineseVariant={chineseVariant}
                        koreanDisplay={koreanDisplay}
                        japaneseFurigana={japaneseFurigana}
                        fontClassName={lyricsFontClassName}
                        onAdjustOffset={(delta) => {
                          useIpodStore.getState().adjustLyricOffset(currentIndex, delta);
                          const newOffset = (currentTrack?.lyricOffset ?? 0) + delta;
                          const sign = newOffset > 0 ? "+" : newOffset < 0 ? "" : "";
                          showStatus(`${t("apps.ipod.status.offset")} ${sign}${(newOffset / 1000).toFixed(2)}s`);
                          fullScreenLyricsControls.updateCurrentTimeManually(elapsedTime + newOffset / 1000);
                        }}
                        onSwipeUp={() => {
                          if (isOffline) {
                            showOfflineStatus();
                          } else {
                            nextTrack();
                            setTimeout(() => {
                              const newIndex = (currentIndex + 1) % tracks.length;
                              const newTrack = tracks[newIndex];
                              if (newTrack) {
                                const artistInfo = newTrack.artist ? ` - ${newTrack.artist}` : "";
                                showStatus(`⏭ ${newTrack.title}${artistInfo}`);
                              }
                            }, 150);
                          }
                        }}
                        onSwipeDown={() => {
                          if (isOffline) {
                            showOfflineStatus();
                          } else {
                            previousTrack();
                            setTimeout(() => {
                              const newIndex = currentIndex === 0 ? tracks.length - 1 : currentIndex - 1;
                              const newTrack = tracks[newIndex];
                              if (newTrack) {
                                const artistInfo = newTrack.artist ? ` - ${newTrack.artist}` : "";
                                showStatus(`⏮ ${newTrack.title}${artistInfo}`);
                              }
                            }, 150);
                          }
                        }}
                        isTranslating={fullScreenLyricsControls.isTranslating}
                        textSizeClass="fullscreen-lyrics-text"
                        gapClass="gap-0"
                        containerStyle={{
                          gap: "clamp(0.2rem, calc(min(10vw,10vh) * 0.08), 1rem)",
                          paddingLeft: "env(safe-area-inset-left, 0px)",
                          paddingRight: "env(safe-area-inset-right, 0px)",
                        }}
                        interactive={isPlaying}
                        bottomPaddingClass={controlsVisible ? "pb-6" : "pb-2"}
                        furiganaMap={furiganaMap}
                        currentTimeMs={(elapsedTime + (currentTrack?.lyricOffset ?? 0) / 1000) * 1000}
                        onSeekToTime={seekToTime}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </FullScreenPortal>
      )}
    </>
  );
}
