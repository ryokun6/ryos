import { useMemo } from "react";
import { motion } from "framer-motion";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/useThemeStore";
import { useOffline } from "@/hooks/useOffline";
import { useTranslation } from "react-i18next";
import { useIsPhone } from "@/hooks/useIsPhone";
import { getYouTubeVideoId, formatKugouImageUrl } from "../constants";
import type { PipPlayerProps } from "../types";
import { SkipBack, SkipForward, Play, Pause, MusicNote } from "@phosphor-icons/react";

export function PipPlayer({
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

  // Use track's cover (from Kugou, fetched during library sync), fallback to YouTube thumbnail
  const youtubeVideoId = currentTrack?.url
    ? getYouTubeVideoId(currentTrack.url)
    : null;
  const youtubeThumbnail = youtubeVideoId
    ? `https://img.youtube.com/vi/${youtubeVideoId}/mqdefault.jpg`
    : null;
  const thumbnailUrl = formatKugouImageUrl(currentTrack?.cover) ?? youtubeThumbnail;

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
        "fixed z-[1] flex items-center gap-3 bg-black/40 backdrop-blur-xl rounded-xl shadow-2xl p-2 cursor-pointer select-none",
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
      <div
        className="relative w-12 h-12 flex-shrink-0 overflow-hidden rounded"
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={currentTrack?.title || ""}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/10 text-white/40">
            <MusicNote size={24} weight="fill" />
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
          <SkipBack size={16} weight="fill" />
        </button>

        <button
          onClick={onTogglePlay}
          onTouchStart={(e) => e.stopPropagation()}
          disabled={isOffline}
          className="w-9 h-9 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 touch-manipulation"
          aria-label={t("apps.ipod.ariaLabels.playPause")}
        >
          {isPlaying ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" />}
        </button>

        <button
          onClick={onNextTrack}
          onTouchStart={(e) => e.stopPropagation()}
          className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors touch-manipulation"
          aria-label={t("apps.ipod.ariaLabels.nextTrack")}
        >
          <SkipForward size={16} weight="fill" />
        </button>
      </div>
    </motion.div>,
    document.body
  );
}
