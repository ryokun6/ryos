import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactPlayer from "react-player";
import { cn } from "@/lib/utils";
import { AppProps, IpodInitialData } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { IpodMenuBar } from "./IpodMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { helpItems, appMetadata } from "..";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useSound, Sounds } from "@/hooks/useSound";
import { useVibration } from "@/hooks/useVibration";
import { IpodScreen } from "./IpodScreen";
import { IpodWheel } from "./IpodWheel";
import { useIpodStore, Track } from "@/stores/useIpodStore";
import { useShallow } from "zustand/react/shallow";
import { useIpodStoreShallow, useAppStoreShallow } from "@/stores/helpers";
import { useAppStore } from "@/stores/useAppStore";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { LyricsSearchDialog } from "@/components/dialogs/LyricsSearchDialog";
import { toast } from "sonner";
import { createPortal } from "react-dom";
import { LyricsDisplay } from "./LyricsDisplay";
import { useLyrics } from "@/hooks/useLyrics";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { useLibraryUpdateChecker } from "../hooks/useLibraryUpdateChecker";
import { useThemeStore } from "@/stores/useThemeStore";
import { LyricsAlignment, KoreanDisplay, JapaneseFurigana } from "@/types/lyrics";
import { isMobileSafari } from "@/utils/device";
import { track } from "@vercel/analytics";
import { getTranslatedAppName } from "@/utils/i18n";
import { IPOD_ANALYTICS } from "@/utils/analytics";
import { useOffline } from "@/hooks/useOffline";
import { useTranslation } from "react-i18next";
import { useIsPhone } from "@/hooks/useIsPhone";
// Globe icon removed; using text label "Aあ" for translate

// Helper to extract YouTube video ID from URL
function getYouTubeVideoId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/
  );
  return match ? match[1] : null;
}

// PIP Player component - shown when iPod is minimized
interface PipPlayerProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onNextTrack: () => void;
  onPreviousTrack: () => void;
  onRestore: () => void;
}

function PipPlayer({
  currentTrack,
  isPlaying,
  onTogglePlay,
  onNextTrack,
  onPreviousTrack,
  onRestore,
}: PipPlayerProps) {
  const { t } = useTranslation();
  const isOffline = useOffline();
  const currentTheme = useThemeStore((state) => state.current);
  const isPhone = useIsPhone();

  // Calculate bottom offset based on theme (similar to Sonner positioning)
  const bottomOffset = useMemo(() => {
    const isWindowsTheme = currentTheme === "xp" || currentTheme === "win98";
    if (isWindowsTheme) {
      // Windows themes: taskbar height (30px) + padding
      return "calc(env(safe-area-inset-bottom, 0px) + 42px)";
    } else if (currentTheme === "macosx") {
      // macOS X: dock height (56px) + padding
      return "calc(env(safe-area-inset-bottom, 0px) + 72px)";
    } else {
      // System 7 and others: just safe area + small padding
      return "calc(env(safe-area-inset-bottom, 0px) + 16px)";
    }
  }, [currentTheme]);

  // Get thumbnail URL from YouTube video
  const thumbnailUrl = currentTrack?.url
    ? (() => {
        const videoId = getYouTubeVideoId(currentTrack.url);
        return videoId
          ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
          : null;
      })()
    : null;

  // Determine horizontal positioning based on theme
  const isMacOSX = currentTheme === "macosx";
  // On phones, match the dock's centered width + side padding/margins
  const shouldCenter = isPhone || isMacOSX;

  return createPortal(
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.9, x: shouldCenter ? "-50%" : 0 }}
      animate={{ opacity: 1, y: 0, scale: 1, x: shouldCenter ? "-50%" : 0 }}
      exit={{ opacity: 0, y: 20, scale: 0.9, x: shouldCenter ? "-50%" : 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        // Keep PiP below normal application windows (AppManager windows start at z-index 2+)
        "fixed z-[1] flex items-center gap-3 bg-black/40 backdrop-blur-xl rounded-xl shadow-2xl p-2 pr-3 cursor-pointer select-none",
        shouldCenter ? "left-1/2" : "right-3"
      )}
      style={{ 
        ...(isPhone
          ? {
              // Match Dock.tsx: maxWidth = min(92vw, 980px) and centered
              width: "min(92vw, 980px)",
              maxWidth: "min(92vw, 980px)",
            }
          : {
              maxWidth: "min(400px, calc(100vw - 2rem))",
            }),
        bottom: bottomOffset,
      }}
      onClick={onRestore}
    >
      {/* Thumbnail */}
      <div className="relative w-14 h-14 flex-shrink-0 overflow-hidden" style={{ borderRadius: '8px' }}>
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={currentTrack?.title || ""}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/10 text-white/40">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </div>
        )}
        {/* Playing indicator overlay */}
        {isPlaying && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <div className="flex items-end gap-[2px] h-4">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-1 bg-white rounded-full"
                  animate={{
                    height: ["40%", "100%", "40%"],
                  }}
                  transition={{
                    duration: 0.6,
                    repeat: Infinity,
                    delay: i * 0.15,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Track Info */}
      <div className="flex-1 min-w-0 mr-1">
        <div className="text-white text-sm font-medium truncate">
          {currentTrack?.title || t("apps.ipod.status.noTrack")}
        </div>
        {currentTrack?.artist && (
          <div className="text-white/60 text-xs truncate">
            {currentTrack.artist}
          </div>
        )}
      </div>

      {/* Controls */}
      <div
        className="flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <button
          onClick={onPreviousTrack}
          onTouchStart={(e) => e.stopPropagation()}
          className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors touch-manipulation"
          aria-label={t("apps.ipod.ariaLabels.previousTrack")}
        >
          <span className="text-sm font-chicago">⏮</span>
        </button>

        <button
          onClick={onTogglePlay}
          onTouchStart={(e) => e.stopPropagation()}
          disabled={isOffline}
          className="w-9 h-9 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 touch-manipulation"
          aria-label={t("apps.ipod.ariaLabels.playPause")}
        >
          <span className="text-base font-chicago">{isPlaying ? "⏸" : "▶"}</span>
        </button>

        <button
          onClick={onNextTrack}
          onTouchStart={(e) => e.stopPropagation()}
          className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors touch-manipulation"
          aria-label={t("apps.ipod.ariaLabels.nextTrack")}
        >
          <span className="text-sm font-chicago">⏭</span>
        </button>
      </div>
    </motion.div>,
    document.body
  );
}

// Add this component definition before the IpodAppComponent
interface FullScreenPortalProps {
  children:
    | React.ReactNode
    | ((ctx: {
        controlsVisible: boolean;
        isLangMenuOpen: boolean;
      }) => React.ReactNode);
  onClose: () => void;
  togglePlay: () => void;
  nextTrack: () => void;
  previousTrack: () => void;
  seekTime: (delta: number) => void;
  showStatus: (message: string) => void;
  showOfflineStatus: () => void;
  registerActivity: () => void;
  isPlaying: boolean;
  statusMessage: string | null;
  // Fullscreen lyrics controls
  currentTranslationCode: string | null;
  onSelectTranslation: (code: string | null) => void;
  currentAlignment: import("@/types/lyrics").LyricsAlignment;
  onCycleAlignment: () => void;
  currentKoreanDisplay: import("@/types/lyrics").KoreanDisplay;
  onToggleKoreanDisplay: () => void;
  currentJapaneseFurigana: import("@/types/lyrics").JapaneseFurigana;
  onToggleJapaneseFurigana: () => void;
  // Player ref for mobile Safari handling
  fullScreenPlayerRef: React.RefObject<ReactPlayer | null>;
  // Lyrics loading state
  isLoadingLyrics?: boolean;
  isProcessingLyrics?: boolean;
}

function FullScreenPortal({
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
  currentKoreanDisplay,
  onToggleKoreanDisplay,
  currentJapaneseFurigana,
  onToggleJapaneseFurigana,
  fullScreenPlayerRef,
  isLoadingLyrics,
  isProcessingLyrics,
}: FullScreenPortalProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimeoutRef = useRef<number | null>(null);
  const isOffline = useOffline();
  // Removed pointer coarse check; controls now autohide on all devices
  
  // Track if user has interacted to enable gesture handling after first interaction
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  
  // Detect mobile Safari for gesture control
  const isMobileSafariDevice = useMemo(() => isMobileSafari(), []);

  // Translation languages (same set as menu bar)
  const translationLanguages = useMemo(
    () => [
      { label: t("apps.ipod.translationLanguages.original"), code: null as string | null },
      { label: "English", code: "en" },
      { label: "中文", code: "zh-TW" },
      { label: "日本語", code: "ja" },
      { label: "한국어", code: "ko" },
      { label: "Español", code: "es" },
      { label: "Français", code: "fr" },
      { label: "Deutsch", code: "de" },
      { label: "Português", code: "pt" },
      { label: "Italiano", code: "it" },
      { label: "Русский", code: "ru" },
    ],
    [t]
  );

  // Helper function to get actual player playing state
  const getActualPlayerState = useCallback(() => {
    const internalPlayer = fullScreenPlayerRef?.current?.getInternalPlayer?.();
    if (internalPlayer && typeof internalPlayer.getPlayerState === 'function') {
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
      // passthroughs for overlay controls
      onSelectTranslation,
      onCycleAlignment,
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
    onToggleKoreanDisplay,
    onToggleJapaneseFurigana,
  ]);

  // Touch handling for swipe gestures (left/right: navigate tracks, down: close fullscreen)
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null
  );
  const SWIPE_THRESHOLD = 80; // Minimum swipe distance
  const MAX_SWIPE_TIME = 500; // Maximum time for a swipe (ms)
  const MAX_VERTICAL_DRIFT = 100; // Maximum cross-directional drift to still count as intended swipe

  // Stable event handlers using refs (no dependencies to avoid re-rendering)
  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Don't handle touches on toolbar elements
    const target = e.target as HTMLElement;
    if (target.closest('[data-toolbar]')) {
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
  }, [hasUserInteracted]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!touchStartRef.current) return;

    // Don't handle touches on toolbar elements
    const target = e.target as HTMLElement;
    if (target.closest('[data-toolbar]')) {
      touchStartRef.current = null;
      return;
    }

    // On mobile Safari, when not playing and after first interaction, 
    // disable gesture handling to let YouTube player be interactive
    const shouldDisableGestures = isMobileSafariDevice && !isPlaying && hasUserInteracted;
    
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
      // Prevent default to avoid any conflicts
      e.preventDefault();

      const handlers = handlersRef.current;
      handlers.registerActivity();

      if (deltaX > 0) {
        // Swipe right - previous track
        handlers.previousTrack();
        // Show track info with symbol after small delay to allow state update
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
        // Show track info with symbol after small delay to allow state update
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
      // Swipe down - close fullscreen
      e.preventDefault();
      handlersRef.current.onClose();
    }

    touchStartRef.current = null;
  }, [isMobileSafariDevice, isPlaying, hasUserInteracted]);

  // Effect to request fullscreen when component mounts
  useEffect(() => {
    // Need a small delay to ensure the portal is mounted
    const timeoutId = setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.requestFullscreen().catch((err) => {
          console.error("Error attempting to enable fullscreen:", err);
        });
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, []);

  const translationBadge = useMemo(() => {
    if (!currentTranslationCode) return null;
    switch (currentTranslationCode) {
      case "zh-TW":
        return "中";
      case "en":
        return "En";
      case "ja":
        return "日";
      case "ko":
        return "한";
      case "es":
        return "Es"; // Español
      case "fr":
        return "Fr";
      case "de":
        return "De"; // Deutsch
      case "pt":
        return "Pt";
      case "it":
        return "It";
      case "ru":
        return "Ru";
      default:
        return currentTranslationCode[0]?.toUpperCase() ?? "?";
    }
  }, [currentTranslationCode]);

  // Effect to set up touch event listeners for swipe gestures
  // Now with stable handlers that don't change
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Use non-passive listeners so we can call preventDefault
    container.addEventListener("touchstart", handleTouchStart);
    container.addEventListener("touchend", handleTouchEnd);

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, []); // Empty dependency array - handlers are stable

  // Auto-hide controls after inactivity (desktop and mobile). Always visible when paused.
  useEffect(() => {
    const handleActivity = () => {
      // Track user interaction
      if (!hasUserInteracted) {
        setHasUserInteracted(true);
      }
      
      // Get actual player state for activity handling
      const actuallyPlaying = getActualPlayerState();
      
      // On mobile Safari, when not playing and after first interaction,
      // don't register activity to avoid interfering with YouTube player
      const shouldSkipActivity = isMobileSafariDevice && !actuallyPlaying && hasUserInteracted;
      
      if (!shouldSkipActivity) {
        handlersRef.current.registerActivity();
      }
      
      setShowControls(true);
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
      // Only start hide timer when playing and menu is closed
      if (actuallyPlaying && !isLangMenuOpen) {
        hideControlsTimeoutRef.current = window.setTimeout(() => {
          setShowControls(false);
        }, 2000);
      }
    };

    // Show when menu opens or when paused
    const actuallyPlaying = getActualPlayerState();
    if (isLangMenuOpen || !actuallyPlaying) setShowControls(true);

    window.addEventListener("mousemove", handleActivity, { passive: true });
    window.addEventListener("keydown", handleActivity);
    // Tap anywhere to reveal on touch devices
    window.addEventListener("touchstart", handleActivity, { passive: true });
    // Fallback for non-touch clicks
    window.addEventListener("click", handleActivity, { passive: true });

    // Prime the timer once on mount - use isPlaying prop as fallback since
    // the actual player state may not be ready yet when fullscreen first opens
    const actuallyPlayingOnMount = getActualPlayerState() || isPlaying;
    if (actuallyPlayingOnMount && !isLangMenuOpen) {
      // Start auto-hide countdown immediately if playing
      hideControlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 2000);
    }

    return () => {
      window.removeEventListener("mousemove", handleActivity as any);
      window.removeEventListener("keydown", handleActivity as any);
      window.removeEventListener("touchstart", handleActivity as any);
      window.removeEventListener("click", handleActivity as any);
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
        hideControlsTimeoutRef.current = null;
      }
    };
  }, [isLangMenuOpen, isPlaying, hasUserInteracted, isMobileSafariDevice, getActualPlayerState]);

  // Close full screen with Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const handlers = handlersRef.current;
      handlers.registerActivity();

      if (e.key === "Escape") {
        handlers.onClose();
      } else if (e.key === " ") {
        e.preventDefault(); // Prevent scrolling if space is pressed
        if (isOffline) {
          showOfflineStatus();
        } else {
          handlers.togglePlay();
          handlers.showStatus(isPlaying ? "⏸" : "▶");
        }
      } else if (e.key === "ArrowLeft") {
        // Seek backward instead of previous track
        handlers.seekTime(-5);
      } else if (e.key === "ArrowRight") {
        // Seek forward instead of next track
        handlers.seekTime(5);
      } else if (e.key === "ArrowUp") {
        // Use up arrow for previous track
        handlers.previousTrack();
        // Then show track info with symbol after a small delay to allow state update
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
        // Use down arrow for next track
        handlers.nextTrack();
        // Then show track info with symbol after a small delay to allow state update
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
  }, [isPlaying]); // Only isPlaying as dependency

  return createPortal(
    <div
      ref={containerRef}
      className="ipod-force-font fixed inset-0 z-[9999] bg-black select-none flex flex-col"
      onClick={(e) => {
        // Don't handle clicks that originate from toolbar elements
        const target = e.target as HTMLElement;
        if (target.closest('[data-toolbar]')) {
          return;
        }
        
        // Track user interaction
        if (!hasUserInteracted) {
          setHasUserInteracted(true);
        }
        
        // Get the actual playing state from the fullscreen player
        const actuallyPlaying = getActualPlayerState();
        
        // On mobile Safari, when not playing and after first interaction,
        // disable tap-to-play to let YouTube player be interactive
        const shouldDisableClick = isMobileSafariDevice && !actuallyPlaying && hasUserInteracted;
        
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
        
        // Special case: On mobile Safari, if we just entered fullscreen and expect to be playing
        // but the fullscreen player hasn't started yet, allow tap to start playback
        if (isMobileSafariDevice && isPlaying && hasUserInteracted) {
          // Check if the fullscreen player is actually playing
          const internalPlayer = fullScreenPlayerRef?.current?.getInternalPlayer?.();
          if (internalPlayer && typeof internalPlayer.getPlayerState === 'function') {
            const playerState = internalPlayer.getPlayerState();
            // YouTube player states: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
            if (playerState !== 1) { // Not playing
              const handlers = handlersRef.current;
              handlers.registerActivity();
              // Force start playback
              if (typeof internalPlayer.playVideo === 'function') {
                internalPlayer.playVideo();
                handlers.showStatus("▶");
              }
            }
          }
        }
      }}
    >
      {/* Toolbar moved into normal flow below children */}

      {/* Status Display - top left with minimal safe-area offsets */}
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

      {/* Activity Indicator - top right, aligned with status display */}
      <AnimatePresence>
        {(isLoadingLyrics || isProcessingLyrics) && (
          <motion.div
            className="absolute z-40 pointer-events-none"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            style={{
              top: "calc(max(env(safe-area-inset-top), 0.75rem) + clamp(1rem, 6dvh, 3rem))",
              right: "calc(max(env(safe-area-inset-right), 0.75rem) + clamp(1rem, 6dvw, 4rem))",
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
              controlsVisible: showControls || isLangMenuOpen || !getActualPlayerState(),
              isLangMenuOpen,
            })
          : children}
      </div>

      {/* Inline toolbar below lyrics, centered */}
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
          // Ensure toolbar clicks don't bubble up to container
          e.stopPropagation();
          // Restart auto-hide timer when tapping toolbar in fullscreen
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
                  // Use actual player state for status message
                  const actuallyPlaying = getActualPlayerState();
                  showStatus(actuallyPlaying ? "⏸" : "▶");
                  // Restart auto-hide timer when switching from pause to play
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

            {/* Furigana toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                registerActivity();
                onToggleJapaneseFurigana();
              }}
              aria-label={t("apps.ipod.ariaLabels.toggleFurigana")}
              className="w-9 h-9 md:w-12 md:h-12 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
              title={t("apps.ipod.menu.furigana")}
            >
              <span className="text-[16px] md:text-[18px]">
                {currentJapaneseFurigana === JapaneseFurigana.On ? "ふ" : "漢"}
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

          {/* Translation menu (opens upward above platter) */}
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

export function IpodAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  initialData,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps<IpodInitialData>) {
  const { play: playClickSound } = useSound(Sounds.BUTTON_CLICK);
  const { play: playScrollSound } = useSound(Sounds.IPOD_CLICK_WHEEL);
  const vibrate = useVibration(100, 50);
  const isOffline = useOffline();

  const {
    tracks,
    currentIndex,
    loopCurrent,
    loopAll,
    isShuffled,
    isPlaying,
    showVideo,
    backlightOn,
  } = useIpodStore(
    useShallow((s) => ({
      tracks: s.tracks,
      currentIndex: s.currentIndex,
      loopCurrent: s.loopCurrent,
      loopAll: s.loopAll,
      isShuffled: s.isShuffled,
      isPlaying: s.isPlaying,
      showVideo: s.showVideo,
      backlightOn: s.backlightOn,
    }))
  );
  const {
    theme,
    lcdFilterOn,
    showLyrics,
    lyricsAlignment,
    chineseVariant,
    koreanDisplay,
    japaneseFurigana,
    lyricsTranslationLanguage,
    isFullScreen,
    toggleFullScreen,
    setCurrentIndex,
    toggleLoopAll,
    toggleLoopCurrent,
    toggleShuffle,
    togglePlay,
    setIsPlaying,
    toggleVideo,
    toggleBacklight,
    setTheme,
    clearLibrary,
    nextTrack,
    previousTrack,
    refreshLyrics,
    setTrackLyricsSearch,
    clearTrackLyricsSearch,
  } = useIpodStoreShallow((s) => ({
    theme: s.theme,
    lcdFilterOn: s.lcdFilterOn,
    showLyrics: s.showLyrics,
    lyricsAlignment: s.lyricsAlignment,
    chineseVariant: s.chineseVariant,
    koreanDisplay: s.koreanDisplay,
    japaneseFurigana: s.japaneseFurigana,
    lyricsTranslationLanguage: s.lyricsTranslationLanguage,
    isFullScreen: s.isFullScreen,
    toggleFullScreen: s.toggleFullScreen,
    setCurrentIndex: s.setCurrentIndex,
    toggleLoopAll: s.toggleLoopAll,
    toggleLoopCurrent: s.toggleLoopCurrent,
    toggleShuffle: s.toggleShuffle,
    togglePlay: s.togglePlay,
    setIsPlaying: s.setIsPlaying,
    toggleVideo: s.toggleVideo,
    toggleBacklight: s.toggleBacklight,
    setTheme: s.setTheme,
    clearLibrary: s.clearLibrary,
    nextTrack: s.nextTrack,
    previousTrack: s.previousTrack,
    refreshLyrics: s.refreshLyrics,
    setTrackLyricsSearch: s.setTrackLyricsSearch,
    clearTrackLyricsSearch: s.clearTrackLyricsSearch,
  }));

  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("ipod", helpItems);
  const lyricOffset = useIpodStore(
    (s) => s.tracks[s.currentIndex]?.lyricOffset ?? 0
  );

  const prevIsForeground = useRef(isForeground);
  const { bringToForeground, clearIpodInitialData, instances, restoreInstance } = useAppStoreShallow(
    (state) => ({
      bringToForeground: state.bringToForeground,
      clearIpodInitialData: state.clearInstanceInitialData,
      instances: state.instances,
      restoreInstance: state.restoreInstance,
    })
  );
  // Track minimized state for this instance
  const isMinimized = instanceId ? instances[instanceId]?.isMinimized ?? false : false;
  // Track the last processed initialData to avoid duplicates
  const lastProcessedInitialDataRef = useRef<unknown>(null);

  const [lastActivityTime, setLastActivityTime] = useState(Date.now());
  const backlightTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [urlInput, setUrlInput] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);

  const [isAddingTrack, setIsAddingTrack] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isLyricsSearchDialogOpen, setIsLyricsSearchDialogOpen] = useState(false);

  // Always use rounded lyrics font in fullscreen

  const initialMenuMode = useMemo(() => {
    const storeState = useIpodStore.getState();
    // Default to Now Playing if there are tracks and a valid index
    return !(
      storeState.tracks.length > 0 &&
      storeState.currentIndex >= 0 &&
      storeState.currentIndex < storeState.tracks.length
    );
  }, []); // Empty dependency array means this runs once on mount

  const [menuMode, setMenuMode] = useState(initialMenuMode);
  const [selectedMenuItem, setSelectedMenuItem] = useState(0);
  const [menuDirection, setMenuDirection] = useState<"forward" | "backward">(
    "forward"
  );
  const [menuHistory, setMenuHistory] = useState<
    {
      title: string;
      items: {
        label: string;
        action: () => void;
        showChevron?: boolean;
        value?: string;
      }[];
      selectedIndex: number;
    }[]
  >([]);
  const [cameFromNowPlayingMenuItem, setCameFromNowPlayingMenuItem] =
    useState(false);
  // Ref for the in-window (small) player inside IpodScreen
  const playerRef = useRef<ReactPlayer | null>(null);
  // Separate ref for the full-screen player rendered in the portal
  const fullScreenPlayerRef = useRef<ReactPlayer | null>(null);
  // Ref to track the last song that was tracked for analytics
  const lastTrackedSongRef = useRef<{ trackId: string; elapsedTime: number } | null>(null);
  const skipOperationRef = useRef(false);
  const userHasInteractedRef = useRef(false);

  // Auto-update checker for library changes
  const { manualSync } = useLibraryUpdateChecker(
    isWindowOpen && (isForeground ?? false)
  );

  const ua = navigator.userAgent;
  const isIOS = /iP(hone|od|ad)/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);
  const isIOSSafari = isIOS && isSafari;

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
  }, [showStatus, t]);

  const registerActivity = useCallback(() => {
    setLastActivityTime(Date.now());
    userHasInteractedRef.current = true;
    if (!useIpodStore.getState().backlightOn) {
      toggleBacklight();
    }
  }, [toggleBacklight]);

  const memoizedToggleShuffle = useCallback(() => {
    toggleShuffle();
    showStatus(
      useIpodStore.getState().isShuffled ? t("apps.ipod.status.shuffleOn") : t("apps.ipod.status.shuffleOff")
    );
    registerActivity();
  }, [toggleShuffle, showStatus, registerActivity, t]);

  const memoizedToggleBacklight = useCallback(() => {
    toggleBacklight();
    const isOn = useIpodStore.getState().backlightOn;
    showStatus(isOn ? t("apps.ipod.status.lightOn") : t("apps.ipod.status.lightOff"));

    // Only call registerActivity when turning the backlight on to avoid
    // immediately re-enabling it after the user turns it off via the menu.
    if (isOn) {
      registerActivity();
    } else {
      // Mimic the parts of registerActivity that update activity tracking
      setLastActivityTime(Date.now());
      userHasInteractedRef.current = true;
    }
  }, [toggleBacklight, showStatus, registerActivity, setLastActivityTime, t]);

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
    [setTheme, showStatus, registerActivity, t]
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
  }, [registerActivity, toggleLoopAll, toggleLoopCurrent, showStatus, t]);

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

  useEffect(() => {
    if (backlightTimerRef.current) {
      clearTimeout(backlightTimerRef.current);
    }

    if (backlightOn) {
      backlightTimerRef.current = setTimeout(() => {
        const currentShowVideo = useIpodStore.getState().showVideo;
        const currentIsPlaying = useIpodStore.getState().isPlaying;
        if (
          Date.now() - lastActivityTime >= 5000 &&
          !(currentShowVideo && currentIsPlaying)
        ) {
          toggleBacklight();
        }
      }, 5000);
    }

    return () => {
      if (backlightTimerRef.current) {
        clearTimeout(backlightTimerRef.current);
      }
    };
  }, [backlightOn, lastActivityTime, toggleBacklight]);

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

  useEffect(() => {
    setElapsedTime(0);
    // Clear any previously fetched lyrics immediately when the track changes
    // so the AI chat doesn't use lyrics from the previous song as context
    useIpodStore.setState({ currentLyrics: null });
  }, [currentIndex]);

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  const [lastPlayedMenuPath, setLastPlayedMenuPath] = useState<string[]>([]);

  const musicMenuItems = useMemo(() => {
    // Group tracks by artist
    const tracksByArtist = tracks.reduce<
      Record<string, { track: (typeof tracks)[0]; index: number }[]>
    >(
      (
        acc: Record<string, { track: (typeof tracks)[0]; index: number }[]>,
        track: (typeof tracks)[0],
        index: number
      ) => {
        const artist = track.artist || t("apps.ipod.menu.unknownArtist");
        if (!acc[artist]) {
          acc[artist] = [];
        }
        acc[artist].push({ track, index });
        return acc;
      },
      {}
    );

    // Get sorted list of artists
    const artists = Object.keys(tracksByArtist).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );

    return [
      {
        label: t("apps.ipod.menuItems.allSongs"),
        action: () => {
          registerActivity();
          setMenuDirection("forward");
          const allSongsLabel = t("apps.ipod.menuItems.allSongs");
          const musicLabel = t("apps.ipod.menuItems.music");
          const allTracksMenu = tracks.map(
            (track: (typeof tracks)[0], index: number) => ({
              label: track.title,
              action: () => {
                registerActivity();
                if (isOffline) {
                  showOfflineStatus();
                  return;
                }
                setCurrentIndex(index);
                setIsPlaying(true);
                setMenuDirection("forward");
                setMenuMode(false);
                setCameFromNowPlayingMenuItem(false);
                setLastPlayedMenuPath([musicLabel, allSongsLabel]);
                if (useIpodStore.getState().showVideo) {
                  toggleVideo();
                }
              },
              showChevron: false,
            })
          );
          setMenuHistory((prev) => [
            ...prev,
            {
              title: allSongsLabel,
              items: allTracksMenu,
              selectedIndex: 0,
            },
          ]);
          setSelectedMenuItem(0);
        },
        showChevron: true,
      },
      ...artists.map((artist) => ({
        label: artist,
        action: () => {
          registerActivity();
          setMenuDirection("forward");
          const artistTracks = tracksByArtist[artist].map(
            ({
              track,
              index,
            }: {
              track: (typeof tracks)[0];
              index: number;
            }) => ({
              label: track.title,
              action: () => {
                registerActivity();
                setCurrentIndex(index);
                setIsPlaying(true);
                setMenuDirection("forward");
                setMenuMode(false);
                setCameFromNowPlayingMenuItem(false);
                setLastPlayedMenuPath([t("apps.ipod.menuItems.music"), artist]);
                if (useIpodStore.getState().showVideo) {
                  toggleVideo();
                }
              },
              showChevron: false,
            })
          );
          setMenuHistory((prev) => [
            ...prev,
            {
              title: artist,
              items: artistTracks,
              selectedIndex: 0,
            },
          ]);
          setSelectedMenuItem(0);
        },
        showChevron: true,
      })),
    ];
  }, [
    tracks,
    registerActivity,
    setCurrentIndex,
    setIsPlaying,
    toggleVideo,
    showStatus,
    t,
  ]);

  const settingsMenuItems = useMemo(() => {
    const currentLoopCurrent = loopCurrent;
    const currentLoopAll = loopAll;
    const currentIsShuffled = isShuffled;
    const currentBacklightOn = backlightOn;
    const currentTheme = theme;

    return [
      {
        label: t("apps.ipod.menuItems.repeat"),
        action: memoizedToggleRepeat,
        showChevron: false,
        value: currentLoopCurrent ? t("apps.ipod.menuItems.one") : currentLoopAll ? t("apps.ipod.menuItems.all") : t("apps.ipod.menuItems.off"),
      },
      {
        label: t("apps.ipod.menuItems.shuffle"),
        action: memoizedToggleShuffle,
        showChevron: false,
        value: currentIsShuffled ? t("apps.ipod.menuItems.on") : t("apps.ipod.menuItems.off"),
      },
      {
        label: t("apps.ipod.menuItems.backlight"),
        action: memoizedToggleBacklight,
        showChevron: false,
        value: currentBacklightOn ? t("apps.ipod.menuItems.on") : t("apps.ipod.menuItems.off"),
      },
      {
        label: t("apps.ipod.menuItems.theme"),
        action: memoizedHandleThemeChange,
        showChevron: false,
        value:
          currentTheme === "classic"
            ? t("apps.ipod.menu.classic")
            : currentTheme === "black"
            ? t("apps.ipod.menu.black")
            : t("apps.ipod.menu.u2"),
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
    t,
  ]);

  const mainMenuItems = useMemo(() => {
    const musicLabel = t("apps.ipod.menuItems.music");
    const settingsLabel = t("apps.ipod.menuItems.settings");
    return [
      {
        label: musicLabel,
        action: () => {
          registerActivity();
          if (useIpodStore.getState().showVideo) {
            toggleVideo();
          }
          setMenuDirection("forward");
          setMenuHistory((prev) => [
            ...prev,
            {
              title: musicLabel,
              items: musicMenuItems,
              selectedIndex: 0,
            },
          ]);
          setSelectedMenuItem(0);
        },
        showChevron: true,
      },
      {
        label: t("apps.ipod.menuItems.extras"),
        action: () => {
          registerActivity();
          if (useIpodStore.getState().showVideo) {
            toggleVideo();
          }
          setIsAddDialogOpen(true);
        },
        showChevron: true,
      },
      {
        label: settingsLabel,
        action: () => {
          registerActivity();
          if (useIpodStore.getState().showVideo) {
            toggleVideo();
          }
          setMenuDirection("forward");
          setMenuHistory((prev) => [
            ...prev,
            {
              title: settingsLabel,
              items: settingsMenuItems,
              selectedIndex: 0,
            },
          ]);
          setSelectedMenuItem(0);
        },
        showChevron: true,
      },
      {
        label: t("apps.ipod.menuItems.shuffleSongs"),
        action: () => {
          registerActivity();
          if (useIpodStore.getState().showVideo) {
            toggleVideo();
          }
          memoizedToggleShuffle();
          setMenuMode(false);
        },
        showChevron: false,
      },
      {
        label: t("apps.ipod.menuItems.backlight"),
        action: () => {
          memoizedToggleBacklight();
        },
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
  }, [
    registerActivity,
    toggleVideo,
    musicMenuItems,
    settingsMenuItems,
    memoizedToggleShuffle,
    memoizedToggleBacklight,
    showStatus,
    t,
  ]);

  useEffect(() => {
    if (menuHistory.length === 0) {
      setMenuHistory([
        { title: t("apps.ipod.menuItems.ipod"), items: mainMenuItems, selectedIndex: 0 },
      ]);
    }
  }, [t, mainMenuItems, menuHistory.length]);

  useEffect(() => {
    setMenuHistory((prevHistory) => {
      if (prevHistory.length === 0) return prevHistory;

      const currentMenuIndex = prevHistory.length - 1;
      const currentMenu = prevHistory[currentMenuIndex];
      let latestItems: typeof currentMenu.items | null = null;
      const ipodLabel = t("apps.ipod.menuItems.ipod");
      const musicLabel = t("apps.ipod.menuItems.music");
      const settingsLabel = t("apps.ipod.menuItems.settings");
      const allSongsLabel = t("apps.ipod.menuItems.allSongs");

      if (currentMenu.title === ipodLabel) {
        latestItems = mainMenuItems;
      } else if (currentMenu.title === musicLabel) {
        latestItems = musicMenuItems;
      } else if (currentMenu.title === settingsLabel) {
        latestItems = settingsMenuItems;
      } else if (currentMenu.title === allSongsLabel) {
        // Regenerate All Songs menu when tracks change
        latestItems = tracks.map(
          (track: (typeof tracks)[0], index: number) => ({
            label: track.title,
            action: () => {
              registerActivity();
              setCurrentIndex(index);
              setIsPlaying(true);
              setMenuDirection("forward");
              setMenuMode(false);
              setCameFromNowPlayingMenuItem(false);
                setLastPlayedMenuPath([t("apps.ipod.menuItems.music"), t("apps.ipod.menuItems.allSongs")]);
              if (useIpodStore.getState().showVideo) {
                toggleVideo();
              }
            },
            showChevron: false,
          })
        );
      } else {
        // Check if this is an artist submenu
        const tracksByArtist = tracks.reduce<
          Record<string, { track: (typeof tracks)[0]; index: number }[]>
        >(
          (
            acc: Record<string, { track: (typeof tracks)[0]; index: number }[]>,
            track: (typeof tracks)[0],
            index: number
          ) => {
            const artist = track.artist || t("apps.ipod.menu.unknownArtist");
            if (!acc[artist]) {
              acc[artist] = [];
            }
            acc[artist].push({ track, index });
            return acc;
          },
          {}
        );

        if (tracksByArtist[currentMenu.title]) {
          // This is an artist submenu, regenerate it
          const artistTracks = tracksByArtist[currentMenu.title];
          latestItems = artistTracks.map(
            ({
              track,
              index,
            }: {
              track: (typeof tracks)[0];
              index: number;
            }) => ({
              label: track.title,
              action: () => {
                registerActivity();
                setCurrentIndex(index);
                setIsPlaying(true);
                setMenuDirection("forward");
                setMenuMode(false);
                setCameFromNowPlayingMenuItem(false);
                setLastPlayedMenuPath([t("apps.ipod.menuItems.music"), currentMenu.title]);
                if (useIpodStore.getState().showVideo) {
                  toggleVideo();
                }
              },
              showChevron: false,
            })
          );
        }
      }

      if (latestItems && currentMenu.items !== latestItems) {
        const updatedHistory = [...prevHistory];
        updatedHistory[currentMenuIndex] = {
          ...currentMenu,
          items: latestItems,
        };
        return updatedHistory;
      }

      return prevHistory;
    });
  }, [
    mainMenuItems,
    musicMenuItems,
    settingsMenuItems,
    menuHistory.length,
    tracks,
    registerActivity,
    setCurrentIndex,
    setIsPlaying,
    toggleVideo,
    t,
  ]);

  const handleAddTrack = useCallback(
    async (url: string) => {
      setIsAddingTrack(true);
      try {
        const addedTrack = await useIpodStore
          .getState()
          .addTrackFromVideoId(url);
        if (addedTrack) {
          showStatus(t("apps.ipod.status.added"));
          setUrlInput("");
          setIsAddDialogOpen(false);
        } else {
          throw new Error("Failed to add track");
        }
      } catch (error) {
        console.error("Failed to add track:", error);
        showStatus(
          `❌ Error adding: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      } finally {
        setIsAddingTrack(false);
      }
    },
    [showStatus]
  );

  const handleAddAndPlayTrackByVideoId = useCallback(
    async (videoId: string) => {
      // Reuse handleAddTrack by constructing the URL
      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
      try {
        await handleAddTrack(youtubeUrl); // handleAddTrack is already useCallback
        // handleAddTrack internally calls showStatus, sets current index, and plays
      } catch (error) {
        console.error(
          `[iPod] Error adding track for videoId ${videoId}:`,
          error
        );
        // Optionally show an error status to the user
        showStatus(`❌ Error adding ${videoId}`);
      }
    },
    [handleAddTrack, showStatus]
  );

  const processVideoId = useCallback(
    async (videoId: string) => {
      const currentTracks = useIpodStore.getState().tracks;
      const existingTrackIndex = currentTracks.findIndex(
        (track) => track.id === videoId
      );

      const ua = navigator.userAgent;
      const isIOS = /iP(hone|od|ad)/.test(ua);
      const isSafari =
        /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);
      const shouldAutoplay = !(isIOS || isSafari);

      if (existingTrackIndex !== -1) {
        toast.info(t("apps.ipod.dialogs.openedSharedTrack"));
        console.log(`[iPod] Video ID ${videoId} found in tracks. Playing.`);
        setCurrentIndex(existingTrackIndex);
        if (shouldAutoplay) {
          setIsPlaying(true);
        }
        setMenuMode(false);
      } else {
        toast.info(t("apps.ipod.dialogs.addingNewTrack"));
        console.log(
          `[iPod] Video ID ${videoId} not found. Adding and playing.`
        );
        await handleAddAndPlayTrackByVideoId(videoId);
        if (shouldAutoplay && !isOffline) {
          const newIndex = useIpodStore.getState().currentIndex;
          const addedTrack = useIpodStore.getState().tracks[newIndex];
          if (addedTrack?.id === videoId) {
            setIsPlaying(true);
          } else {
            console.warn(
              "[iPod] Index mismatch after adding track, autoplay skipped."
            );
          }
        } else if (isOffline) {
          showOfflineStatus();
        }
      }
    },
    [setCurrentIndex, setIsPlaying, setMenuMode, handleAddAndPlayTrackByVideoId]
  );

  // Effect for initial data on mount
  useEffect(() => {
    if (
      isWindowOpen &&
      initialData?.videoId &&
      typeof initialData.videoId === "string"
    ) {
      // Skip if this initialData has already been processed
      if (lastProcessedInitialDataRef.current === initialData) return;

      const videoIdToProcess = initialData.videoId;
      console.log(
        `[iPod] Processing initialData.videoId on mount: ${videoIdToProcess}`
      );
      setTimeout(() => {
        processVideoId(videoIdToProcess)
          .then(() => {
            // Use instanceId if available (new system), otherwise skip (legacy)
            if (instanceId) {
              clearIpodInitialData(instanceId);
            }
            console.log(
              `[iPod] Cleared initialData after processing ${videoIdToProcess}`
            );
          })
          .catch((error) => {
            console.error(
              `[iPod] Error processing initial videoId ${videoIdToProcess}:`,
              error
            );
          });
      }, 100); // Small delay might help
      // Mark this initialData as processed
      lastProcessedInitialDataRef.current = initialData;
    }
  }, [
    isWindowOpen,
    initialData,
    processVideoId,
    clearIpodInitialData,
    instanceId,
  ]);

  // Effect for updateApp event (when app is already open)
  useEffect(() => {
    const handleUpdateApp = (
      event: CustomEvent<{ appId: string; initialData?: { videoId?: string } }>
    ) => {
      if (event.detail.appId === "ipod" && event.detail.initialData?.videoId) {
        // Skip if this initialData has already been processed
        if (lastProcessedInitialDataRef.current === event.detail.initialData)
          return;

        const videoId = event.detail.initialData.videoId;
        console.log(`[iPod] Received updateApp event with videoId: ${videoId}`);
        bringToForeground("ipod");
        processVideoId(videoId).catch((error) => {
          console.error(
            `[iPod] Error processing videoId ${videoId} from updateApp event:`,
            error
          );
          toast.error("Failed to load shared track", {
            description: `Video ID: ${videoId}`,
          });
        });
        // Mark this initialData as processed
        lastProcessedInitialDataRef.current = event.detail.initialData;
      }
    };

    window.addEventListener("updateApp", handleUpdateApp as EventListener);
    return () => {
      window.removeEventListener("updateApp", handleUpdateApp as EventListener);
    };
  }, [processVideoId, bringToForeground]);

  const handleTrackEnd = useCallback(() => {
    if (loopCurrent) {
      // Choose the active player based on fullscreen state
      const activePlayer = isFullScreen
        ? fullScreenPlayerRef.current
        : playerRef.current;
      activePlayer?.seekTo(0);
      setIsPlaying(true);
    } else {
      nextTrack();
    }
  }, [loopCurrent, nextTrack, setIsPlaying, isFullScreen]);

  const handleProgress = useCallback((state: { playedSeconds: number }) => {
    setElapsedTime(Math.floor(state.playedSeconds));
  }, []);

  const handleDuration = useCallback((duration: number) => {
    setTotalTime(duration);
  }, []);

  const handlePlay = useCallback(() => {
    // Always sync playing state when ReactPlayer reports a play event.
    setIsPlaying(true);
    if (!skipOperationRef.current) {
      showStatus("▶");
    }
    skipOperationRef.current = false;

    // Track song play analytics when a song actually starts playing
    const currentTrack = tracks[currentIndex];
    if (currentTrack) {
      const lastTracked = lastTrackedSongRef.current;
      
      // Track if:
      // 1. This is a new track (different track ID) - always track new songs
      // 2. Or playback is starting from the beginning (elapsedTime < 1 second) - track restarts
      const isNewTrack = !lastTracked || lastTracked.trackId !== currentTrack.id;
      const isStartingFromBeginning = elapsedTime < 1;

      if (isNewTrack || isStartingFromBeginning) {
        track(IPOD_ANALYTICS.SONG_PLAY, {
          trackId: currentTrack.id,
          title: currentTrack.title,
          artist: currentTrack.artist || "",
        });
        lastTrackedSongRef.current = {
          trackId: currentTrack.id,
          elapsedTime: elapsedTime,
        };
      }
    }
  }, [setIsPlaying, showStatus, tracks, currentIndex, elapsedTime]);

  const handlePause = useCallback(() => {
    // Always sync playing state when ReactPlayer reports a pause.
    // This unconditional update prevents the app state from getting
    // stuck in "play" when Mobile Safari blocks autoplay.
    setIsPlaying(false);
    showStatus("⏸︎");
  }, [setIsPlaying, showStatus]);

  const handleReady = useCallback(() => {
    // Optional: Can perform actions when player is ready
    // if (isPlaying) {
    // }
  }, []);

  // Add a watchdog effect to revert play state if playback never starts
  // (e.g., blocked by Mobile Safari's autoplay restrictions).
  useEffect(() => {
    // Only apply this effect on iOS Safari when no user interaction has occurred yet
    if (!isPlaying || !isIOSSafari || userHasInteractedRef.current) return;

    const startElapsed = elapsedTime;
    const timer = setTimeout(() => {
      // If elapsedTime hasn't advanced while we thought we were playing,
      // assume playback was blocked and revert the state.
      if (useIpodStore.getState().isPlaying && elapsedTime === startElapsed) {
        setIsPlaying(false);
        showStatus("⏸");
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [isPlaying, elapsedTime, setIsPlaying, showStatus, isIOSSafari]);

  const handleMenuButton = useCallback(() => {
    playClickSound();
    vibrate();
    registerActivity();

    if (showVideo) {
      toggleVideo();
    }

    if (menuMode) {
      if (menuHistory.length > 1) {
        setMenuDirection("backward");
        setMenuHistory((prev) => prev.slice(0, -1));
        const previousMenu = menuHistory[menuHistory.length - 2];
        if (previousMenu) {
          setSelectedMenuItem(previousMenu.selectedIndex);
        }
      } else {
        playClickSound();
      }
    } else {
      setMenuDirection("backward");
      const currentTrackIndex = useIpodStore.getState().currentIndex;

      const mainMenu =
        menuHistory.length > 0
          ? menuHistory[0]
          : { title: t("apps.ipod.menuItems.ipod"), items: mainMenuItems, selectedIndex: 0 };

      const musicSubmenu = musicMenuItems;

      if (cameFromNowPlayingMenuItem) {
        setMenuHistory([mainMenu]);
        setSelectedMenuItem(mainMenu?.selectedIndex || 0);
        setCameFromNowPlayingMenuItem(false);
      } else {
        // Group tracks by artist to find the right artist menu
        const tracksByArtist = tracks.reduce<
          Record<string, { track: (typeof tracks)[0]; index: number }[]>
        >(
          (
            acc: Record<string, { track: (typeof tracks)[0]; index: number }[]>,
            track: (typeof tracks)[0],
            index: number
          ) => {
            const artist = track.artist || t("apps.ipod.menu.unknownArtist");
            if (!acc[artist]) {
              acc[artist] = [];
            }
            acc[artist].push({ track, index });
            return acc;
          },
          {}
        );

        // Create track menus
        const allTracksMenu = {
          title: t("apps.ipod.menuItems.allSongs"),
          items: tracks.map((track: (typeof tracks)[0], index: number) => ({
            label: track.title,
            action: () => {
              registerActivity();
              setCurrentIndex(index);
              setIsPlaying(true);
              setMenuDirection("forward");
              setMenuMode(false);
              setCameFromNowPlayingMenuItem(false);
                setLastPlayedMenuPath([t("apps.ipod.menuItems.music"), t("apps.ipod.menuItems.allSongs")]);
              if (useIpodStore.getState().showVideo) {
                toggleVideo();
              }
            },
            showChevron: false,
          })),
          selectedIndex: currentTrackIndex,
        };

        // If we have a lastPlayedMenuPath, use it to determine where to go back to
        if (
          lastPlayedMenuPath.length > 0 &&
          lastPlayedMenuPath[1] !== t("apps.ipod.menuItems.allSongs")
        ) {
          // We should return to an artist menu
          const artist = lastPlayedMenuPath[1];

          // Check if artist exists in our library
          if (tracksByArtist[artist]) {
            const artistTracks = tracksByArtist[artist];

            // Find the index of the current track in this artist's track list
            const artistTrackIndex = artistTracks.findIndex(
              (item: { track: (typeof tracks)[0]; index: number }) =>
                item.index === currentTrackIndex
            );

            const artistMenu = {
              title: artist,
              items: artistTracks.map(
                ({
                  track,
                  index,
                }: {
                  track: (typeof tracks)[0];
                  index: number;
                }) => ({
                  label: track.title,
                  action: () => {
                    registerActivity();
                    setCurrentIndex(index);
                    setIsPlaying(true);
                    setMenuDirection("forward");
                    setMenuMode(false);
                    setCameFromNowPlayingMenuItem(false);
                    setLastPlayedMenuPath([t("apps.ipod.menuItems.music"), artist]);
                    if (useIpodStore.getState().showVideo) {
                      toggleVideo();
                    }
                  },
                  showChevron: false,
                })
              ),
              selectedIndex: artistTrackIndex !== -1 ? artistTrackIndex : 0,
            };

            setMenuHistory([
              mainMenu,
              {
                title: t("apps.ipod.menuItems.music"),
                items: musicSubmenu,
                selectedIndex: musicSubmenu.findIndex(
                  (item) => item.label === artist
                ),
              },
              artistMenu,
            ]);

            setSelectedMenuItem(artistTrackIndex !== -1 ? artistTrackIndex : 0);
          } else {
            // If artist no longer exists, fall back to All Songs
            setMenuHistory([
              mainMenu,
              {
                title: t("apps.ipod.menuItems.music"),
                items: musicSubmenu,
                selectedIndex: 0,
              },
              allTracksMenu,
            ]);
            setSelectedMenuItem(currentTrackIndex);
          }
        } else {
          // Default behavior: go to All Songs
          setMenuHistory([
            mainMenu,
            {
              title: t("apps.ipod.menuItems.music"),
              items: musicSubmenu,
              selectedIndex: 0,
            },
            allTracksMenu,
          ]);
          setSelectedMenuItem(currentTrackIndex);
        }
      }
      setMenuMode(true);
    }
  }, [
    playClickSound,
    vibrate,
    registerActivity,
    showVideo,
    toggleVideo,
    menuMode,
    menuHistory,
    mainMenuItems,
    musicMenuItems,
    tracks,
    cameFromNowPlayingMenuItem,
    lastPlayedMenuPath,
    t,
  ]);

  const handleWheelClick = useCallback(
    (area: "top" | "right" | "bottom" | "left" | "center") => {
      playClickSound();
      vibrate();
      registerActivity();
      switch (area) {
        case "top":
          handleMenuButton();
          break;
        case "right":
          if (isOffline) {
            showOfflineStatus();
          } else {
            skipOperationRef.current = true;
            nextTrack();
            showStatus("⏭");
          }
          break;
        case "bottom":
          if (isOffline) {
            showOfflineStatus();
          } else {
            togglePlay();
            showStatus(useIpodStore.getState().isPlaying ? "▶" : "⏸");
          }
          break;
        case "left":
          if (isOffline) {
            showOfflineStatus();
          } else {
            skipOperationRef.current = true;
            previousTrack();
            showStatus("⏮");
          }
          break;
        case "center":
          if (menuMode) {
            const currentMenu = menuHistory[menuHistory.length - 1];
            if (currentMenu && currentMenu.items[selectedMenuItem]) {
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
                    if (!useIpodStore.getState().showVideo) {
                      toggleVideo();
                    }
                  }, 200);
                }
              } else {
                if (isOffline) {
                  showOfflineStatus();
                } else {
                  toggleVideo();
                }
              }
            }
          }
          break;
      }
    },
    [
      playClickSound,
      vibrate,
      registerActivity,
      nextTrack,
      showStatus,
      togglePlay,
      previousTrack,
      menuMode,
      menuHistory,
      selectedMenuItem,
      tracks,
      currentIndex,
      isPlaying,
      toggleVideo,
      handleMenuButton,
      isOffline,
      showOfflineStatus,
    ]
  );

  const handleWheelRotation = useCallback(
    (direction: "clockwise" | "counterclockwise") => {
      playScrollSound();
      // vibrate(); // Removed vibration for wheel scrolling
      registerActivity();

      if (menuMode) {
        const currentMenu = menuHistory[menuHistory.length - 1];
        if (!currentMenu) return;
        const menuLength = currentMenu.items.length;
        if (menuLength === 0) return;

        let committedIndex: number | null = null; // track the index we commit to state

        // Update the selected menu item using a functional state update to avoid stale closures
        setSelectedMenuItem((prevIndex) => {
          let newIndex = prevIndex;
          if (direction === "clockwise") {
            newIndex = Math.min(menuLength - 1, prevIndex + 1);
          } else {
            newIndex = Math.max(0, prevIndex - 1);
          }

          // Record the new index so we can update menu history afterwards
          committedIndex = newIndex;
          return newIndex;
        });

        // If the committed index changed, reflect it in the menu history
        if (committedIndex !== null) {
          setMenuHistory((prev) => {
            const lastIndex = prev.length - 1;
            const updatedHistory = [...prev];
            updatedHistory[lastIndex] = {
              ...prev[lastIndex],
              selectedIndex: committedIndex!,
            };
            return updatedHistory;
          });
        }
      } else {
        const activePlayer = isFullScreen
          ? fullScreenPlayerRef.current
          : playerRef.current;
        const currentTime = activePlayer?.getCurrentTime() || 0;
        const seekAmount = 5;
        let newTime = currentTime;
        if (direction === "clockwise") {
          newTime = currentTime + seekAmount;
          activePlayer?.seekTo(newTime);
          showStatus(
            `⏩︎ ${Math.floor(newTime / 60)}:${String(
              Math.floor(newTime % 60)
            ).padStart(2, "0")}`
          );
        } else {
          newTime = Math.max(0, currentTime - seekAmount);
          activePlayer?.seekTo(newTime);
          showStatus(
            `⏪︎ ${Math.floor(newTime / 60)}:${String(
              Math.floor(newTime % 60)
            ).padStart(2, "0")}`
          );
        }
      }
    },
    [
      playScrollSound,
      registerActivity,
      menuMode,
      menuHistory,
      showStatus,
      isFullScreen,
    ]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Track previous minimized state to detect restore
  const prevMinimizedRef = useRef(isMinimized);

  useEffect(() => {
    let timeoutId: number;

    const handleResize = () => {
      if (!containerRef.current) return;

      // Use requestAnimationFrame to ensure we get accurate measurements
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

        // Only update if scale actually changed to prevent unnecessary re-renders
        setScale((prevScale) => {
          if (Math.abs(prevScale - finalScale) > 0.01) {
            return finalScale;
          }
          return prevScale;
        });
      });
    };

    // Initial resize with a small delay to ensure DOM is ready
    timeoutId = window.setTimeout(handleResize, 10);

    // Detect restore from minimize - trigger resize with longer delays
    // to ensure the window has fully animated back to its position
    if (prevMinimizedRef.current && !isMinimized) {
      // Schedule multiple resize attempts after restore
      const delays = [50, 100, 200, 300, 500];
      delays.forEach((delay) => {
        window.setTimeout(handleResize, delay);
      });
    }
    prevMinimizedRef.current = isMinimized;

    const resizeObserver = new ResizeObserver(() => {
      // Debounce resize events
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(handleResize, 10);
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
    };
  }, [isWindowOpen, isMinimized]);

  const handleShareSong = useCallback(() => {
    if (tracks.length > 0 && currentIndex >= 0) {
      setIsShareDialogOpen(true);
    }
  }, [tracks, currentIndex]);

  // Get current track's lyrics search override (define early for use in callbacks)
  const currentTrack = tracks[currentIndex];
  const lyricsSearchOverride = currentTrack?.lyricsSearch;

  const handleRefreshLyrics = useCallback(() => {
    if (tracks.length > 0 && currentIndex >= 0) {
      setIsLyricsSearchDialogOpen(true);
    }
  }, [tracks, currentIndex]);

  const handleLyricsSearchSelect = useCallback(
    (result: {
      hash: string;
      albumId: string | number;
      title: string;
      artist: string;
      album?: string;
    }) => {
      const track = tracks[currentIndex];
      if (track) {
        setTrackLyricsSearch(track.id, {
          query: undefined, // Clear query override when selecting a match
          selection: result,
        });
        // Force refresh to fetch the selected lyrics
        refreshLyrics();
      }
    },
    [tracks, currentIndex, setTrackLyricsSearch, refreshLyrics]
  );

  const handleLyricsSearchReset = useCallback(() => {
    const track = tracks[currentIndex];
    if (track) {
      clearTrackLyricsSearch(track.id);
      // Force refresh to use auto-match
      refreshLyrics();
    }
  }, [tracks, currentIndex, clearTrackLyricsSearch, refreshLyrics]);

  const ipodGenerateShareUrl = (videoId: string): string => {
    return `${window.location.origin}/ipod/${videoId}`;
  };

  // Volume control
  const { ipodVolume } = useAppStoreShallow((state) => ({
    ipodVolume: state.ipodVolume,
  }));

  // Memoize selectedMatch to prevent infinite re-renders in useLyrics
  const selectedMatchForLyrics = useMemo(() => {
    if (!lyricsSearchOverride?.selection) return undefined;
    return {
      hash: lyricsSearchOverride.selection.hash,
      albumId: lyricsSearchOverride.selection.albumId,
      title: lyricsSearchOverride.selection.title,
      artist: lyricsSearchOverride.selection.artist,
      album: lyricsSearchOverride.selection.album,
    };
  }, [
    lyricsSearchOverride?.selection?.hash,
    lyricsSearchOverride?.selection?.albumId,
    lyricsSearchOverride?.selection?.title,
    lyricsSearchOverride?.selection?.artist,
    lyricsSearchOverride?.selection?.album,
  ]);

  // Always call useLyrics at the top level, outside of any conditional logic
  const fullScreenLyricsControls = useLyrics({
    title: currentTrack?.title ?? "",
    artist: currentTrack?.artist ?? "",
    album: currentTrack?.album ?? "",
    currentTime: elapsedTime + (currentTrack?.lyricOffset ?? 0) / 1000,
    translateTo: lyricsTranslationLanguage,
    searchQueryOverride: lyricsSearchOverride?.query,
    selectedMatch: selectedMatchForLyrics,
  });

  // Add a ref to track the previous fullscreen state
  const prevFullScreenRef = useRef(isFullScreen);

  // Effect to synchronise playback time when entering and exiting fullscreen
  useEffect(() => {
    if (isFullScreen !== prevFullScreenRef.current) {
      if (isFullScreen) {
        // Entering fullscreen - sync from small player to fullscreen player
        const currentTime = playerRef.current?.getCurrentTime() || elapsedTime;
        const wasPlaying = isPlaying;
        
        // Small delay to ensure the fullscreen player is mounted
        setTimeout(() => {
          if (fullScreenPlayerRef.current) {
            fullScreenPlayerRef.current.seekTo(currentTime);
            
            // On mobile Safari, explicitly start playback if it was playing
            // This handles the case where autoplay restrictions prevent automatic playback
            if (wasPlaying && isIOSSafari && userHasInteractedRef.current) {
              // Additional delay to ensure seeking is complete before starting playback
              setTimeout(() => {
                // Force play the fullscreen player
                const internalPlayer = fullScreenPlayerRef.current?.getInternalPlayer?.();
                if (internalPlayer && typeof internalPlayer.playVideo === 'function') {
                  internalPlayer.playVideo();
                }
              }, 200);
            }
          }
        }, 100);
      } else {
        // Exiting fullscreen - sync from fullscreen player back to small player
        const currentTime =
          fullScreenPlayerRef.current?.getCurrentTime() || elapsedTime;
        const wasPlaying = isPlaying;

        // Longer delay to ensure the regular player is properly mounted after fullscreen exit
        setTimeout(() => {
          if (playerRef.current) {
            playerRef.current.seekTo(currentTime);
            // Only update play state if needed, after seeking is complete
            setTimeout(() => {
              if (wasPlaying && !useIpodStore.getState().isPlaying) {
                setIsPlaying(true);
              }
            }, 50);
          }
        }, 200);
      }
      prevFullScreenRef.current = isFullScreen;
    }
  }, [isFullScreen, elapsedTime, isPlaying, setIsPlaying, isIOSSafari]);

  // Add a seekTime function for fullscreen seeking
  const seekTime = useCallback(
    (delta: number) => {
      if (fullScreenPlayerRef.current) {
        const currentTime = fullScreenPlayerRef.current.getCurrentTime() || 0;
        const newTime = Math.max(0, currentTime + delta);
        fullScreenPlayerRef.current.seekTo(newTime);
        showStatus(
          `${delta > 0 ? "⏩︎" : "⏪︎"} ${Math.floor(newTime / 60)}:${String(
            Math.floor(newTime % 60)
          ).padStart(2, "0")}`
        );
      }
    },
    [showStatus]
  );

  const currentTranslationCode = lyricsTranslationLanguage;

  const handleSelectTranslation = useCallback(
    (code: string | null) => {
      const setLang = useIpodStore.getState().setLyricsTranslationLanguage;
      setLang(code);
    },
    []
  );

  const cycleAlignment = useCallback(() => {
    const store = useIpodStore.getState();
    const curr = store.lyricsAlignment;
    let next: LyricsAlignment;
    if (curr === LyricsAlignment.FocusThree) next = LyricsAlignment.Center;
    else if (curr === LyricsAlignment.Center)
      next = LyricsAlignment.Alternating;
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

  const toggleKorean = useCallback(() => {
    const store = useIpodStore.getState();
    const curr = store.koreanDisplay;
    const next =
      curr === KoreanDisplay.Original
        ? KoreanDisplay.Romanized
        : KoreanDisplay.Original;
    store.setKoreanDisplay(next);
    showStatus(
      next === KoreanDisplay.Romanized ? t("apps.ipod.status.romanizationOn") : t("apps.ipod.status.hangulOn")
    );
  }, [showStatus, t]);

  const toggleFurigana = useCallback(() => {
    const store = useIpodStore.getState();
    const curr = store.japaneseFurigana;
    const next =
      curr === JapaneseFurigana.On
        ? JapaneseFurigana.Off
        : JapaneseFurigana.On;
    store.setJapaneseFurigana(next);
    showStatus(
      next === JapaneseFurigana.On ? t("apps.ipod.status.furiganaOn") : t("apps.ipod.status.furiganaOff")
    );
  }, [showStatus, t]);

  // Add fullscreen change event handler
  useEffect(() => {
    const handleFullscreenChange = () => {
      // If browser fullscreen is exited (e.g. by pressing Escape)
      // and our app thinks we're still in fullscreen mode, update the app state
      if (!document.fullscreenElement && isFullScreen) {
        toggleFullScreen();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [isFullScreen, toggleFullScreen]);

  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const menuBar = (
    <IpodMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onClearLibrary={() => {
        setIsConfirmClearOpen(true);
      }}
      onSyncLibrary={manualSync}
      onAddTrack={() => setIsAddDialogOpen(true)}
      onShareSong={handleShareSong}
      onRefreshLyrics={handleRefreshLyrics}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={getTranslatedAppName("ipod")}
        onClose={onClose}
        isForeground={isForeground}
        appId="ipod"
        transparentBackground
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
        keepMountedWhenMinimized
      >
        <div
          ref={containerRef}
          className="ipod-force-font flex flex-col items-center justify-center w-full h-full bg-gradient-to-b from-gray-100/20 to-gray-300/20 backdrop-blur-lg p-4 select-none"
          style={{
            position: "relative",
            overflow: "hidden",
            contain: "layout style paint",
          }}
        >
          <div
            className={cn(
              "ipod-force-font w-[250px] h-[400px] rounded-2xl shadow-xl border border-black/40 flex flex-col items-center p-4 pb-8",
              theme === "classic" ? "bg-white/85" : "bg-black/85"
            )}
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "center",
              transition: "transform 0.2s ease",
              minWidth: "250px",
              minHeight: "400px",
              maxWidth: "250px",
              maxHeight: "400px",
              contain: "layout style paint",
              willChange: "transform",
              backfaceVisibility: "hidden",
            }}
          >
            <IpodScreen
              currentTrack={tracks[currentIndex] || null}
              isPlaying={isPlaying && !isFullScreen}
              elapsedTime={elapsedTime}
              totalTime={totalTime}
              menuMode={menuMode}
              menuHistory={menuHistory}
              selectedMenuItem={selectedMenuItem}
              onSelectMenuItem={setSelectedMenuItem}
              currentIndex={currentIndex}
              tracksLength={tracks.length}
              backlightOn={backlightOn}
              menuDirection={menuDirection}
              onMenuItemAction={handleMenuItemAction}
              showVideo={showVideo}
              playerRef={playerRef}
              handleTrackEnd={handleTrackEnd}
              handleProgress={handleProgress}
              handleDuration={handleDuration}
              handlePlay={handlePlay}
              handlePause={handlePause}
              handleReady={handleReady}
              loopCurrent={loopCurrent}
              statusMessage={statusMessage}
              onToggleVideo={toggleVideo}
              lcdFilterOn={lcdFilterOn}
              ipodVolume={ipodVolume}
              showStatusCallback={showStatus}
              showLyrics={showLyrics}
              lyricsAlignment={lyricsAlignment}
              chineseVariant={chineseVariant}
              koreanDisplay={koreanDisplay}
              japaneseFurigana={japaneseFurigana}
              lyricOffset={lyricOffset ?? 0}
              adjustLyricOffset={(delta) =>
                useIpodStore.getState().adjustLyricOffset(currentIndex, delta)
              }
              registerActivity={registerActivity}
              isFullScreen={isFullScreen}
              lyricsControls={fullScreenLyricsControls}
            />

            <IpodWheel
              theme={theme}
              onWheelClick={handleWheelClick}
              onWheelRotation={handleWheelRotation}
              onMenuButton={handleMenuButton}
            />
          </div>
        </div>

        {/* Render the full screen portal when isFullScreen is true */}
        {isFullScreen && (
          <FullScreenPortal
            onClose={() => {
              // Just toggle fullscreen state - synchronization is handled in useEffect
              toggleFullScreen();
            }}
            togglePlay={togglePlay}
            nextTrack={() => {
              skipOperationRef.current = true;
              nextTrack();

              // Show track info with symbol after small delay to allow state update
              setTimeout(() => {
                const newTrack = tracks[useIpodStore.getState().currentIndex];
                if (newTrack) {
                  const artistInfo = newTrack.artist
                    ? ` - ${newTrack.artist}`
                    : "";
                  showStatus(`⏭ ${newTrack.title}${artistInfo}`);
                }
              }, 100);
            }}
            previousTrack={() => {
              skipOperationRef.current = true;
              previousTrack();

              // Show track info with symbol after small delay to allow state update
              setTimeout(() => {
                const newTrack = tracks[useIpodStore.getState().currentIndex];
                if (newTrack) {
                  const artistInfo = newTrack.artist
                    ? ` - ${newTrack.artist}`
                    : "";
                  showStatus(`⏮ ${newTrack.title}${artistInfo}`);
                }
              }, 100);
            }}
            seekTime={seekTime}
            showStatus={showStatus}
            showOfflineStatus={showOfflineStatus}
            registerActivity={registerActivity}
            isPlaying={isPlaying}
            statusMessage={statusMessage}
            currentTranslationCode={currentTranslationCode}
            onSelectTranslation={handleSelectTranslation}
            currentAlignment={lyricsAlignment}
            onCycleAlignment={cycleAlignment}
            currentKoreanDisplay={koreanDisplay}
            onToggleKoreanDisplay={toggleKorean}
            currentJapaneseFurigana={japaneseFurigana}
            onToggleJapaneseFurigana={toggleFurigana}
            fullScreenPlayerRef={fullScreenPlayerRef}
            isLoadingLyrics={fullScreenLyricsControls.isLoading}
            isProcessingLyrics={fullScreenLyricsControls.isTranslating}
          >
            {({ controlsVisible }) => (
              <div className="flex flex-col w-full h-full">
                {/* The player and lyrics content */}
                <div className="relative w-full h-full overflow-visible">
                  {/* The player and lyrics content */}
                  <div
                    className="w-full relative"
                    style={{
                      // Overscan the video vertically to crop out YouTube controls
                      height: "calc(100% + clamp(200px, 30dvh, 360px))",
                      transform: "translateY(-100px)",
                    }}
                  >
                    {tracks[currentIndex] && (
                      <>
                        <div className={`w-full h-full pointer-events-none`}>
                          <ReactPlayer
                            ref={fullScreenPlayerRef}
                            url={tracks[currentIndex].url}
                            playing={isPlaying && isFullScreen} // Only play when in fullscreen mode
                            controls
                            width="100%"
                            height="100%"
                            volume={
                              ipodVolume * useAppStore.getState().masterVolume
                            }
                            loop={loopCurrent}
                            onEnded={handleTrackEnd}
                            onProgress={handleProgress}
                            onDuration={handleDuration}
                            onPlay={handlePlay}
                            onPause={handlePause}
                            onReady={handleReady}
                            config={{
                              youtube: {
                                playerVars: {
                                  modestbranding: 1, // Minimal YouTube branding
                                  rel: 0, // Do not show related videos at the end
                                  showinfo: 0, // Hide video title
                                  iv_load_policy: 3, // Hide annotations
                                  cc_load_policy: 0, // Disable captions by default
                                  fs: 1, // Allow fullscreen toggle inside YouTube player
                                  playsinline: 1, // iOS inline playback
                                  enablejsapi: 1,
                                  // Origin for YouTube postMessage communication
                                  origin: window.location.origin,
                                },
                                // Required for Tauri: sets referrer policy on iframe to prevent YouTube Error 153
                                embedOptions: {
                                  referrerPolicy: "strict-origin-when-cross-origin",
                                },
                              },
                            }}
                          />
                        </div>

                        {/* Dark overlay when lyrics are shown */}
                        {showLyrics && tracks[currentIndex] && (
                          <div className="absolute inset-0 bg-black/50 z-10 pointer-events-none" />
                        )}

                        {/* Lyrics Overlay */}
                        {showLyrics && (
                          <div
                            className="absolute bottom-0 inset-0 pointer-events-none z-20"
                            style={{
                              transform: controlsVisible
                                ? "translateY(-3rem)"
                                : "translateY(clamp(1rem, 4dvh, 5rem))",
                              transition: "transform 200ms ease",
                            }}
                          >
                            {/* Use the hook result from the top level */}
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
                              fontClassName={"font-lyrics-rounded"}
                              onAdjustOffset={(delta) => {
                                // Update store with the adjusted offset
                                useIpodStore
                                  .getState()
                                  .adjustLyricOffset(currentIndex, delta);

                                // Display status message
                                const newOffset =
                                  (tracks[currentIndex]?.lyricOffset ?? 0) +
                                  delta;
                                const sign =
                                  newOffset > 0 ? "+" : newOffset < 0 ? "" : "";
                                showStatus(
                                  `${t("apps.ipod.status.offset")} ${sign}${(newOffset / 1000).toFixed(
                                    2
                                  )}s`
                                );

                                // Force immediate update of lyrics display with new offset
                                const updatedTime =
                                  elapsedTime + newOffset / 1000;
                                fullScreenLyricsControls.updateCurrentTimeManually(
                                  updatedTime
                                );
                              }}
                              isTranslating={
                                fullScreenLyricsControls.isTranslating
                              }
                              textSizeClass="text-[min(10vw,10vh)]"
                              gapClass="gap-0"
                              containerStyle={{
                                gap: "clamp(0.25rem, calc(min(10vw,10vh) * 0.12), 2.5rem)",
                                paddingLeft: "env(safe-area-inset-left, 0px)",
                                paddingRight: "env(safe-area-inset-right, 0px)",
                              }}
                              interactive={isIOSSafari ? false : isPlaying}
                              bottomPaddingClass="pb-[calc(max(env(safe-area-inset-bottom),1.5rem)+clamp(5rem,16dvh,12rem))]"
                              spinnerSizeClass="w-[min(6vw,6vh)] h-[min(6vw,6vh)]"
                              spinnerContainerStyle={{
                                top: "calc(max(env(safe-area-inset-top), 0.75rem) + clamp(1rem, 6dvh, 3rem))",
                                right: "calc(max(env(safe-area-inset-right), 0.75rem) + clamp(1rem, 6dvw, 4rem))",
                              }}
                            />
                          </div>
                        )}

                        {/* Show translating state even when lyrics overlay is hidden */}
                        {fullScreenLyricsControls.isTranslating &&
                          !showLyrics && (
                            <div
                              className="absolute inset-0 pointer-events-none z-20 flex items-end justify-center pb-[calc(max(env(safe-area-inset-bottom),1.5rem)+clamp(5rem,16dvh,12rem))]"
                              style={{
                                transform: controlsVisible
                                  ? "translateY(0)"
                                  : "translateY(clamp(2rem, 8dvh, 10rem))",
                                transition: "transform 200ms ease",
                              }}
                            >
                              <div
                                className={cn(
                                  "shimmer opacity-60 text-[min(10vw,10vh)]",
                                  "font-lyrics-rounded"
                                )}
                              >
                                {t("apps.ipod.status.translatingLyrics")}
                              </div>
                            </div>
                          )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </FullScreenPortal>
        )}

        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setIsHelpDialogOpen}
          helpItems={translatedHelpItems}
          appId="ipod"
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={appMetadata}
          appId="ipod"
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

        <InputDialog
          isOpen={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          onSubmit={handleAddTrack}
          title={t("apps.ipod.dialogs.addSongTitle")}
          description={t("apps.ipod.dialogs.addSongDescription")}
          value={urlInput}
          onChange={setUrlInput}
          isLoading={isAddingTrack}
        />
        <ShareItemDialog
          isOpen={isShareDialogOpen}
          onClose={() => setIsShareDialogOpen(false)}
          itemType="Song"
          itemIdentifier={tracks[currentIndex]?.id || ""}
          title={tracks[currentIndex]?.title}
          details={tracks[currentIndex]?.artist}
          generateShareUrl={ipodGenerateShareUrl}
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
      </WindowFrame>

      {/* PIP Player - shown when minimized with tracks */}
      <AnimatePresence>
        {isMinimized && !isFullScreen && tracks.length > 0 && currentIndex >= 0 && (
          <PipPlayer
            currentTrack={tracks[currentIndex] || null}
            isPlaying={isPlaying}
            onTogglePlay={togglePlay}
            onNextTrack={nextTrack}
            onPreviousTrack={previousTrack}
            onRestore={() => {
              if (instanceId) {
                restoreInstance(instanceId);
              }
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
