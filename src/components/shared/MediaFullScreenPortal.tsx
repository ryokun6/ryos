import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { usePointerLongPress } from "@/hooks/usePointerLongPress";
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import type ReactPlayer from "react-player";
import { cn } from "@/lib/utils";
import { ActivityIndicatorWithLabel } from "@/components/ui/activity-indicator-with-label";
import { useIpodStore } from "@/stores/useIpodStore";
import { useShallow } from "zustand/react/shallow";
import { useOffline } from "@/hooks/useOffline";
import { useEventListener } from "@/hooks/useEventListener";
import { useTranslation } from "react-i18next";
import { isMobileSafari } from "@/utils/device";
import {
  TRANSLATION_LANGUAGES,
  SWIPE_THRESHOLD,
  MAX_SWIPE_TIME,
  MAX_VERTICAL_DRIFT,
} from "@/apps/ipod/constants";
import { FullscreenPlayerControls } from "@/components/shared/FullscreenPlayerControls";
import { FullscreenMobileDismiss } from "@/components/shared/FullscreenMobileDismiss";
import { YouTubePlayer } from "@/components/shared/YouTubePlayer";
import { LyricsAlignment, LyricsFont } from "@/types/lyrics";
import type { FullScreenPortalProps } from "@/apps/ipod/types";

const passiveActivityOptions: AddEventListenerOptions = { passive: true };

const FULLSCREEN_ROOT_CLASS =
  "ipod-force-font fixed inset-0 z-[9999] bg-black select-none flex flex-col";

const STATUS_MESSAGE_POSITION_STYLE = {
  top: "calc(max(env(safe-area-inset-top), 0.75rem) + clamp(1rem, 6dvh, 3rem))",
  left: "calc(max(env(safe-area-inset-left), 0.75rem) + clamp(1rem, 6dvw, 4rem))",
};

function FullscreenStatusMessage({
  statusMessage,
  pointerEventsNone = false,
}: {
  statusMessage: string | null | undefined;
  pointerEventsNone?: boolean;
}) {
  return (
    <AnimatePresence>
      {statusMessage && (
        <motion.div
          className={cn(
            "absolute inset-0 z-40",
            pointerEventsNone && "pointer-events-none"
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div
            className={cn("absolute", pointerEventsNone && "pointer-events-none")}
            style={STATUS_MESSAGE_POSITION_STYLE}
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
  );
}

function getMediaPlayerIsPlaying(
  playerRef: React.RefObject<ReactPlayer | null> | undefined,
  isPlaying: boolean,
  options?: { includeMusicKit?: boolean }
): boolean {
  const internalPlayer = playerRef?.current?.getInternalPlayer?.();
  if (internalPlayer && typeof internalPlayer.getPlayerState === "function") {
    return internalPlayer.getPlayerState() === 1;
  }
  if (
    options?.includeMusicKit &&
    internalPlayer &&
    typeof (internalPlayer as { playbackState?: unknown }).playbackState ===
      "number"
  ) {
    return (internalPlayer as { playbackState: number }).playbackState === 2;
  }
  return isPlaying;
}

function useRequestFullscreenElement(
  containerRef: React.RefObject<HTMLDivElement | null>,
  enabled = true
) {
  useEffect(() => {
    if (!enabled) return;

    const timeoutId = setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.requestFullscreen().catch((err) => {
          console.error("Error attempting to enable fullscreen:", err);
        });
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [containerRef, enabled]);
}

function useCloseOnNativeFullscreenExit(onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        onClose();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [enabled, onClose]);
}

/** iPod / Karaoke fullscreen shell (children supplied by caller). */
export function MediaFullScreenShellPortal({
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
  disableTapToPlayPause = false,
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
  displayMode,
  onDisplayModeSelect,
  displayModeOptions,
  fullScreenPlayerRef,
  karaokeKtvRoomFxEnabled,
  onToggleKaraokeKtvRoomFx,
  activityState,
  onSurfaceLongPress,
  surfaceLongPressEnabled = true,
  suppressToolbar = false,
}: FullScreenPortalProps) {
  const isAnyActivityActive = activityState
    ? activityState.isLoadingLyrics ||
      activityState.isTranslating ||
      activityState.isFetchingFurigana ||
      activityState.isFetchingSoramimi ||
      activityState.isAddingSong
    : false;

  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const [isPronunciationMenuOpen, setIsPronunciationMenuOpen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimeoutRef = useRef<number | null>(null);
  const isOffline = useOffline();
  const { isShuffled, toggleShuffle } = useIpodStore(
    useShallow((s) => ({
      isShuffled: s.isShuffled,
      toggleShuffle: s.toggleShuffle,
    }))
  );

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
  const getActualPlayerState = useCallback(
    () =>
      getMediaPlayerIsPlaying(fullScreenPlayerRef, isPlaying, {
        includeMusicKit: true,
      }),
    [fullScreenPlayerRef, isPlaying]
  );

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

  const shouldIgnoreLongPressTarget = useCallback((target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    if (!el?.closest) return false;
    return Boolean(
      el.closest("[data-toolbar]") ||
        el.closest("[data-lyrics]") ||
        el.closest("[data-cover-flow]") ||
        el.closest("button") ||
        el.closest("a") ||
        el.closest("input") ||
        el.closest("select") ||
        el.closest("textarea")
    );
  }, []);

  const surfaceLongPress = usePointerLongPress(
    () => {
      handlersRef.current.registerActivity();
      onSurfaceLongPress?.();
    },
    {
      enabled: Boolean(onSurfaceLongPress) && surfaceLongPressEnabled,
      shouldIgnoreTarget: shouldIgnoreLongPressTarget,
    }
  );

  // Touch handling for swipe gestures
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null
  );

  // Stable event handlers using refs
  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      // Don't handle touches on toolbar or lyrics elements
      const target = e.target as HTMLElement;
      if (shouldIgnoreLongPressTarget(target)) {
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
    [hasUserInteracted, shouldIgnoreLongPressTarget]
  );

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!touchStartRef.current) return;

      // Don't handle touches on toolbar or lyrics elements
      const target = e.target as HTMLElement;
      if (shouldIgnoreLongPressTarget(target)) {
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
    [shouldIgnoreLongPressTarget]
  );

  useRequestFullscreenElement(containerRef);

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

  useEventListener("touchstart", handleTouchStart, containerRef);
  useEventListener("touchend", handleTouchEnd, containerRef);

  // Auto-hide controls after inactivity
  const anyMenuOpen = isLangMenuOpen || isPronunciationMenuOpen;

  const handleActivity = useCallback(() => {
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
  }, [anyMenuOpen, getActualPlayerState, hasUserInteracted, isMobileSafariDevice]);

  useEventListener("mousemove", handleActivity, window, passiveActivityOptions);
  useEventListener("keydown", handleActivity);
  useEventListener("touchstart", handleActivity, window, passiveActivityOptions);
  useEventListener("click", handleActivity, window, passiveActivityOptions);

  useEffect(() => {
    const actuallyPlaying = getActualPlayerState();
    if (anyMenuOpen || !actuallyPlaying) setShowControls(true);

    const actuallyPlayingOnMount = getActualPlayerState() || isPlaying;
    if (actuallyPlayingOnMount && !anyMenuOpen) {
      hideControlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 2000);
    }

    return () => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
        hideControlsTimeoutRef.current = null;
      }
    };
  }, [anyMenuOpen, getActualPlayerState, isPlaying]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
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
        const currentTrack = store.currentSongId
          ? store.tracks.find((t) => t.id === store.currentSongId)
          : store.tracks[0];
        const currentTrackIndex = currentTrack
          ? store.tracks.findIndex((t) => t.id === currentTrack.id)
          : -1;
        if (currentTrackIndex >= 0) {
          store.adjustLyricOffset(currentTrackIndex, delta);
          const newOffset = (currentTrack?.lyricOffset ?? 0) + delta;
          const sign = newOffset > 0 ? "+" : newOffset < 0 ? "" : "";
          handlers.showStatus(
            `${t("apps.ipod.status.offset")} ${sign}${(newOffset / 1000).toFixed(2)}s`
          );
        }
      }
    },
    [isOffline, isPlaying, showOfflineStatus, t]
  );

  useEventListener("keydown", handleKeyDown);

  return createPortal(
    <div
      ref={containerRef}
      className={FULLSCREEN_ROOT_CLASS}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (shouldIgnoreLongPressTarget(target)) {
          return;
        }
        if (surfaceLongPress.consumeClickIfLongPressFired()) {
          return;
        }

        if (!hasUserInteracted) {
          setHasUserInteracted(true);
        }

        const handlers = handlersRef.current;
        handlers.registerActivity();

        if (disableTapToPlayPause) {
          restartAutoHideTimer();
          return;
        }

        const actuallyPlaying = getActualPlayerState();
        if (isOffline) {
          showOfflineStatus();
        } else {
          // Always allow play/pause toggle, even on mobile Safari when paused
          handlers.togglePlay();
          handlers.showStatus(actuallyPlaying ? "⏸" : "▶");
        }
      }}
    >
      <FullscreenStatusMessage statusMessage={statusMessage} />

      {/* Activity Indicator */}
      <AnimatePresence>
        {isAnyActivityActive && (
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
            {activityState && (
            <ActivityIndicatorWithLabel
              size={32}
              state={activityState}
            />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile close button (top right, visible only on mobile) */}
      {onClose && (
        <FullscreenMobileDismiss
          visible={showControls || !getActualPlayerState()}
          forceVisible={anyMenuOpen}
          onDismiss={onClose}
          onInteraction={registerActivity}
        />
      )}

      <div
        className="flex-1 min-h-0"
        {...(onSurfaceLongPress
          ? {
              onMouseDown: surfaceLongPress.onMouseDown,
              onMouseMove: surfaceLongPress.onMouseMove,
              onMouseUp: surfaceLongPress.onMouseUp,
              onMouseLeave: surfaceLongPress.onMouseLeave,
              onTouchStart: surfaceLongPress.onTouchStart,
              onTouchMove: surfaceLongPress.onTouchMove,
              onTouchEnd: surfaceLongPress.onTouchEnd,
              onTouchCancel: surfaceLongPress.onTouchCancel,
            }
          : {})}
      >
        {typeof children === "function"
          ? (
              children as (ctx: {
                controlsVisible: boolean;
                isLangMenuOpen: boolean;
                consumeSurfaceLongPressClick?: () => boolean;
              }) => ReactNode
            )({
                controlsVisible:
                  showControls || anyMenuOpen || !getActualPlayerState(),
                isLangMenuOpen,
                consumeSurfaceLongPressClick: onSurfaceLongPress
                  ? surfaceLongPress.consumeClickIfLongPressFired
                  : undefined,
            })
          : children}
      </div>

      {/* Inline toolbar */}
      <div
        data-toolbar
        className={cn(
          "fixed bottom-0 left-0 right-0 flex justify-center z-[10001] transition-opacity duration-200",
          !suppressToolbar &&
          (showControls || anyMenuOpen || !getActualPlayerState())
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
          isShuffled={isShuffled}
          onToggleShuffle={toggleShuffle}
          displayMode={displayMode}
          onDisplayModeSelect={onDisplayModeSelect}
          displayModeOptions={displayModeOptions}
          onSyncMode={onSyncMode}
          currentAlignment={currentAlignment}
          onAlignmentCycle={onCycleAlignment}
          currentFont={currentLyricsFont}
          onFontCycle={onCycleLyricsFont}
          romanization={romanization}
          onRomanizationChange={onRomanizationChange}
          karaokeKtvRoomFxEnabled={karaokeKtvRoomFxEnabled}
          onToggleKaraokeKtvRoomFx={onToggleKaraokeKtvRoomFx}
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

export interface MediaFullScreenVideoPortalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onTogglePlay: () => void;
  onEnded: () => void;
  onProgress: (state: { playedSeconds: number }) => void;
  onDuration: (duration: number) => void;
  onReady: () => void;
  loop: boolean;
  volume: number;
  playerRef: React.RefObject<ReactPlayer>;
  onSeek: (time: number) => void;
  onNext?: () => void;
  onPrevious?: () => void;
  /** When set (e.g. TV), Arrow Up/Down step the broadcast channel instead of playlist items. */
  onChannelNext?: () => void;
  onChannelPrev?: () => void;
  showStatus?: (message: string) => void;
  statusMessage?: string | null;
  isShuffled?: boolean;
  onToggleShuffle?: () => void;
  /**
   * Optional content rendered above the video but below the on-screen
   * status / toolbar overlays. Used by callers (e.g. TV's MTV channel) to
   * draw a single-line lyric ticker without coupling that logic to the
   * shared portal.
   */
  videoOverlay?: ReactNode;
}

interface VideoPortalUiState {
  showControls: boolean;
  isLangMenuOpen: boolean;
}

const videoPortalInitialState: VideoPortalUiState = {
  showControls: true,
  isLangMenuOpen: false,
};

type VideoPortalUiAction =
  | { type: "setShowControls"; value: boolean }
  | { type: "setLangMenuOpen"; value: boolean };

function videoPortalReducer(
  state: VideoPortalUiState,
  action: VideoPortalUiAction
): VideoPortalUiState {
  switch (action.type) {
    case "setShowControls":
      return { ...state, showControls: action.value };
    case "setLangMenuOpen":
      return { ...state, isLangMenuOpen: action.value };
    default:
      return state;
  }
}

/** Videos / TV fullscreen portal with embedded YouTube player. */
export function MediaFullScreenVideoPortal({
  isOpen,
  onClose,
  url,
  isPlaying,
  onPlay,
  onPause,
  onTogglePlay,
  onEnded,
  onProgress,
  onDuration,
  onReady,
  loop,
  volume,
  playerRef,
  onSeek,
  onNext,
  onPrevious,
  onChannelNext,
  onChannelPrev,
  showStatus,
  statusMessage,
  isShuffled,
  onToggleShuffle,
  videoOverlay,
}: MediaFullScreenVideoPortalProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, dispatch] = useReducer(videoPortalReducer, videoPortalInitialState);
  const { showControls, isLangMenuOpen } = state;
  const setIsLangMenuOpen = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      dispatch({
        type: "setLangMenuOpen",
        value: typeof value === "function" ? value(state.isLangMenuOpen) : value,
      });
    },
    [state.isLangMenuOpen]
  );
  const hideControlsTimeoutRef = useRef<number | null>(null);

  const getActualPlayerState = useCallback(
    () => getMediaPlayerIsPlaying(playerRef, isPlaying),
    [playerRef, isPlaying]
  );

  const restartAutoHideTimer = useCallback(() => {
    dispatch({ type: "setShowControls", value: true });
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    const actuallyPlaying = getActualPlayerState();
    if (actuallyPlaying && !isLangMenuOpen) {
      hideControlsTimeoutRef.current = window.setTimeout(() => {
        dispatch({ type: "setShowControls", value: false });
      }, 2000);
    }
  }, [getActualPlayerState, isLangMenuOpen]);

  useRequestFullscreenElement(containerRef, isOpen);
  useCloseOnNativeFullscreenExit(onClose, isOpen);

  useEffect(() => {
    if (!isOpen) return;

    const handleActivity = () => {
      dispatch({ type: "setShowControls", value: true });
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
      const actuallyPlaying = getActualPlayerState();
      if (actuallyPlaying && !isLangMenuOpen) {
        hideControlsTimeoutRef.current = window.setTimeout(() => {
          dispatch({ type: "setShowControls", value: false });
        }, 2000);
      }
    };

    window.addEventListener("mousemove", handleActivity, { passive: true });
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("touchstart", handleActivity, { passive: true });
    window.addEventListener("click", handleActivity, { passive: true });

    const actuallyPlayingOnMount = getActualPlayerState();
    if (actuallyPlayingOnMount && !isLangMenuOpen) {
      hideControlsTimeoutRef.current = window.setTimeout(() => {
        dispatch({ type: "setShowControls", value: false });
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
  }, [isOpen, isLangMenuOpen, getActualPlayerState]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === " ") {
        e.preventDefault();
        onTogglePlay();
        restartAutoHideTimer();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (playerRef.current) {
          const currentTime = playerRef.current.getCurrentTime();
          const newTime = Math.max(0, currentTime - 10);
          onSeek(newTime);
          showStatus?.("⏪ -10s");
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (playerRef.current) {
          const currentTime = playerRef.current.getCurrentTime();
          const duration = playerRef.current.getDuration();
          const newTime = Math.min(duration, currentTime + 10);
          onSeek(newTime);
          showStatus?.("⏩ +10s");
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (onChannelPrev && onChannelNext) {
          onChannelPrev();
        } else if (onPrevious) {
          onPrevious();
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (onChannelPrev && onChannelNext) {
          onChannelNext();
        } else if (onNext) {
          onNext();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isOpen,
    onClose,
    onTogglePlay,
    onSeek,
    onNext,
    onPrevious,
    onChannelNext,
    onChannelPrev,
    showStatus,
    playerRef,
    restartAutoHideTimer,
  ]);

  if (!isOpen) return null;

  const controlsVisible =
    showControls || isLangMenuOpen || !getActualPlayerState();

  return createPortal(
    <div
      ref={containerRef}
      className={FULLSCREEN_ROOT_CLASS}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("[data-toolbar]")) {
          return;
        }
        onTogglePlay();
        restartAutoHideTimer();
      }}
    >
      <FullscreenStatusMessage
        statusMessage={statusMessage}
        pointerEventsNone
      />

      <FullscreenMobileDismiss
        visible={controlsVisible}
        forceVisible={isLangMenuOpen}
        onDismiss={onClose}
        onInteraction={restartAutoHideTimer}
      />

      <div className="flex-1 min-h-0 relative overflow-hidden">
        {videoOverlay ? (
          <div className="pointer-events-none absolute inset-0 z-30">
            {videoOverlay}
          </div>
        ) : null}
        <div className="absolute inset-0 w-full h-full">
          <div
            className="w-full absolute"
            style={{
              height: "calc(100% + clamp(480px, 60dvh, 800px))",
              top: "calc(-1 * clamp(240px, 30dvh, 400px))",
            }}
          >
            <div className="w-full h-full pointer-events-none">
              <YouTubePlayer
                ref={playerRef}
                url={url}
                playing={isPlaying}
                controls={false}
                width="100%"
                height="100%"
                volume={volume}
                loop={loop}
                progressInterval={100}
                onEnded={onEnded}
                onProgress={onProgress}
                onDuration={onDuration}
                onPlay={onPlay}
                onPause={onPause}
                onReady={onReady}
                config={{
                  youtube: {
                    playerVars: { fs: 1 },
                  },
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div
        data-toolbar
        className={cn(
          "fixed bottom-0 left-0 right-0 flex justify-center z-[10001] transition-opacity duration-200",
          controlsVisible
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        )}
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)",
        }}
        onClick={(e) => {
          e.stopPropagation();
          restartAutoHideTimer();
        }}
      >
        <FullscreenPlayerControls
          isPlaying={getActualPlayerState()}
          onPrevious={onPrevious || (() => {})}
          onPlayPause={onTogglePlay}
          onNext={onNext || (() => {})}
          isShuffled={isShuffled}
          onToggleShuffle={onToggleShuffle}
          onChannelUp={onChannelNext}
          onChannelDown={onChannelPrev}
          channelUpLabel={t("apps.tv.status.channelUp")}
          channelDownLabel={t("apps.tv.status.channelDown")}
          channelUpTitle={t("apps.tv.menu.channelUp")}
          channelDownTitle={t("apps.tv.menu.channelDown")}
          currentAlignment={LyricsAlignment.Center}
          onAlignmentCycle={() => {}}
          currentFont={LyricsFont.SansSerif}
          onFontCycle={() => {}}
          currentTranslationCode={null}
          onTranslationSelect={() => {}}
          translationLanguages={[]}
          isLangMenuOpen={isLangMenuOpen}
          setIsLangMenuOpen={setIsLangMenuOpen}
          onClose={onClose}
          variant="responsive"
          bgOpacity="35"
          onInteraction={restartAutoHideTimer}
          portalContainer={containerRef.current}
          hideLyricsControls={true}
        />
      </div>
    </div>,
    document.body
  );
}
