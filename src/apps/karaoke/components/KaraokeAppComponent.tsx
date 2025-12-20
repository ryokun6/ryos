import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReactPlayer from "react-player";
import { cn } from "@/lib/utils";
import { AppProps, IpodInitialData } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { KaraokeMenuBar } from "./KaraokeMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { helpItems, appMetadata } from "..";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { LyricsDisplay } from "@/apps/ipod/components/LyricsDisplay";
import { useIpodStore, Track } from "@/stores/useIpodStore";
import { useShallow } from "zustand/react/shallow";
import { useIpodStoreShallow, useAppStoreShallow } from "@/stores/helpers";
import { useAppStore } from "@/stores/useAppStore";
import { useLyrics } from "@/hooks/useLyrics";
import { useThemeStore } from "@/stores/useThemeStore";
import { LyricsAlignment, KoreanDisplay, JapaneseFurigana } from "@/types/lyrics";
import { getTranslatedAppName } from "@/utils/i18n";
import { useOffline } from "@/hooks/useOffline";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import {
  TRANSLATION_LANGUAGES,
  getTranslationBadge,
} from "@/apps/ipod/constants";

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
    chineseVariant,
    koreanDisplay,
    japaneseFurigana,
    lyricsTranslationLanguage,
  } = useIpodStore(
    useShallow((s) => ({
      tracks: s.tracks,
      showLyrics: s.showLyrics,
      lyricsAlignment: s.lyricsAlignment,
      chineseVariant: s.chineseVariant,
      koreanDisplay: s.koreanDisplay,
      japaneseFurigana: s.japaneseFurigana,
      lyricsTranslationLanguage: s.lyricsTranslationLanguage,
    }))
  );

  const {
    setLyricsAlignment,
    setKoreanDisplay,
    setJapaneseFurigana,
    setLyricsTranslationLanguage,
    toggleLyrics,
  } = useIpodStoreShallow((s) => ({
    setLyricsAlignment: s.setLyricsAlignment,
    setKoreanDisplay: s.setKoreanDisplay,
    setJapaneseFurigana: s.setJapaneseFurigana,
    setLyricsTranslationLanguage: s.setLyricsTranslationLanguage,
    toggleLyrics: s.toggleLyrics,
  }));

  // Independent playback state (not shared with iPod)
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopCurrent, setLoopCurrent] = useState(false);
  const [loopAll, setLoopAll] = useState(true);
  const [isShuffled, setIsShuffled] = useState(false);
  const [shuffleOrder, setShuffleOrder] = useState<number[]>([]);

  // Generate shuffle order when tracks change or shuffle is enabled
  useEffect(() => {
    if (isShuffled && tracks.length > 0) {
      const order = [...Array(tracks.length).keys()];
      // Fisher-Yates shuffle
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      setShuffleOrder(order);
    }
  }, [isShuffled, tracks.length]);

  // Playback control callbacks
  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const nextTrack = useCallback(() => {
    if (tracks.length === 0) return;
    
    if (isShuffled && shuffleOrder.length > 0) {
      const currentShuffleIndex = shuffleOrder.indexOf(currentIndex);
      const nextShuffleIndex = (currentShuffleIndex + 1) % shuffleOrder.length;
      setCurrentIndex(shuffleOrder[nextShuffleIndex]);
    } else {
      const nextIndex = currentIndex + 1;
      if (nextIndex >= tracks.length) {
        if (loopAll) {
          setCurrentIndex(0);
        }
      } else {
        setCurrentIndex(nextIndex);
      }
    }
  }, [tracks.length, currentIndex, isShuffled, shuffleOrder, loopAll]);

  const previousTrack = useCallback(() => {
    if (tracks.length === 0) return;
    
    if (isShuffled && shuffleOrder.length > 0) {
      const currentShuffleIndex = shuffleOrder.indexOf(currentIndex);
      const prevShuffleIndex = currentShuffleIndex === 0 ? shuffleOrder.length - 1 : currentShuffleIndex - 1;
      setCurrentIndex(shuffleOrder[prevShuffleIndex]);
    } else {
      const prevIndex = currentIndex - 1;
      if (prevIndex < 0) {
        if (loopAll) {
          setCurrentIndex(tracks.length - 1);
        }
      } else {
        setCurrentIndex(prevIndex);
      }
    }
  }, [tracks.length, currentIndex, isShuffled, shuffleOrder, loopAll]);

  const toggleLoopCurrent = useCallback(() => {
    setLoopCurrent((prev) => !prev);
  }, []);

  const toggleLoopAll = useCallback(() => {
    setLoopAll((prev) => !prev);
  }, []);

  const toggleShuffle = useCallback(() => {
    setIsShuffled((prev) => !prev);
  }, []);


  // Dialog state
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const [isFetchingFurigana, setIsFetchingFurigana] = useState(false);

  // Playback state
  const [elapsedTime, setElapsedTime] = useState(0);
  const playerRef = useRef<ReactPlayer | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimeoutRef = useRef<number | null>(null);

  // Volume
  const { ipodVolume } = useAppStoreShallow((state) => ({ ipodVolume: state.ipodVolume }));

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

  // Translation languages with translated labels
  const translationLanguages = useMemo(
    () =>
      TRANSLATION_LANGUAGES.map((lang) => ({
        label: lang.labelKey ? t(lang.labelKey) : lang.label || "",
        code: lang.code,
      })),
    [t]
  );

  const translationBadge = useMemo(
    () => getTranslationBadge(lyricsTranslationLanguage),
    [lyricsTranslationLanguage]
  );

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
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isForeground, isPlaying, isOffline, togglePlay, nextTrack, previousTrack, seekTime, showStatus, showOfflineStatus]);

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
      onTogglePlay={togglePlay}
      onPreviousTrack={previousTrack}
      onNextTrack={nextTrack}
      isShuffled={isShuffled}
      onToggleShuffle={toggleShuffle}
      loopAll={loopAll}
      onToggleLoopAll={toggleLoopAll}
      loopCurrent={loopCurrent}
      onToggleLoopCurrent={toggleLoopCurrent}
      showLyrics={showLyrics}
      onToggleLyrics={toggleLyrics}
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
            if (!isPlaying) {
              if (isOffline) {
                showOfflineStatus();
              } else if (currentTrack) {
                togglePlay();
                showStatus("▶");
              }
            }
          }}
        >
          {/* Video Player - container clips YouTube UI by extending height and using negative margin */}
          {currentTrack ? (
            <div className="absolute inset-0 overflow-hidden">
              <div className="w-full h-[calc(100%+120px)] mt-[-60px]">
                <ReactPlayer
                  ref={playerRef}
                  url={currentTrack.url}
                  playing={isPlaying}
                  width="100%"
                  height="100%"
                  volume={ipodVolume * useAppStore.getState().masterVolume}
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
                  fontClassName="font-lyrics-rounded"
                  onAdjustOffset={(delta) => {
                    useIpodStore.getState().adjustLyricOffset(currentIndex, delta);
                    const newOffset = (currentTrack?.lyricOffset ?? 0) + delta;
                    const sign = newOffset > 0 ? "+" : newOffset < 0 ? "" : "";
                    showStatus(`${t("apps.ipod.status.offset")} ${sign}${(newOffset / 1000).toFixed(2)}s`);
                    lyricsControls.updateCurrentTimeManually(elapsedTime + newOffset / 1000);
                  }}
                  isTranslating={lyricsControls.isTranslating}
                  textSizeClass="karaoke-lyrics-text"
                  gapClass="gap-1"
                  containerStyle={{
                    gap: "clamp(0.25rem, 2cqw, 1rem)",
                  }}
                  interactive={true}
                  bottomPaddingClass="pb-24"
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
                className="absolute top-4 left-4 z-40 pointer-events-none"
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
                className="absolute top-4 right-4 z-40 pointer-events-none"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
              >
                <ActivityIndicator
                  size="lg"
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
            <div className="relative ipod-force-font">
              <div className="bg-neutral-800/60 border border-white/10 backdrop-blur-sm rounded-full shadow-lg flex items-center gap-1 px-2 py-1 font-geneva-12">
                {/* Previous */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isOffline) {
                      showOfflineStatus();
                    } else {
                      previousTrack();
                      showStatus("⏮");
                    }
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                  title={t("apps.ipod.menu.previous")}
                >
                  <span className="text-base">⏮</span>
                </button>

                {/* Play/Pause */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isOffline) {
                      showOfflineStatus();
                    } else {
                      togglePlay();
                      showStatus(isPlaying ? "⏸" : "▶");
                    }
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                  title={t("apps.ipod.ariaLabels.playPause")}
                >
                  <span className="text-base">{isPlaying ? "⏸" : "▶"}</span>
                </button>

                {/* Next */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isOffline) {
                      showOfflineStatus();
                    } else {
                      nextTrack();
                      showStatus("⏭");
                    }
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                  title={t("apps.ipod.menu.next")}
                >
                  <span className="text-base">⏭</span>
                </button>

                {/* Layout */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    cycleAlignment();
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                  title={lyricsAlignment}
                >
                  {lyricsAlignment === "focusThree" ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="6" y1="6" x2="18" y2="6" />
                      <line x1="4" y1="12" x2="20" y2="12" />
                      <line x1="6" y1="18" x2="18" y2="18" />
                    </svg>
                  ) : lyricsAlignment === "center" ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="6" y1="12" x2="18" y2="12" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="4" y1="8" x2="13" y2="8" />
                      <line x1="11" y1="16" x2="20" y2="16" />
                    </svg>
                  )}
                </button>

                {/* Hangul toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleKorean();
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                  title={t("apps.ipod.ariaLabels.toggleHangulRomanization")}
                >
                  <span className="text-sm">{koreanDisplay === "romanized" ? "Ko" : "한"}</span>
                </button>

                {/* Furigana toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFurigana();
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                  title={t("apps.ipod.menu.furigana")}
                >
                  <span className="text-sm">{japaneseFurigana === JapaneseFurigana.On ? "ふ" : "漢"}</span>
                </button>

                {/* Translate */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsLangMenuOpen((v) => !v);
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                  title={t("apps.ipod.ariaLabels.translateLyrics")}
                >
                  {translationBadge ? (
                    <span className="text-sm">{translationBadge}</span>
                  ) : (
                    <span className="text-sm">Aa</span>
                  )}
                </button>
              </div>

              {/* Translation menu */}
              <AnimatePresence>
                {isLangMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 max-h-[50vh] overflow-y-auto rounded-lg border border-white/10 bg-neutral-900/90 backdrop-blur-md shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="py-2">
                      {translationLanguages.map((lang) => {
                        const selected =
                          lyricsTranslationLanguage === lang.code ||
                          (!lang.code && !lyricsTranslationLanguage);
                        return (
                          <button
                            key={lang.code || "off"}
                            onClick={() => {
                              setLyricsTranslationLanguage(lang.code);
                              setIsLangMenuOpen(false);
                            }}
                            className={cn(
                              "w-full text-left px-4 py-2 text-sm font-geneva-12 transition-colors",
                              selected
                                ? "text-white bg-white/10"
                                : "text-white/80 hover:text-white hover:bg-white/10"
                            )}
                          >
                            <span className="inline-block w-4">{selected ? "✓" : ""}</span>
                            <span>{lang.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
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
      </WindowFrame>
    </>
  );
}
