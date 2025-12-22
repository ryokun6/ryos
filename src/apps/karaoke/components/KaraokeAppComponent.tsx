import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
import { useIpodStore, Track } from "@/stores/useIpodStore";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import { useShallow } from "zustand/react/shallow";
import { useIpodStoreShallow, useAudioSettingsStoreShallow } from "@/stores/helpers";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useLyrics } from "@/hooks/useLyrics";
import { useThemeStore } from "@/stores/useThemeStore";
import { LyricsAlignment, LyricsFont, KoreanDisplay, JapaneseFurigana } from "@/types/lyrics";
import { getTranslatedAppName } from "@/utils/i18n";
import { useOffline } from "@/hooks/useOffline";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { TRANSLATION_LANGUAGES } from "@/apps/ipod/constants";
import { FullscreenPlayerControls } from "@/components/shared/FullscreenPlayerControls";
import { useLibraryUpdateChecker } from "@/apps/ipod/hooks/useLibraryUpdateChecker";

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
  const { t } = useTranslation();
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
      lyricsTranslationLanguage: s.lyricsTranslationLanguage,
    }))
  );

  const {
    setLyricsAlignment,
    setLyricsFont,
    setKoreanDisplay,
    setJapaneseFurigana,
    setLyricsTranslationLanguage,
    toggleLyrics,
    clearLibrary,
    refreshLyrics,
    setTrackLyricsSearch,
    clearTrackLyricsSearch,
  } = useIpodStoreShallow((s) => ({
    setLyricsAlignment: s.setLyricsAlignment,
    setLyricsFont: s.setLyricsFont,
    setKoreanDisplay: s.setKoreanDisplay,
    setJapaneseFurigana: s.setJapaneseFurigana,
    setLyricsTranslationLanguage: s.setLyricsTranslationLanguage,
    toggleLyrics: s.toggleLyrics,
    clearLibrary: s.clearLibrary,
    refreshLyrics: s.refreshLyrics,
    setTrackLyricsSearch: s.setTrackLyricsSearch,
    clearTrackLyricsSearch: s.clearTrackLyricsSearch,
  }));

  // Library update checker
  const { manualSync } = useLibraryUpdateChecker(
    isWindowOpen && (isForeground ?? false)
  );

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
  const [isFetchingFurigana, setIsFetchingFurigana] = useState(false);
  
  // New dialogs for iPod menu features
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isLyricsSearchDialogOpen, setIsLyricsSearchDialogOpen] = useState(false);
  const [isSongSearchDialogOpen, setIsSongSearchDialogOpen] = useState(false);

  // Full screen additional state
  const [isFullScreenFetchingFurigana, setIsFullScreenFetchingFurigana] = useState(false);
  const fullScreenPlayerRef = useRef<ReactPlayer | null>(null);

  // Playback state
  const [elapsedTime, setElapsedTime] = useState(0);
  const playerRef = useRef<ReactPlayer | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimeoutRef = useRef<number | null>(null);

  // Volume from audio settings store
  const { ipodVolume } = useAudioSettingsStoreShallow((state) => ({ ipodVolume: state.ipodVolume }));

  // Current track
  const currentTrack: Track | null = tracks[currentIndex] || null;
  const lyricsSearchOverride = currentTrack?.lyricsSearch;

  // Lyrics hook
  const selectedMatchForLyrics = useMemo(() => {
    if (!lyricsSearchOverride?.selection) return undefined;
    return {
      hash: lyricsSearchOverride.selection.hash,
      albumId: lyricsSearchOverride.selection.albumId,
      title: lyricsSearchOverride.selection.title,
      artist: lyricsSearchOverride.selection.artist,
      album: lyricsSearchOverride.selection.album,
    };
  }, [lyricsSearchOverride?.selection]);

  const lyricsControls = useLyrics({
    title: currentTrack?.title ?? "",
    artist: currentTrack?.artist ?? "",
    album: currentTrack?.album ?? "",
    currentTime: elapsedTime + (currentTrack?.lyricOffset ?? 0) / 1000,
    translateTo: lyricsTranslationLanguage,
    searchQueryOverride: lyricsSearchOverride?.query,
    selectedMatch: selectedMatchForLyrics,
  });

  // Full screen lyrics hook (separate instance for independent time tracking)
  const fullScreenLyricsControls = useLyrics({
    title: currentTrack?.title ?? "",
    artist: currentTrack?.artist ?? "",
    album: currentTrack?.album ?? "",
    currentTime: elapsedTime + (currentTrack?.lyricOffset ?? 0) / 1000,
    translateTo: lyricsTranslationLanguage,
    searchQueryOverride: lyricsSearchOverride?.query,
    selectedMatch: selectedMatchForLyrics,
  });

  // Translation languages with translated labels
  const translationLanguages = useMemo(
    () =>
      TRANSLATION_LANGUAGES.map((lang) => ({
        label: lang.labelKey ? t(lang.labelKey) : lang.label || "",
        code: lang.code,
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
    if (isPlaying && !isLangMenuOpen) {
      hideControlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying, isLangMenuOpen]);

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
    if (!isPlaying || isLangMenuOpen) {
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
  }, [isPlaying, isLangMenuOpen, restartAutoHideTimer]);

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

  // Playback handlers
  const handleTrackEnd = useCallback(() => {
    if (loopCurrent) {
      playerRef.current?.seekTo(0);
      setIsPlaying(true);
    } else {
      nextTrack();
    }
  }, [loopCurrent, nextTrack]);

  const handleProgress = useCallback((state: { playedSeconds: number }) => {
    setElapsedTime(state.playedSeconds);
  }, []);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  // Seek time
  const seekTime = useCallback(
    (delta: number) => {
      if (playerRef.current) {
        const currentTime = playerRef.current.getCurrentTime() || 0;
        const newTime = Math.max(0, currentTime + delta);
        playerRef.current.seekTo(newTime);
        showStatus(
          `${delta > 0 ? "⏩︎" : "⏪︎"} ${Math.floor(newTime / 60)}:${String(Math.floor(newTime % 60)).padStart(2, "0")}`
        );
      }
    },
    [showStatus]
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

  // Korean toggle
  const toggleKorean = useCallback(() => {
    const curr = koreanDisplay;
    const next = curr === KoreanDisplay.Original ? KoreanDisplay.Romanized : KoreanDisplay.Original;
    setKoreanDisplay(next);
    showStatus(next === KoreanDisplay.Romanized ? t("apps.ipod.status.romanizationOn") : t("apps.ipod.status.hangulOn"));
  }, [koreanDisplay, setKoreanDisplay, showStatus, t]);

  // Furigana toggle
  const toggleFurigana = useCallback(() => {
    const curr = japaneseFurigana;
    const next = curr === JapaneseFurigana.On ? JapaneseFurigana.Off : JapaneseFurigana.On;
    setJapaneseFurigana(next);
    showStatus(next === JapaneseFurigana.On ? t("apps.ipod.status.furiganaOn") : t("apps.ipod.status.furiganaOff"));
  }, [japaneseFurigana, setJapaneseFurigana, showStatus, t]);

  // Track handling for add dialog
  const handleAddTrack = useCallback(
    async (url: string) => {
      const addedTrack = await useIpodStore.getState().addTrackFromVideoId(url);
      if (addedTrack) {
        showStatus(t("apps.ipod.status.added"));
        // New tracks are added at the beginning of the array, so set index to 0 and play
        setCurrentIndex(0);
        setIsPlaying(true);
      } else {
        throw new Error("Failed to add track");
      }
    },
    [showStatus, t]
  );

  // Share song handler
  const handleShareSong = useCallback(() => {
    if (tracks.length > 0 && currentIndex >= 0) setIsShareDialogOpen(true);
  }, [tracks, currentIndex]);

  // Generate share URL for song
  const karaokeGenerateShareUrl = (videoId: string): string => {
    return `${window.location.origin}/ipod/${videoId}`;
  };

  // Lyrics search handlers
  const handleRefreshLyrics = useCallback(() => {
    if (tracks.length > 0 && currentIndex >= 0) setIsLyricsSearchDialogOpen(true);
  }, [tracks, currentIndex]);

  const handleLyricsSearchSelect = useCallback(
    (result: { hash: string; albumId: string | number; title: string; artist: string; album?: string }) => {
      const track = tracks[currentIndex];
      if (track) {
        setTrackLyricsSearch(track.id, { query: undefined, selection: result });
        refreshLyrics();
      }
    },
    [tracks, currentIndex, setTrackLyricsSearch, refreshLyrics]
  );

  const handleLyricsSearchReset = useCallback(() => {
    const track = tracks[currentIndex];
    if (track) {
      clearTrackLyricsSearch(track.id);
      refreshLyrics();
    }
  }, [tracks, currentIndex, clearTrackLyricsSearch, refreshLyrics]);

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

  // Handle initial data (shared track) or default to first track
  useEffect(() => {
    if (isWindowOpen) {
      if (initialData?.videoId) {
        const videoId = initialData.videoId;
        const existingIndex = tracks.findIndex((track) => track.id === videoId);
        if (existingIndex !== -1) {
          setCurrentIndex(existingIndex);
          setIsPlaying(true);
        }
      } else if (tracks.length > 0 && currentIndex >= tracks.length) {
        // Reset to first track if current index is out of bounds
        setCurrentIndex(0);
      }
    }
  }, [isWindowOpen, initialData, tracks, currentIndex]);

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
      isFullScreen={isFullScreen}
      onToggleFullScreen={toggleFullScreen}
      onRefreshLyrics={handleRefreshLyrics}
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
              <div className="w-full h-[calc(100%+300px)] mt-[-150px]">
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
                  progressInterval={100}
                  onPlay={handlePlay}
                  onPause={handlePause}
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
                          gap: "clamp(0.25rem, 2cqw, 1rem)",
                        }}
                        interactive={true}
                        bottomPaddingClass="pb-20"
                        onFuriganaLoadingChange={setIsFetchingFurigana}
                        currentTimeMs={(elapsedTime + (currentTrack?.lyricOffset ?? 0) / 1000) * 1000}
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
              "absolute bottom-0 left-0 right-0 flex justify-center z-50 pb-6 transition-opacity duration-200",
              showControls || isLangMenuOpen || !isPlaying
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
              currentAlignment={lyricsAlignment}
              onAlignmentCycle={cycleAlignment}
              currentFont={lyricsFont}
              onFontCycle={cycleLyricsFont}
              koreanDisplay={koreanDisplay}
              onKoreanToggle={toggleKorean}
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
            initialQuery={
              lyricsSearchOverride?.query ||
              `${currentTrack.title} ${currentTrack.artist || ""}`.trim()
            }
            onSelect={handleLyricsSearchSelect}
            onReset={handleLyricsSearchReset}
            hasOverride={!!lyricsSearchOverride}
            currentSelection={lyricsSearchOverride?.selection}
          />
        )}
        <SongSearchDialog
          isOpen={isSongSearchDialogOpen}
          onOpenChange={setIsSongSearchDialogOpen}
          onSelect={handleSongSearchSelect}
          onAddUrl={handleAddUrl}
        />
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
          currentKoreanDisplay={koreanDisplay}
          onToggleKoreanDisplay={toggleKorean}
          currentJapaneseFurigana={japaneseFurigana}
          onToggleJapaneseFurigana={toggleFurigana}
          fullScreenPlayerRef={fullScreenPlayerRef}
          isLoadingLyrics={fullScreenLyricsControls.isLoading}
          isProcessingLyrics={fullScreenLyricsControls.isTranslating}
          isFetchingFurigana={isFullScreenFetchingFurigana}
        >
          {({ controlsVisible: _controlsVisible }) => (
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
                        textSizeClass="text-[min(10vw,10vh)]"
                        gapClass="gap-0"
                        containerStyle={{
                          gap: "clamp(0.25rem, calc(min(10vw,10vh) * 0.12), 2.5rem)",
                          paddingLeft: "env(safe-area-inset-left, 0px)",
                          paddingRight: "env(safe-area-inset-right, 0px)",
                        }}
                        interactive={isPlaying}
                        bottomPaddingClass="pb-[calc(max(env(safe-area-inset-bottom),0.5rem)+1.5rem)]"
                        onFuriganaLoadingChange={setIsFullScreenFetchingFurigana}
                        currentTimeMs={(elapsedTime + (currentTrack?.lyricOffset ?? 0) / 1000) * 1000}
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
