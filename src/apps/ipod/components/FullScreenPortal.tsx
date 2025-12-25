import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { useIpodStore } from "@/stores/useIpodStore";
import { useOffline } from "@/hooks/useOffline";
import { useTranslation } from "react-i18next";
import { isMobileSafari } from "@/utils/device";
import {
  TRANSLATION_LANGUAGES,
  SWIPE_THRESHOLD,
  MAX_SWIPE_TIME,
  MAX_VERTICAL_DRIFT,
} from "../constants";
import { FullscreenPlayerControls } from "@/components/shared/FullscreenPlayerControls";
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
  romanization,
  onRomanizationChange,
  onSyncMode,
  isSyncModeOpen,
  syncModeContent,
  fullScreenPlayerRef,
  isLoadingLyrics,
  isProcessingLyrics,
  isFetchingFurigana,
}: FullScreenPortalProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const [isPronunciationMenuOpen, setIsPronunciationMenuOpen] = useState(false);
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
        separator: lang.separator,
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
    // Only start hide timer when playing and menus are closed
    const actuallyPlaying = getActualPlayerState();
    if (actuallyPlaying && !isLangMenuOpen && !isPronunciationMenuOpen) {
      hideControlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 2000);
    }
  }, [getActualPlayerState, isLangMenuOpen, isPronunciationMenuOpen]);

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
  ]);

  // Touch handling for swipe gestures
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null
  );

  // Stable event handlers using refs
  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      // Don't handle touches on toolbar or lyrics elements
      const target = e.target as HTMLElement;
      if (target.closest("[data-toolbar]") || target.closest("[data-lyrics]")) {
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

      // Don't handle touches on toolbar or lyrics elements
      const target = e.target as HTMLElement;
      if (target.closest("[data-toolbar]") || target.closest("[data-lyrics]")) {
        touchStartRef.current = null;
        return;
      }

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      const deltaTime = Date.now() - touchStartRef.current.time;

      // Check if this qualifies as a vertical swipe (song navigation)
      const isVerticalSwipe =
        Math.abs(deltaY) > SWIPE_THRESHOLD &&
        Math.abs(deltaX) < MAX_VERTICAL_DRIFT &&
        deltaTime < MAX_SWIPE_TIME;

      if (isVerticalSwipe) {
        e.preventDefault();
        const handlers = handlersRef.current;
        handlers.registerActivity();

        if (deltaY < 0) {
          // Swipe up - next track (parent callback handles status)
          handlers.nextTrack();
        } else {
          // Swipe down - previous track (parent callback handles status)
          handlers.previousTrack();
        }
      }

      touchStartRef.current = null;
    },
    []
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

  // Wrapped handlers for fullscreen controls
  const handlePrevious = useCallback(() => {
    registerActivity();
    // Parent handles the status message (knows which store to use)
    handlersRef.current.previousTrack();
  }, [registerActivity]);

  const handlePlayPause = useCallback(() => {
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
  }, [registerActivity, getActualPlayerState, isOffline, showOfflineStatus, togglePlay, showStatus, restartAutoHideTimer]);

  const handleNext = useCallback(() => {
    registerActivity();
    // Parent handles the status message (knows which store to use)
    handlersRef.current.nextTrack();
  }, [registerActivity]);

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
  const anyMenuOpen = isLangMenuOpen || isPronunciationMenuOpen;
  
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
      if (actuallyPlaying && !anyMenuOpen) {
        hideControlsTimeoutRef.current = window.setTimeout(() => {
          setShowControls(false);
        }, 2000);
      }
    };

    const actuallyPlaying = getActualPlayerState();
    if (anyMenuOpen || !actuallyPlaying) setShowControls(true);

    window.addEventListener("mousemove", handleActivity, { passive: true });
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("touchstart", handleActivity, { passive: true });
    window.addEventListener("click", handleActivity, { passive: true });

    const actuallyPlayingOnMount = getActualPlayerState() || isPlaying;
    if (actuallyPlayingOnMount && !anyMenuOpen) {
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
    anyMenuOpen,
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
        // Parent callback handles status message (knows which store to use)
        handlers.previousTrack();
      } else if (e.key === "ArrowDown") {
        // Parent callback handles status message (knows which store to use)
        handlers.nextTrack();
      } else if (e.key === "[" || e.key === "]") {
        // Offset adjustment: [ = lyrics earlier (negative), ] = lyrics later (positive)
        const delta = e.key === "[" ? -50 : 50;
        const store = useIpodStore.getState();
        const currentTrackIndex = store.currentIndex;
        const currentTrack = store.tracks[currentTrackIndex];
        store.adjustLyricOffset(currentTrackIndex, delta);
        const newOffset = (currentTrack?.lyricOffset ?? 0) + delta;
        const sign = newOffset > 0 ? "+" : newOffset < 0 ? "" : "";
        handlers.showStatus(`${t("apps.ipod.status.offset")} ${sign}${(newOffset / 1000).toFixed(2)}s`);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, isOffline, showOfflineStatus, t]);

  return createPortal(
    <div
      ref={containerRef}
      className="ipod-force-font fixed inset-0 z-[9999] bg-black select-none flex flex-col"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("[data-toolbar]")) {
          return;
        }
        // Don't handle clicks on lyrics (let them handle their own click events for seeking)
        if (target.closest("[data-lyrics]")) {
          return;
        }

        if (!hasUserInteracted) {
          setHasUserInteracted(true);
        }

        const actuallyPlaying = getActualPlayerState();
        const handlers = handlersRef.current;
        handlers.registerActivity();
        
        if (isOffline) {
          showOfflineStatus();
        } else {
          // Always allow play/pause toggle, even on mobile Safari when paused
          handlers.togglePlay();
          handlers.showStatus(actuallyPlaying ? "⏸" : "▶");
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
                  showControls || anyMenuOpen || !getActualPlayerState(),
                isLangMenuOpen,
            })
          : children}
      </div>

      {/* Spacer for fixed toolbar */}
      <div 
        className="flex-shrink-0"
        style={{
          height: "calc(env(safe-area-inset-bottom, 0px) + 48px)",
        }}
      />

      {/* Inline toolbar */}
      <div
        data-toolbar
        className={cn(
          "fixed bottom-0 left-0 right-0 flex justify-center z-[10001] transition-opacity duration-200",
          showControls || anyMenuOpen || !getActualPlayerState()
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        )}
        style={{
          paddingBottom:
            "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)",
        }}
        onClick={(e) => {
          e.stopPropagation();
          restartAutoHideTimer();
        }}
      >
        <FullscreenPlayerControls
          isPlaying={getActualPlayerState()}
          onPrevious={handlePrevious}
          onPlayPause={handlePlayPause}
          onNext={handleNext}
          onSyncMode={onSyncMode}
          currentAlignment={currentAlignment}
          onAlignmentCycle={onCycleAlignment}
          currentFont={currentLyricsFont}
          onFontCycle={onCycleLyricsFont}
          romanization={romanization}
          onRomanizationChange={onRomanizationChange}
          isPronunciationMenuOpen={isPronunciationMenuOpen}
          setIsPronunciationMenuOpen={setIsPronunciationMenuOpen}
          currentTranslationCode={currentTranslationCode}
          onTranslationSelect={onSelectTranslation}
          translationLanguages={translationLanguages}
          isLangMenuOpen={isLangMenuOpen}
          setIsLangMenuOpen={setIsLangMenuOpen}
          onClose={onClose}
          variant="responsive"
          bgOpacity="35"
          onInteraction={registerActivity}
          portalContainer={containerRef.current}
        />
      </div>

      {/* Sync Mode floating panel */}
      <AnimatePresence>
        {isSyncModeOpen && syncModeContent && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8 pointer-events-none"
            style={{
              paddingTop: "env(safe-area-inset-top, 0px)",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 100px)",
              paddingLeft: "env(safe-area-inset-left, 0px)",
              paddingRight: "env(safe-area-inset-right, 0px)",
            }}
          >
            <div 
              className="relative w-full max-w-md h-[70vh] max-h-[600px] rounded-2xl overflow-hidden shadow-2xl bg-black/90 pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {syncModeContent}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  );
}
