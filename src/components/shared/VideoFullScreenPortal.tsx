import { useReducer, useRef, useEffect, useCallback, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import type ReactPlayer from "react-player";
import { cn } from "@/lib/utils";
import { FullscreenPlayerControls } from "@/components/shared/FullscreenPlayerControls";
import { FullscreenMobileDismiss } from "@/components/shared/FullscreenMobileDismiss";
import { LyricsAlignment, LyricsFont } from "@/types/lyrics";
import { YouTubePlayer } from "@/components/shared/YouTubePlayer";
import { useTranslation } from "react-i18next";

interface VideoFullScreenPortalProps {
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

interface PortalUiState {
  showControls: boolean;
  isLangMenuOpen: boolean;
}

const initialState: PortalUiState = {
  showControls: true,
  isLangMenuOpen: false,
};

type PortalUiAction =
  | { type: "setShowControls"; value: boolean }
  | { type: "setLangMenuOpen"; value: boolean };

function reducer(state: PortalUiState, action: PortalUiAction): PortalUiState {
  switch (action.type) {
    case "setShowControls":
      return { ...state, showControls: action.value };
    case "setLangMenuOpen":
      return { ...state, isLangMenuOpen: action.value };
    default:
      return state;
  }
}

export function VideoFullScreenPortal({
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
}: VideoFullScreenPortalProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, dispatch] = useReducer(reducer, initialState);
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

  const getActualPlayerState = useCallback(() => {
    const internalPlayer = playerRef.current?.getInternalPlayer?.();
    if (internalPlayer && typeof internalPlayer.getPlayerState === "function") {
      const playerState = internalPlayer.getPlayerState();
      return playerState === 1;
    }
    return isPlaying;
  }, [playerRef, isPlaying]);

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

  useEffect(() => {
    if (!isOpen) return;

    const timeoutId = setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.requestFullscreen().catch((err) => {
          console.error("Error attempting to enable fullscreen:", err);
        });
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        onClose();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [isOpen, onClose]);

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
      className="ipod-force-font fixed inset-0 z-[9999] bg-black select-none flex flex-col"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("[data-toolbar]")) {
          return;
        }
        onTogglePlay();
        restartAutoHideTimer();
      }}
    >
      <AnimatePresence>
        {statusMessage && (
          <motion.div
            className="absolute inset-0 z-40 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div
              className="absolute"
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
          controlsVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
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
