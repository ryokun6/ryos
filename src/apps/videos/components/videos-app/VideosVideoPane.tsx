import { motion, AnimatePresence } from "motion/react";
import { YouTubePlayer } from "@/components/shared/YouTubePlayer";
import { SeekBar } from "../SeekBar";
import { LcdStatusDisplay } from "@/components/shared/lcd/LcdStatusDisplay";
import { VideosWhiteNoiseOverlay } from "./VideosWhiteNoise";
import { STATUS_FADE_TRANSITION } from "@/components/shared/lcd/lcdMotionConstants";
import type { VideosAppController } from "./useVideosAppController";

type VideosVideoPaneProps = {
  c: VideosAppController;
  shouldShowWhiteNoise: boolean;
};

export function VideosVideoPane({
  c,
  shouldShowWhiteNoise,
}: VideosVideoPaneProps) {
  const {
    t,
    videos,
    setIsAddDialogOpen,
    getCurrentVideo,
    isPlaying,
    isFullScreen,
    playerRef,
    handleVideoEnd,
    handleProgress,
    handleDuration,
    handlePlay,
    handleMainPlayerPause,
    handleReady,
    loopCurrent,
    setIsVideoHovered,
    duration,
    playedSeconds,
    handleSeek,
    isVideoHovered,
    setIsDraggingSeek,
    setDragSeekTime,
    statusMessage,
    handleOverlayPointerDown,
    handleOverlayPointerMove,
    handleOverlayPointerUp,
    handleOverlayPointerCancel,
  } = c;

  if (videos.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-400 font-geneva-12 text-sm">
        <a
          onClick={() => setIsAddDialogOpen(true)}
          className="text-[#ff00ff] hover:underline cursor-pointer"
        >
          {t("apps.videos.status.addVideos")}
        </a>
        &nbsp;{t("apps.videos.status.toGetStarted")}
      </div>
    );
  }

  return (
    <div
      className="w-full h-full overflow-hidden relative"
      onMouseEnter={() => setIsVideoHovered(true)}
      onMouseLeave={() => setIsVideoHovered(false)}
    >
      <div className="w-full h-[calc(100%+300px)] mt-[-150px] relative">
        {!isFullScreen && (
          <YouTubePlayer
            ref={playerRef}
            url={getCurrentVideo()?.url || ""}
            playing={isPlaying && !isFullScreen}
            controls={false}
            width="calc(100% + 1px)"
            height="calc(100% + 1px)"
            onEnded={handleVideoEnd}
            onProgress={handleProgress}
            onDuration={handleDuration}
            onPlay={handlePlay}
            onPause={handleMainPlayerPause}
            onReady={handleReady}
            loop={loopCurrent}
            config={{
              youtube: {
                playerVars: { fs: 0, autoplay: 0 },
              },
            }}
          />
        )}
        <AnimatePresence>
          {shouldShowWhiteNoise && (
            <motion.div
              initial={{ opacity: 0, scale: 1.15 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.15 }}
              transition={{
                duration: 0.2,
                delay: 0.1,
                ease: [0.4, 0, 0.2, 1],
              }}
              className="absolute z-10"
              style={{
                top: 0,
                left: 0,
                right: "-1px",
                bottom: "-1px",
                width: "calc(100% + 1px)",
                height: "calc(100% + 1px)",
              }}
            >
              <VideosWhiteNoiseOverlay />
            </motion.div>
          )}
        </AnimatePresence>
        <div
          className="absolute inset-0 cursor-pointer z-20"
          aria-label={
            isPlaying
              ? t("apps.videos.menu.pause")
              : t("apps.videos.menu.play")
          }
          onPointerDown={handleOverlayPointerDown}
          onPointerMove={handleOverlayPointerMove}
          onPointerUp={handleOverlayPointerUp}
          onPointerCancel={handleOverlayPointerCancel}
        />
      </div>
      <div className="absolute bottom-0 left-0 right-0 z-30">
        <SeekBar
          duration={duration}
          currentTime={playedSeconds}
          onSeek={handleSeek}
          isPlaying={isPlaying}
          isHovered={isVideoHovered}
          onDragChange={(isDragging, seekTime) => {
            setIsDraggingSeek(isDragging);
            if (seekTime !== undefined) {
              setDragSeekTime(seekTime);
            }
          }}
        />
      </div>
      <AnimatePresence>
        {statusMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={STATUS_FADE_TRANSITION}
            className="absolute top-4 left-4 z-40"
          >
            <LcdStatusDisplay message={statusMessage} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
