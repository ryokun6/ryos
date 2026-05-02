import { useState, useRef, useEffect, type RefObject } from "react";
import { motion, AnimatePresence, useIsPresent } from "framer-motion";
import ReactPlayer from "react-player";
import { YouTubePlayer } from "@/components/shared/YouTubePlayer";
import { cn } from "@/lib/utils";
import { AppProps, VideosInitialData } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { VideosMenuBar } from "./VideosMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { appMetadata } from "..";
import { Button } from "@/components/ui/button";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { SeekBar } from "./SeekBar";
import { getTranslatedAppName } from "@/utils/i18n";
import { VideoFullScreenPortal } from "@/components/shared/VideoFullScreenPortal";
import { useVideosLogic } from "../hooks/useVideosLogic";
import { SkipBack, SkipForward, Play, Pause } from "@phosphor-icons/react";

function AnimatedDigit({
  digit,
  direction,
}: {
  digit: string;
  direction: "next" | "prev";
}) {
  const yOffset = direction === "next" ? 30 : -30;

  return (
    <div className="relative w-[0.6em] h-[28px] overflow-hidden inline-block">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={digit}
          initial={{ y: yOffset, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: yOffset, opacity: 0 }}
          transition={{
            y: {
              type: "spring",
              stiffness: 300,
              damping: 30,
            },
            opacity: {
              duration: 0.2,
            },
          }}
          className="absolute inset-0 flex justify-center"
        >
          {digit}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function AnimatedNumber({ number }: { number: number }) {
  const [prevNumber, setPrevNumber] = useState(number);
  const direction = number > prevNumber ? "next" : "prev";

  useEffect(() => {
    setPrevNumber(number);
  }, [number]);

  const digits = String(number).padStart(2, "0").split("");
  return (
    <div className="flex">
      {digits.map((digit, index) => (
        <AnimatedDigit key={index} digit={digit} direction={direction} />
      ))}
    </div>
  );
}

// Right-edge fade applied to the LCD title marquee when it overflows but
// is not actively scrolling (e.g. when playback is paused). Uses
// mask-image so the fade is theme-agnostic — transparent at the right
// edge regardless of the LCD background color (black on most themes,
// sage green on macOS X).
const STATIC_OVERFLOW_MASK_STYLE: React.CSSProperties = {
  maskImage:
    "linear-gradient(to right, black calc(100% - 32px), transparent)",
  WebkitMaskImage:
    "linear-gradient(to right, black calc(100% - 32px), transparent)",
};

function AnimatedTitle({
  title,
  direction,
  isPlaying,
}: {
  title: string;
  direction: "next" | "prev";
  isPlaying: boolean;
}) {
  const yOffset = direction === "next" ? 30 : -30;

  // Detect when the (paused) title is wider than its viewport so we can
  // soften the hard right-edge clip with a fade mask. We measure an
  // invisible copy that mirrors the rendered padding/font of the real
  // marquee text.
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const check = () => {
      setOverflows(measure.scrollWidth > container.clientWidth + 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(container);
    return () => ro.disconnect();
  }, [title]);

  const showStaticFade = overflows && !isPlaying;

  return (
    <div
      ref={containerRef}
      className="relative h-[22px] mb-[3px] overflow-hidden"
      style={showStaticFade ? STATIC_OVERFLOW_MASK_STYLE : undefined}
    >
      <span
        ref={measureRef}
        aria-hidden
        className="invisible absolute font-geneva-12 text-xl px-2 whitespace-nowrap pointer-events-none"
      >
        {title}
      </span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={title}
          initial={{ y: yOffset, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: yOffset, opacity: 0 }}
          transition={{
            y: {
              type: "spring",
              stiffness: 300,
              damping: 30,
            },
            opacity: {
              duration: 0.2,
            },
          }}
          className="absolute inset-0 flex whitespace-nowrap"
        >
          <motion.div
            initial={{ x: "0%" }}
            animate={{ x: isPlaying ? "-100%" : "0%" }}
            transition={
              isPlaying
                ? {
                    duration: 20,
                    ease: "linear",
                    repeat: Infinity,
                    repeatType: "loop",
                  }
                : {
                    duration: 0.3,
                  }
            }
            className={cn(
              "shrink-0 font-geneva-12 text-xl px-2 transition-colors duration-300 -mt-1 animated-title-text",
              isPlaying ? "text-[#ff00ff]" : "text-neutral-600",
              !isPlaying && "opacity-50"
            )}
          >
            {title}
          </motion.div>
          <motion.div
            initial={{ x: "0%" }}
            animate={{ x: isPlaying ? "-100%" : "0%" }}
            transition={
              isPlaying
                ? {
                    duration: 20,
                    ease: "linear",
                    repeat: Infinity,
                    repeatType: "loop",
                  }
                : {
                    duration: 0.3,
                  }
            }
            className={cn(
              "shrink-0 font-geneva-12 text-xl px-2 transition-colors duration-300 -mt-1 animated-title-text",
              isPlaying ? "text-[#ff00ff]" : "text-neutral-600",
              !isPlaying && "opacity-50"
            )}
            aria-hidden
          >
            {title}
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function WhiteNoiseEffect({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const brightnessAnimationFrameRef = useRef<number | null>(null);
  const brightnessRef = useRef(0);

  useEffect(() => {
    if (!active) {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let imageData: ImageData | null = null;
    let pixels32: Uint32Array | null = null;

    const resizeCanvas = () => {
      // Render at 1/1.5x CSS resolution; the browser upscales each
      // canvas pixel ~1.5x on screen, giving slightly chunky analog
      // grain without the per-frame fill cost of full-res.
      const width = Math.max(1, Math.floor(canvas.offsetWidth / 1.5));
      const height = Math.max(1, Math.floor(canvas.offsetHeight / 1.5));
      const sizeChanged = canvas.width !== width || canvas.height !== height;
      if (sizeChanged) {
        canvas.width = width;
        canvas.height = height;
      }
      if (sizeChanged || !imageData || !pixels32) {
        imageData = ctx.createImageData(width, height);
        pixels32 = new Uint32Array(imageData.data.buffer);
      }
    };

    const drawNoise = () => {
      if (!imageData || !pixels32) {
        animationFrameRef.current = requestAnimationFrame(drawNoise);
        return;
      }

      const brightness = brightnessRef.current;
      const len = pixels32.length;
      for (let i = 0; i < len; i++) {
        const value = (Math.random() * 255 * brightness) | 0;
        pixels32[i] = 0xff000000 | (value << 16) | (value << 8) | value;
      }

      // Add scan lines using the packed pixel view to keep the frame loop cheap.
      for (let y = 0; y < canvas.height; y += 2) {
        const rowStart = y * canvas.width;
        const rowEnd = rowStart + canvas.width;
        for (let i = rowStart; i < rowEnd; i++) {
          const value = ((pixels32[i] & 0xff) * 205) >> 8;
          pixels32[i] = 0xff000000 | (value << 16) | (value << 8) | value;
        }
      }

      ctx.putImageData(imageData, 0, 0);
      animationFrameRef.current = requestAnimationFrame(drawNoise);
    };

    resizeCanvas();
    drawNoise();

    window.addEventListener("resize", resizeCanvas);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      imageData = null;
      pixels32 = null;
    };
  }, [active]);

  // Animate brightness
  useEffect(() => {
    if (!active) {
      if (brightnessAnimationFrameRef.current !== null) {
        cancelAnimationFrame(brightnessAnimationFrameRef.current);
        brightnessAnimationFrameRef.current = null;
      }
      brightnessRef.current = 0;
      return;
    }

    const duration = 1000; // 1 second animation
    const startTime = performance.now();
    const startBrightness = 0;
    const targetBrightness = 1;
    brightnessRef.current = startBrightness;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3); // Cubic ease out
      brightnessRef.current = startBrightness + (targetBrightness - startBrightness) * easeOut;

      if (progress < 1) {
        brightnessAnimationFrameRef.current = requestAnimationFrame(animate);
      } else {
        brightnessAnimationFrameRef.current = null;
      }
    };

    brightnessAnimationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (brightnessAnimationFrameRef.current !== null) {
        cancelAnimationFrame(brightnessAnimationFrameRef.current);
        brightnessAnimationFrameRef.current = null;
      }
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: "-1px",
        bottom: "-1px",
        width: "calc(100% + 1px)",
        height: "calc(100% + 1px)",
      }}
    />
  );
}

function WhiteNoiseOverlay() {
  const isPresent = useIsPresent();

  return <WhiteNoiseEffect active={isPresent} />;
}

function StatusDisplay({ message }: { message: string }) {
  return (
    <div className="relative videos-status">
      <div className="font-geneva-12 text-white text-xl relative z-10">
        {message}
      </div>
      <div
        className="font-geneva-12 text-black text-xl absolute inset-0"
        style={{
          WebkitTextStroke: "3px black",
          textShadow: "none",
        }}
      >
        {message}
      </div>
    </div>
  );
}

export function VideosAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  initialData,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps<VideosInitialData>) {
  const {
    t,
    translatedHelpItems,
    videos,
    setVideos,
    currentVideoId,
    safeSetCurrentVideoId,
    getCurrentIndex,
    getCurrentVideo,
    loopCurrent,
    setLoopCurrent,
    loopAll,
    setLoopAll,
    isShuffled,
    isPlaying,
    setIsPlaying,
    animationDirection,
    setOriginalOrder,
    urlInput,
    setUrlInput,
    isAddDialogOpen,
    setIsAddDialogOpen,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isConfirmClearOpen,
    setIsConfirmClearOpen,
    isConfirmResetOpen,
    setIsConfirmResetOpen,
    isAddingVideo,
    isFullScreen,
    elapsedTime,
    statusMessage,
    isShareDialogOpen,
    setIsShareDialogOpen,
    duration,
    playedSeconds,
    isVideoHovered,
    setIsVideoHovered,
    isDraggingSeek,
    setIsDraggingSeek,
    dragSeekTime,
    setDragSeekTime,
    playerRef,
    fullScreenPlayerRef,
    isXpTheme,
    isMacOSTheme,
    masterVolume,
    nextVideo,
    previousVideo,
    togglePlay,
    toggleShuffle,
    handleVideoEnd,
    handleProgress,
    handleDuration,
    handleSeek,
    handlePlay,
    handlePause,
    handleMainPlayerPause,
    handleReady,
    handleFullScreen,
    handleCloseFullScreen,
    toggleFullScreen,
    handleShareVideo,
    videosGenerateShareUrl,
    addVideo,
    showStatus,
    formatTime,
    handleOverlayPointerDown,
    handleOverlayPointerMove,
    handleOverlayPointerUp,
    handleOverlayPointerCancel,
    DEFAULT_VIDEOS,
  } = useVideosLogic({
    isWindowOpen,
    isForeground,
    initialData,
    instanceId,
  });

  const shouldShowWhiteNoise = videos.length > 0 && !isPlaying && !isFullScreen;

  const menuBar = (
    <VideosMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      videos={videos}
      currentVideoId={currentVideoId}
      onPlayVideo={(videoId) => {
        safeSetCurrentVideoId(videoId);
        setIsPlaying(true);
      }}
      onClearPlaylist={() => {
        setIsConfirmClearOpen(true);
      }}
      onResetPlaylist={() => {
        setIsConfirmResetOpen(true);
      }}
      onShufflePlaylist={toggleShuffle}
      onToggleLoopAll={() => setLoopAll(!loopAll)}
      onToggleLoopCurrent={() => setLoopCurrent(!loopCurrent)}
      onTogglePlay={() => {
        togglePlay();
      }}
      onNext={nextVideo}
      onPrevious={previousVideo}
      onAddVideo={() => setIsAddDialogOpen(true)}
      onOpenVideo={() => {
        setIsAddDialogOpen(true);
      }}
      isPlaying={isPlaying}
      isLoopAll={loopAll}
      isLoopCurrent={loopCurrent}
      isShuffled={isShuffled}
      onFullScreen={handleFullScreen}
      onShareVideo={handleShareVideo}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={getTranslatedAppName("videos")}
        onClose={onClose}
        isForeground={isForeground}
        appId="videos"
        material={isMacOSTheme ? "brushedmetal" : "default"}
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
        onFullscreenToggle={toggleFullScreen}
      >
        <div className={cn("flex flex-col w-full h-full text-white", isMacOSTheme ? "bg-transparent" : "bg-[#1a1a1a]")}>
          <div
            className="flex-1 relative overflow-hidden"
            style={isMacOSTheme ? {
              border: "1px solid rgba(0, 0, 0, 0.55)",
              boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.4)",
            } : undefined}
          >
            {videos.length > 0 ? (
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
                  {/* White noise effect (z-10) */}
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
                        <WhiteNoiseOverlay />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {/* Pointer-interaction overlay for play/pause + swipe-to-show-seekbar (z-20) */}
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
                {/* SeekBar positioned at the bottom (z-30) - moved outside oversized container */}
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
                {/* Status Display (z-40) - moved outside oversized container */}
                <AnimatePresence>
                  {statusMessage && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="absolute top-4 left-4 z-40"
                    >
                      <StatusDisplay message={statusMessage} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 font-geneva-12 text-sm">
                <a
                  onClick={() => setIsAddDialogOpen(true)}
                  className="text-[#ff00ff] hover:underline cursor-pointer"
                >
                  {t("apps.videos.status.addVideos")}
                </a>
                &nbsp;{t("apps.videos.status.toGetStarted")}
              </div>
            )}
          </div>

          {/* Retro CD Player Controls */}
          <div
            className={cn(
              "flex flex-col gap-4",
              isMacOSTheme ? "bg-transparent p-2 pt-4 border-t-0" : "bg-[#2a2a2a] os-toolbar-texture p-4 border-t border-[#3a3a3a]"
            )}
          >
            {/* LCD Display */}
            <div className="videos-lcd bg-black py-2 px-4 flex items-center justify-between w-full">
              <div className="flex items-center gap-8">
                <div
                  className={cn(
                    "font-geneva-12 text-[10px] transition-colors duration-300",
                    isPlaying ? "text-[#ff00ff]" : "text-neutral-600"
                  )}
                >
                  <div>{t("apps.videos.status.track")}</div>
                  <div className="text-xl">
                    <AnimatedNumber number={getCurrentIndex() + 1} />
                  </div>
                </div>
                <div
                  className={cn(
                    "font-geneva-12 text-[10px] transition-colors duration-300",
                    isPlaying ? "text-[#ff00ff]" : "text-neutral-600"
                  )}
                >
                  <div>{t("apps.videos.status.time")}</div>
                  <div className="text-xl">
                    {formatTime(
                      isDraggingSeek ? Math.floor(dragSeekTime) : elapsedTime
                    )}
                  </div>
                </div>
              </div>
              <div className="relative overflow-hidden flex-1 px-2">
                <div
                  className={cn(
                    "font-geneva-12 text-[10px] transition-colors duration-300 mb-[3px] pl-2",
                    isPlaying ? "text-[#ff00ff]" : "text-neutral-600"
                  )}
                >
                  {t("apps.videos.status.title")}
                </div>
                {videos.length > 0 && (
                  <div className="relative overflow-hidden">
                    <AnimatedTitle
                      title={
                        getCurrentVideo()?.artist
                          ? `${getCurrentVideo()?.title} - ${
                              getCurrentVideo()?.artist
                            }`
                          : getCurrentVideo()?.title || ""
                      }
                      direction={animationDirection}
                      isPlaying={isPlaying}
                    />
                    {/* Fade effects */}
                    {isPlaying && (
                      <div className="absolute left-0 top-0 h-full w-4 bg-gradient-to-r from-black to-transparent videos-lcd-fade-left" />
                    )}
                    <div className="absolute right-0 top-0 h-full w-4 bg-gradient-to-l from-black to-transparent videos-lcd-fade-right" />
                  </div>
                )}
              </div>
            </div>

            {/* All Controls in One Row */}
            <div className="flex items-center justify-between videos-player-controls">
              {/* Left Side: Playback Controls */}
              <div className="flex items-center gap-2">
                {isMacOSTheme ? (
                  <div className="metal-inset-btn-group">
                    <button type="button" className="metal-inset-btn metal-inset-icon" onClick={previousVideo} disabled={videos.length === 0}>
                      <SkipBack size={10} weight="fill" />
                    </button>
                    <button type="button" className="metal-inset-btn metal-inset-icon" onClick={togglePlay} disabled={videos.length === 0} style={{ minWidth: 32 }}>
                      {isPlaying ? <Pause size={10} weight="fill" /> : <Play size={10} weight="fill" />}
                    </button>
                    <button type="button" className="metal-inset-btn metal-inset-icon" onClick={nextVideo} disabled={videos.length === 0}>
                      <SkipForward size={10} weight="fill" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-0">
                    <button
                      onClick={previousVideo}
                      className={cn(
                        "flex items-center justify-center disabled:opacity-50 focus:outline-none",
                        "hover:brightness-75 active:brightness-50"
                      )}
                      disabled={videos.length === 0}
                    >
                      <img
                        src="/assets/videos/prev.png"
                        alt={t("apps.videos.menu.previous")}
                        width={32}
                        height={22}
                        className="pointer-events-none"
                      />
                    </button>
                    <button
                      onClick={togglePlay}
                      className={cn(
                        "flex items-center justify-center disabled:opacity-50 focus:outline-none",
                        "hover:brightness-75 active:brightness-50"
                      )}
                      disabled={videos.length === 0}
                    >
                      <img
                        src={
                          isPlaying
                            ? "/assets/videos/pause.png"
                            : "/assets/videos/play.png"
                        }
                        alt={
                          isPlaying
                            ? t("apps.videos.menu.pause")
                            : t("apps.videos.menu.play")
                        }
                        width={50}
                        height={22}
                        className="pointer-events-none"
                      />
                    </button>
                    <button
                      onClick={nextVideo}
                      className={cn(
                        "flex items-center justify-center disabled:opacity-50 focus:outline-none",
                        "hover:brightness-75 active:brightness-50"
                      )}
                      disabled={videos.length === 0}
                    >
                      <img
                        src="/assets/videos/next.png"
                        alt={t("apps.videos.menu.next")}
                        width={32}
                        height={22}
                        className="pointer-events-none"
                      />
                    </button>
                  </div>
                )}
              </div>

              {/* Right Side: Mode Switches */}
              <div className="flex items-center gap-2">
                {isMacOSTheme ? (
                  <>
                    <div className="metal-inset-btn-group">
                      <button type="button" className="metal-inset-btn font-geneva-12 !text-[11px]" onClick={toggleShuffle} data-state={isShuffled ? "on" : "off"}>
                        {t("apps.videos.status.shuffle")}
                      </button>
                      <button type="button" className="metal-inset-btn font-geneva-12 !text-[11px]" onClick={() => setLoopAll(!loopAll)} data-state={loopAll ? "on" : "off"}>
                        {t("apps.videos.status.repeat")}
                      </button>
                      <button type="button" className="metal-inset-btn font-geneva-12 !text-[11px]" onClick={() => setLoopCurrent(!loopCurrent)} data-state={loopCurrent ? "on" : "off"}>
                        {loopCurrent ? "↺" : "→"}
                      </button>
                    </div>
                    <div className="metal-inset-btn-group">
                      <button type="button" className="metal-inset-btn font-geneva-12 !text-[11px]" onClick={() => setIsAddDialogOpen(true)}>
                        {t("apps.videos.status.add")}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex gap-0">
                      <Button
                        onClick={toggleShuffle}
                        variant="player"
                        data-state={isShuffled ? "on" : "off"}
                        className="h-[22px] px-2"
                      >
                        {t("apps.videos.status.shuffle")}
                      </Button>
                      <Button
                        onClick={() => setLoopAll(!loopAll)}
                        variant="player"
                        data-state={loopAll ? "on" : "off"}
                        className="h-[22px] px-2"
                      >
                        {t("apps.videos.status.repeat")}
                      </Button>
                      <Button
                        onClick={() => setLoopCurrent(!loopCurrent)}
                        variant="player"
                        data-state={loopCurrent ? "on" : "off"}
                        className="h-[22px] px-2"
                      >
                        {loopCurrent ? "↺" : "→"}
                      </Button>
                    </div>
                    <Button
                      onClick={() => setIsAddDialogOpen(true)}
                      variant="player"
                      className="h-[22px] px-2"
                    >
                      {t("apps.videos.status.add")}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setIsHelpDialogOpen}
          helpItems={translatedHelpItems}
          appId="videos"
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={appMetadata}
          appId="videos"
        />
        <ConfirmDialog
          isOpen={isConfirmClearOpen}
          onOpenChange={setIsConfirmClearOpen}
          onConfirm={() => {
            setVideos([]);
            safeSetCurrentVideoId(null);
            setIsPlaying(false);
            setIsConfirmClearOpen(false);
          }}
          title={t("apps.videos.dialogs.clearPlaylistTitle")}
          description={t("apps.videos.dialogs.clearPlaylistDescription")}
        />
        <ConfirmDialog
          isOpen={isConfirmResetOpen}
          onOpenChange={setIsConfirmResetOpen}
          onConfirm={() => {
            setVideos(DEFAULT_VIDEOS);
            safeSetCurrentVideoId(
              DEFAULT_VIDEOS.length > 0 ? DEFAULT_VIDEOS[0].id : null
            );
            setIsPlaying(false);
            setOriginalOrder(DEFAULT_VIDEOS);
            setIsConfirmResetOpen(false);
            showStatus(t("apps.videos.status.playlistReset"));
          }}
          title={t("apps.videos.dialogs.resetPlaylistTitle")}
          description={t("apps.videos.dialogs.resetPlaylistDescription")}
        />
        <InputDialog
          isOpen={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          onSubmit={addVideo}
          title={t("apps.videos.dialogs.addVideoTitle")}
          description={t("apps.videos.dialogs.addVideoDescription")}
          value={urlInput}
          onChange={setUrlInput}
          isLoading={isAddingVideo}
        />
        {/* Add ShareItemDialog */}
        <ShareItemDialog
          isOpen={isShareDialogOpen}
          onClose={() => setIsShareDialogOpen(false)}
          itemType={t("apps.videos.dialogs.videoItemType")}
          itemIdentifier={getCurrentVideo()?.id || ""}
          title={getCurrentVideo()?.title}
          details={getCurrentVideo()?.artist}
          generateShareUrl={videosGenerateShareUrl}
        />
      </WindowFrame>
      {isFullScreen && getCurrentVideo() && (
        <VideoFullScreenPortal
          isOpen={isFullScreen}
          onClose={handleCloseFullScreen}
          url={getCurrentVideo()?.url || ""}
          isPlaying={isPlaying}
          onPlay={handlePlay}
          onPause={handlePause}
          onTogglePlay={togglePlay}
          onEnded={handleVideoEnd}
          onProgress={handleProgress}
          onDuration={handleDuration}
          onReady={handleReady}
          loop={loopCurrent}
          volume={masterVolume}
          playerRef={fullScreenPlayerRef as RefObject<ReactPlayer>}
          onSeek={handleSeek}
          onNext={nextVideo}
          onPrevious={previousVideo}
          showStatus={showStatus}
          statusMessage={statusMessage}
          isShuffled={isShuffled}
          onToggleShuffle={toggleShuffle}
        />
      )}
    </>
  );
}
