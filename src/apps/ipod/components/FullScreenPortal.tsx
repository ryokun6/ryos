import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { useIpodStore } from "@/stores/useIpodStore";
import { useOffline } from "@/hooks/useOffline";
import { useTranslation } from "react-i18next";
import { isMobileSafari } from "@/utils/device";
import { LyricsFont } from "@/types/lyrics";
import {
  TRANSLATION_LANGUAGES,
  SWIPE_THRESHOLD,
  MAX_SWIPE_TIME,
  MAX_VERTICAL_DRIFT,
  getTranslationBadge,
} from "../constants";
import type { FullScreenPortalProps } from "../types";

export function FullScreenPortal({
  children,
  onClose,
  togglePlay,
  nextTrack,
  previousTrack,
  seekTime,
  showStatus,
  showOfflineStatus,
  registerActivity,
  isPlaying,
  statusMessage,
  currentTranslationCode,
  onSelectTranslation,
  currentAlignment,
  onCycleAlignment,
  currentLyricsFont,
  onCycleLyricsFont,
  currentKoreanDisplay,
  onToggleKoreanDisplay,
  currentJapaneseFurigana: _currentJapaneseFurigana,
  onToggleJapaneseFurigana,
  fullScreenPlayerRef,
  isLoadingLyrics,
  isProcessingLyrics,
  isFetchingFurigana,
}: FullScreenPortalProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimeoutRef = useRef<number | null>(null);
  const isOffline = useOffline();

  // Track if user has interacted to enable gesture handling after first interaction
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // Detect mobile Safari for gesture control
  const isMobileSafariDevice = useMemo(() => isMobileSafari(), []);

  // Translation languages with translated labels
  const translationLanguages = useMemo(
    () =>
      TRANSLATION_LANGUAGES.map((lang) => ({
        label: lang.labelKey ? t(lang.labelKey) : lang.label || "",
        code: lang.code,
      })),
    [t]
  );

  // Helper function to get actual player playing state
  const getActualPlayerState = useCallback(() => {
    const internalPlayer = fullScreenPlayerRef?.current?.getInternalPlayer?.();
    if (internalPlayer && typeof internalPlayer.getPlayerState === "function") {
      const playerState = internalPlayer.getPlayerState();
      // YouTube player states: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
      return playerState === 1;
    }
    return false;
  }, [fullScreenPlayerRef]);

  // Helper function to restart the auto-hide timer
  const restartAutoHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    // Only start hide timer when playing and menu is closed
    const actuallyPlaying = getActualPlayerState();
    if (actuallyPlaying && !isLangMenuOpen) {
      hideControlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 2000);
    }
  }, [getActualPlayerState, isLangMenuOpen]);

  // Use refs to store the latest values, avoiding stale closures
  const handlersRef = useRef<{
    onClose: () => void;
    togglePlay: () => void;
    nextTrack: () => void;
    previousTrack: () => void;
    seekTime: (delta: number) => void;
    showStatus: (message: string) => void;
    registerActivity: () => void;
    onSelectTranslation: (code: string | null) => void;
    onCycleAlignment: () => void;
    onCycleLyricsFont: () => void;
    onToggleKoreanDisplay: () => void;
    onToggleJapaneseFurigana: () => void;
    setIsLangMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  }>({
    onClose,
    togglePlay,
    nextTrack,
    previousTrack,
    seekTime,
    showStatus,
    registerActivity,
    onSelectTranslation,
    onCycleAlignment,
    onCycleLyricsFont,
    onToggleKoreanDisplay,
    onToggleJapaneseFurigana,
    setIsLangMenuOpen,
  });

  // Update refs whenever props change
  useEffect(() => {
    handlersRef.current = {
      onClose,
      togglePlay,
      nextTrack,
      previousTrack,
      seekTime,
      showStatus,
      registerActivity,
      onSelectTranslation,
      onCycleAlignment,
      onCycleLyricsFont,
      onToggleKoreanDisplay,
      onToggleJapaneseFurigana,
      setIsLangMenuOpen,
    };
  }, [
    onClose,
    togglePlay,
    nextTrack,
    previousTrack,
    seekTime,
    showStatus,
    registerActivity,
    onSelectTranslation,
    onCycleAlignment,
    onCycleLyricsFont,
    onToggleKoreanDisplay,
    onToggleJapaneseFurigana,
  ]);

  // Touch handling for swipe gestures
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null
  );

  // Stable event handlers using refs
  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      // Don't handle touches on toolbar elements
      const target = e.target as HTMLElement;
      if (target.closest("[data-toolbar]")) {
        return;
      }

      // Track user interaction
      if (!hasUserInteracted) {
        setHasUserInteracted(true);
      }

      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
    },
    [hasUserInteracted]
  );

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!touchStartRef.current) return;

      // Don't handle touches on toolbar elements
      const target = e.target as HTMLElement;
      if (target.closest("[data-toolbar]")) {
        touchStartRef.current = null;
        return;
      }

      // On mobile Safari, when not playing and after first interaction,
      // disable gesture handling to let YouTube player be interactive
      const shouldDisableGestures =
        isMobileSafariDevice && !isPlaying && hasUserInteracted;

      if (shouldDisableGestures) {
        touchStartRef.current = null;
        return;
      }

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      const deltaTime = Date.now() - touchStartRef.current.time;

      // Check if this qualifies as a horizontal swipe
      const isHorizontalSwipe =
        Math.abs(deltaX) > SWIPE_THRESHOLD &&
        Math.abs(deltaY) < MAX_VERTICAL_DRIFT &&
        deltaTime < MAX_SWIPE_TIME;

      // Check if this qualifies as a downward swipe to close fullscreen
      const isDownwardSwipe =
        deltaY > SWIPE_THRESHOLD &&
        Math.abs(deltaX) < MAX_VERTICAL_DRIFT &&
        deltaTime < MAX_SWIPE_TIME;

      if (isHorizontalSwipe) {
        e.preventDefault();
        const handlers = handlersRef.current;
        handlers.registerActivity();

        if (deltaX > 0) {
          // Swipe right - previous track
          handlers.previousTrack();
          setTimeout(() => {
            const currentTrackIndex = useIpodStore.getState().currentIndex;
            const currentTrack =
              useIpodStore.getState().tracks[currentTrackIndex];
            if (currentTrack) {
              const artistInfo = currentTrack.artist
                ? ` - ${currentTrack.artist}`
                : "";
              handlers.showStatus(`⏮ ${currentTrack.title}${artistInfo}`);
            }
          }, 100);
        } else {
          // Swipe left - next track
          handlers.nextTrack();
          setTimeout(() => {
            const currentTrackIndex = useIpodStore.getState().currentIndex;
            const currentTrack =
              useIpodStore.getState().tracks[currentTrackIndex];
            if (currentTrack) {
              const artistInfo = currentTrack.artist
                ? ` - ${currentTrack.artist}`
                : "";
              handlers.showStatus(`⏭ ${currentTrack.title}${artistInfo}`);
            }
          }, 100);
        }
      } else if (isDownwardSwipe) {
        e.preventDefault();
        handlersRef.current.onClose();
      }

      touchStartRef.current = null;
    },
    [isMobileSafariDevice, isPlaying, hasUserInteracted]
  );

  // Effect to request fullscreen when component mounts
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.requestFullscreen().catch((err) => {
          console.error("Error attempting to enable fullscreen:", err);
        });
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, []);

  const translationBadge = useMemo(
    () => getTranslationBadge(currentTranslationCode),
    [currentTranslationCode]
  );

  // Set up touch event listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("touchstart", handleTouchStart);
    container.addEventListener("touchend", handleTouchEnd);

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchEnd]);

  // Auto-hide controls after inactivity
  useEffect(() => {
    const handleActivity = () => {
      if (!hasUserInteracted) {
        setHasUserInteracted(true);
      }

      const actuallyPlaying = getActualPlayerState();
      const shouldSkipActivity =
        isMobileSafariDevice && !actuallyPlaying && hasUserInteracted;

      if (!shouldSkipActivity) {
        handlersRef.current.registerActivity();
      }

      setShowControls(true);
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
      if (actuallyPlaying && !isLangMenuOpen) {
        hideControlsTimeoutRef.current = window.setTimeout(() => {
          setShowControls(false);
        }, 2000);
      }
    };

    const actuallyPlaying = getActualPlayerState();
    if (isLangMenuOpen || !actuallyPlaying) setShowControls(true);

    window.addEventListener("mousemove", handleActivity, { passive: true });
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("touchstart", handleActivity, { passive: true });
    window.addEventListener("click", handleActivity, { passive: true });

    const actuallyPlayingOnMount = getActualPlayerState() || isPlaying;
    if (actuallyPlayingOnMount && !isLangMenuOpen) {
      hideControlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 2000);
    }

    return () => {
      window.removeEventListener("mousemove", handleActivity as EventListener);
      window.removeEventListener("keydown", handleActivity as EventListener);
      window.removeEventListener("touchstart", handleActivity as EventListener);
      window.removeEventListener("click", handleActivity as EventListener);
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
        hideControlsTimeoutRef.current = null;
      }
    };
  }, [
    isLangMenuOpen,
    isPlaying,
    hasUserInteracted,
    isMobileSafariDevice,
    getActualPlayerState,
  ]);

  // Close full screen with Escape key and other keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const handlers = handlersRef.current;
      handlers.registerActivity();

      if (e.key === "Escape") {
        handlers.onClose();
      } else if (e.key === " ") {
        e.preventDefault();
        if (isOffline) {
          showOfflineStatus();
        } else {
          handlers.togglePlay();
          handlers.showStatus(isPlaying ? "⏸" : "▶");
        }
      } else if (e.key === "ArrowLeft") {
        handlers.seekTime(-5);
      } else if (e.key === "ArrowRight") {
        handlers.seekTime(5);
      } else if (e.key === "ArrowUp") {
        handlers.previousTrack();
        setTimeout(() => {
          const currentTrackIndex = useIpodStore.getState().currentIndex;
          const currentTrack =
            useIpodStore.getState().tracks[currentTrackIndex];
          if (currentTrack) {
            const artistInfo = currentTrack.artist
              ? ` - ${currentTrack.artist}`
              : "";
            handlers.showStatus(`⏮ ${currentTrack.title}${artistInfo}`);
          }
        }, 800);
      } else if (e.key === "ArrowDown") {
        handlers.nextTrack();
        setTimeout(() => {
          const currentTrackIndex = useIpodStore.getState().currentIndex;
          const currentTrack =
            useIpodStore.getState().tracks[currentTrackIndex];
          if (currentTrack) {
            const artistInfo = currentTrack.artist
              ? ` - ${currentTrack.artist}`
              : "";
            handlers.showStatus(`⏭ ${currentTrack.title}${artistInfo}`);
          }
        }, 800);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, isOffline, showOfflineStatus]);

  return createPortal(
    <div
      ref={containerRef}
      className="ipod-force-font fixed inset-0 z-[9999] bg-black select-none flex flex-col"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("[data-toolbar]")) {
          return;
        }

        if (!hasUserInteracted) {
          setHasUserInteracted(true);
        }

        const actuallyPlaying = getActualPlayerState();
        const shouldDisableClick =
          isMobileSafariDevice && !actuallyPlaying && hasUserInteracted;

        if (!shouldDisableClick && !actuallyPlaying) {
          const handlers = handlersRef.current;
          handlers.registerActivity();
          if (isOffline) {
            showOfflineStatus();
          } else {
            handlers.togglePlay();
            handlers.showStatus("▶");
          }
        }

        // Handle mobile Safari special case
        if (isMobileSafariDevice && isPlaying && hasUserInteracted) {
          const internalPlayer =
            fullScreenPlayerRef?.current?.getInternalPlayer?.();
          if (
            internalPlayer &&
            typeof internalPlayer.getPlayerState === "function"
          ) {
            const playerState = internalPlayer.getPlayerState();
            if (playerState !== 1) {
              const handlers = handlersRef.current;
              handlers.registerActivity();
              if (typeof internalPlayer.playVideo === "function") {
                internalPlayer.playVideo();
                handlers.showStatus("▶");
              }
            }
          }
        }
      }}
    >
      {/* Status Display */}
      <AnimatePresence>
        {statusMessage && (
          <motion.div
            className="absolute inset-0 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div
              className="absolute pointer-events-none"
              style={{
                top: "calc(max(env(safe-area-inset-top), 0.75rem) + clamp(1rem, 6dvh, 3rem))",
                left: "calc(max(env(safe-area-inset-left), 0.75rem) + clamp(1rem, 6dvw, 4rem))",
              }}
            >
              <div className="relative">
                <div className="font-chicago text-white text-[min(5vw,5vh)] relative z-10">
                  {statusMessage}
                </div>
                <div
                  className="font-chicago text-black text-[min(5vw,5vh)] absolute inset-0"
                  style={{ WebkitTextStroke: "5px black", textShadow: "none" }}
                >
                  {statusMessage}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Activity Indicator */}
      <AnimatePresence>
        {(isLoadingLyrics || isProcessingLyrics || isFetchingFurigana) && (
          <motion.div
            className="absolute z-40 pointer-events-none"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            style={{
              top: "calc(max(env(safe-area-inset-top), 0.75rem) + clamp(1rem, 6dvh, 3rem))",
              right:
                "calc(max(env(safe-area-inset-right), 0.75rem) + clamp(1rem, 6dvw, 4rem))",
            }}
          >
            <ActivityIndicator
              size="lg"
              className="w-[min(6vw,6vh)] h-[min(6vw,6vh)] text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 min-h-0">
        {typeof children === "function"
          ? (
              children as (ctx: {
                controlsVisible: boolean;
                isLangMenuOpen: boolean;
              }) => React.ReactNode
            )({
              controlsVisible:
                showControls || isLangMenuOpen || !getActualPlayerState(),
              isLangMenuOpen,
            })
          : children}
      </div>

      {/* Inline toolbar */}
      <div
        data-toolbar
        className={cn(
          "w-full flex justify-center z-[10001] transition-opacity duration-200",
          showControls || isLangMenuOpen || !getActualPlayerState()
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        )}
        style={{
          paddingBottom:
            "calc(max(env(safe-area-inset-bottom), 0.75rem) + clamp(1rem, 6dvh, 4rem))",
        }}
        onClick={(e) => {
          e.stopPropagation();
          restartAutoHideTimer();
        }}
      >
        <div className="relative">
          <div className="bg-neutral-800/35 border border-white/10 backdrop-blur-sm rounded-full shadow-lg flex items-center gap-1 md:gap-2 px-2 py-1 font-geneva-12">
            {/* Transport controls */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                registerActivity();
                previousTrack();
                setTimeout(() => {
                  const currentTrackIndex =
                    useIpodStore.getState().currentIndex;
                  const currentTrack =
                    useIpodStore.getState().tracks[currentTrackIndex];
                  if (currentTrack) {
                    const artistInfo = currentTrack.artist
                      ? ` - ${currentTrack.artist}`
                      : "";
                    showStatus(`⏮ ${currentTrack.title}${artistInfo}`);
                  }
                }, 100);
              }}
              aria-label={t("apps.ipod.ariaLabels.previousTrack")}
              className="w-9 h-9 md:w-12 md:h-12 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
              title={t("apps.ipod.menu.previous")}
            >
              <span className="text-[18px] md:text-[22px]">⏮</span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                registerActivity();
                const wasPlaying = getActualPlayerState();
                if (isOffline) {
                  showOfflineStatus();
                } else {
                  togglePlay();
                  const actuallyPlaying = getActualPlayerState();
                  showStatus(actuallyPlaying ? "⏸" : "▶");
                  if (!wasPlaying) {
                    setTimeout(() => restartAutoHideTimer(), 100);
                  }
                }
              }}
              aria-label={t("apps.ipod.ariaLabels.playPause")}
              className="w-9 h-9 md:w-12 md:h-12 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
              title={t("apps.ipod.ariaLabels.playPause")}
            >
              <span className="text-[18px] md:text-[22px]">
                {getActualPlayerState() ? "⏸" : "▶"}
              </span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                registerActivity();
                nextTrack();
                setTimeout(() => {
                  const currentTrackIndex =
                    useIpodStore.getState().currentIndex;
                  const currentTrack =
                    useIpodStore.getState().tracks[currentTrackIndex];
                  if (currentTrack) {
                    const artistInfo = currentTrack.artist
                      ? ` - ${currentTrack.artist}`
                      : "";
                    showStatus(`⏭ ${currentTrack.title}${artistInfo}`);
                  }
                }, 100);
              }}
              aria-label={t("apps.ipod.ariaLabels.nextTrack")}
              className="w-9 h-9 md:w-12 md:h-12 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
              title={t("apps.ipod.menu.next")}
            >
              <span className="text-[18px] md:text-[22px]">⏭</span>
            </button>

            {/* Layout button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                registerActivity();
                onCycleAlignment();
              }}
              aria-label={t("apps.ipod.ariaLabels.cycleLyricLayout")}
              className="w-9 h-9 md:w-12 md:h-12 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
              title={currentAlignment}
            >
              {currentAlignment === "focusThree" ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="md:w-[26px] md:h-[26px]"
                >
                  <line x1="6" y1="6" x2="18" y2="6" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="6" y1="18" x2="18" y2="18" />
                </svg>
              ) : currentAlignment === "center" ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="md:w-[26px] md:h-[26px]"
                >
                  <line x1="6" y1="12" x2="18" y2="12" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="md:w-[26px] md:h-[26px]"
                >
                  <line x1="4" y1="8" x2="13" y2="8" />
                  <line x1="11" y1="16" x2="20" y2="16" />
                </svg>
              )}
            </button>

            {/* Font style toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                registerActivity();
                onCycleLyricsFont();
              }}
              aria-label={t("apps.ipod.ariaLabels.cycleLyricFont")}
              className="w-9 h-9 md:w-12 md:h-12 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
              title={currentLyricsFont}
            >
              <span className="text-[16px] md:text-[18px]">
                {currentLyricsFont === LyricsFont.Rounded
                  ? "丸"
                  : currentLyricsFont === LyricsFont.Serif
                  ? "明"
                  : "ゴ"}
              </span>
            </button>

            {/* Hangul toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                registerActivity();
                onToggleKoreanDisplay();
              }}
              aria-label={t("apps.ipod.ariaLabels.toggleHangulRomanization")}
              className="w-9 h-9 md:w-12 md:h-12 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
            >
              <span className="text-[16px] md:text-[18px]">
                {currentKoreanDisplay === "romanized" ? "Ko" : "한"}
              </span>
            </button>

            {/* Translate button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsLangMenuOpen((v) => !v);
                registerActivity();
              }}
              aria-label={t("apps.ipod.ariaLabels.translateLyrics")}
              className="w-9 h-9 md:w-12 md:h-12 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
            >
              {translationBadge ? (
                <span className="inline-flex items-center justify-center w-[24px] h-[24px] md:w-[28px] md:h-[28px] leading-none text-[16px] md:text-[18px]">
                  {translationBadge}
                </span>
              ) : (
                <span className="inline-flex items-center justify-center w-[24px] h-[24px] md:w-[28px] md:h-[28px] leading-none text-[16px] md:text-[18px]">
                  Aa
                </span>
              )}
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="w-9 h-9 md:w-12 md:h-12 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
              aria-label={t("apps.ipod.ariaLabels.closeFullscreen")}
              title={t("common.dialog.close")}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
                className="md:w-[26px] md:h-[26px]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          {/* Translation menu */}
          <AnimatePresence>
            {isLangMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 max-h-[50vh] overflow-y-auto rounded-lg border border-white/10 bg-neutral-900/80 backdrop-blur-md shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="py-2">
                  {translationLanguages.map((lang) => {
                    const selected =
                      currentTranslationCode === lang.code ||
                      (!lang.code && !currentTranslationCode);
                    return (
                      <button
                        key={lang.code || "off"}
                        onClick={() => {
                          handlersRef.current.onSelectTranslation(lang.code);
                          handlersRef.current.setIsLangMenuOpen(false);
                          handlersRef.current.registerActivity();
                        }}
                        className={cn(
                          "w-full text-left px-4 py-2 text-[16px] font-geneva-12 transition-colors",
                          selected
                            ? "text-white bg-white/10"
                            : "text-white/80 hover:text-white hover:bg-white/10"
                        )}
                      >
                        <span className="inline-block w-4">
                          {selected ? "✓" : ""}
                        </span>
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
    </div>,
    document.body
  );
}
