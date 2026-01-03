import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import ReactPlayer from "react-player";
import { cn } from "@/lib/utils";
import { FullscreenPlayerControls } from "@/components/shared/FullscreenPlayerControls";
import { LyricsAlignment, LyricsFont } from "@/types/lyrics";

interface VideoFullScreenPortalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onTogglePlay: () => void; // User-initiated toggle (bypasses transition guards)
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
  showStatus?: (message: string) => void;
  statusMessage?: string | null;
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
  showStatus,
  statusMessage,
}: VideoFullScreenPortalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showControls, setShowControls] = useState(true);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const hideControlsTimeoutRef = useRef<number | null>(null);
  
  // Note: Player time sync is handled by the parent component (VideosAppComponent)
  // which waits for the player to be ready before seeking

  // Helper function to restart the auto-hide timer
  const restartAutoHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    if (isPlaying) {
      hideControlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying]);

  // Effect to request fullscreen when component mounts
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

  // Handle fullscreen exit
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

  // Auto-hide controls after inactivity
  useEffect(() => {
    if (!isOpen) return;

    const handleActivity = () => {
      setShowControls(true);
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
      if (isPlaying) {
        hideControlsTimeoutRef.current = window.setTimeout(() => {
          setShowControls(false);
        }, 3000);
      }
    };

    window.addEventListener("mousemove", handleActivity, { passive: true });
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("touchstart", handleActivity, { passive: true });
    window.addEventListener("click", handleActivity, { passive: true });

    if (isPlaying) {
      hideControlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 3000);
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
  }, [isOpen, isPlaying]);

  // Keyboard controls
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === " ") {
        e.preventDefault();
        // Use toggle for user-initiated actions (bypasses transition guards)
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
      } else if (e.key === "ArrowUp" && onPrevious) {
        e.preventDefault();
        onPrevious();
      } else if (e.key === "ArrowDown" && onNext) {
        e.preventDefault();
        onNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isPlaying, onClose, onTogglePlay, onSeek, onNext, onPrevious, showStatus, playerRef, restartAutoHideTimer]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={containerRef}
      className="ipod-force-font fixed inset-0 z-[9999] bg-black select-none flex flex-col"
      onClick={() => {
        // Use toggle for user-initiated actions (bypasses transition guards)
        onTogglePlay();
        restartAutoHideTimer();
      }}
    >
      {/* Status Display */}
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

      <div className="flex-1 min-h-0 relative overflow-hidden">
        <div className="absolute inset-0 w-full h-full">
          <div
            className="w-full absolute"
            style={{
              height: "calc(100% + clamp(480px, 60dvh, 800px))",
              top: "calc(-1 * clamp(240px, 30dvh, 400px))",
            }}
          >
            <div className="w-full h-full pointer-events-none">
              <ReactPlayer
                ref={playerRef}
                url={url}
                playing={isPlaying}
                controls={false}
                width="100%"
                height="100%"
                volume={volume}
                loop={loop}
                playsinline={true}
                progressInterval={100}
                onEnded={onEnded}
                onProgress={onProgress}
                onDuration={onDuration}
                onPlay={onPlay}
                onPause={onPause}
                onReady={onReady}
                config={{
                  youtube: {
                    playerVars: {
                      modestbranding: 1,
                      rel: 0,
                      showinfo: 0,
                      iv_load_policy: 3,
                      fs: 1,
                      disablekb: 1,
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
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div
        data-toolbar
        className={cn(
          "fixed bottom-0 left-0 right-0 flex justify-center z-[10001] transition-opacity duration-200",
          showControls || isLangMenuOpen || !isPlaying
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
          isPlaying={isPlaying}
          onPrevious={onPrevious || (() => {})}
          onPlayPause={onTogglePlay}
          onNext={onNext || (() => {})}
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
