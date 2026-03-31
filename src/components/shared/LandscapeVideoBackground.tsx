import { useState, useEffect, useRef, useCallback } from "react";
import { loadWallpaperManifest } from "@/utils/wallpapers";

/** Duration each landscape video plays before crossfading to the next (ms) */
const VIDEO_DURATION_MS = 30_000;
/** Crossfade transition duration (ms) */
const CROSSFADE_MS = 2_000;
/** Keep each video visible for at least one loop plus a small buffer (ms) */
const LOOP_BUFFER_MS = 5_000;

interface LandscapeVideoBackgroundProps {
  /** Whether the landscape videos should be playing */
  isActive: boolean;
  className?: string;
  /** Render via canvas when browser video compositing is restricted. */
  renderMode?: "video" | "canvas";
}

/**
 * Cycles through landscape video wallpapers with crossfade transitions.
 * Loads video list from the wallpaper manifest.
 * Uses declarative src props and explicit play() calls for reliable playback,
 * matching the patterns used by Desktop.tsx.
 */
export function LandscapeVideoBackground({
  isActive,
  className = "",
  renderMode = "video",
}: LandscapeVideoBackgroundProps) {
  const useCanvasRendering = renderMode === "canvas";
  const [videos, setVideos] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showB, setShowB] = useState(false);
  const [activeVideoDurationMs, setActiveVideoDurationMs] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoARef = useRef<HTMLVideoElement | null>(null);
  const videoBRef = useRef<HTMLVideoElement | null>(null);
  const canvasARef = useRef<HTMLCanvasElement | null>(null);
  const canvasBRef = useRef<HTMLCanvasElement | null>(null);

  // Track which src each slot holds
  const [srcA, setSrcA] = useState<string>("");
  const [srcB, setSrcB] = useState<string>("");

  // Load video wallpaper list from manifest
  useEffect(() => {
    let cancelled = false;
    loadWallpaperManifest()
      .then((manifest) => {
        if (cancelled) return;
        const videoPaths = manifest.videos.map((p) => `/wallpapers/${p}`);
        // Shuffle so it's different each session
        const shuffled = [...videoPaths].sort(() => Math.random() - 0.5);
        setVideos(shuffled);
        if (shuffled.length > 0) {
          setSrcA(shuffled[0]);
          if (shuffled.length > 1) {
            setSrcB(shuffled[1]);
          }
        }
      })
      .catch((err) => {
        console.warn("[LandscapeVideoBackground] Failed to load manifest:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Explicitly play a video element (handles ready state)
  const ensurePlay = useCallback((video: HTMLVideoElement | null) => {
    if (!video || !video.src || !isActive) return;
    if (video.readyState >= 3) {
      video.play().catch(() => {});
    } else {
      const onReady = () => {
        video.play().catch(() => {});
        video.removeEventListener("canplaythrough", onReady);
      };
      video.addEventListener("canplaythrough", onReady);
    }
  }, [isActive]);

  const syncCanvasSize = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const width = Math.max(1, Math.round(canvas.clientWidth));
    const height = Math.max(1, Math.round(canvas.clientHeight));
    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.max(1, Math.round(width * dpr));
    const targetHeight = Math.max(1, Math.round(height * dpr));

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
  }, []);

  const drawVideoToCanvas = useCallback(
    (video: HTMLVideoElement | null, canvas: HTMLCanvasElement | null) => {
      if (!video || !canvas) return;
      if (video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) return;

      syncCanvasSize(canvas);

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const canvasWidth = canvas.width / dpr;
      const canvasHeight = canvas.height / dpr;
      const scale = Math.max(canvasWidth / video.videoWidth, canvasHeight / video.videoHeight);
      const drawWidth = video.videoWidth * scale;
      const drawHeight = video.videoHeight * scale;
      const drawX = (canvasWidth - drawWidth) / 2;
      const drawY = (canvasHeight - drawHeight) / 2;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);
      ctx.drawImage(video, drawX, drawY, drawWidth, drawHeight);
    },
    [syncCanvasSize]
  );

  // When srcA/srcB change, trigger play on the relevant element
  useEffect(() => {
    if (srcA && !showB) ensurePlay(videoARef.current);
  }, [srcA, showB, ensurePlay]);

  useEffect(() => {
    if (srcB && showB) ensurePlay(videoBRef.current);
  }, [srcB, showB, ensurePlay]);

  useEffect(() => {
    if (isActive) {
      ensurePlay(showB ? videoBRef.current : videoARef.current);
    }
  }, [ensurePlay, isActive, showB]);

  useEffect(() => {
    if (!useCanvasRendering) return;

    const updateCanvasSizes = () => {
      syncCanvasSize(canvasARef.current);
      syncCanvasSize(canvasBRef.current);
    };

    updateCanvasSizes();

    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      const resizeObserver = new ResizeObserver(updateCanvasSizes);
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }

    window.addEventListener("resize", updateCanvasSizes);
    return () => window.removeEventListener("resize", updateCanvasSizes);
  }, [syncCanvasSize, useCanvasRendering]);

  useEffect(() => {
    if (!useCanvasRendering || !isActive) {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const render = () => {
      drawVideoToCanvas(videoARef.current, canvasARef.current);
      drawVideoToCanvas(videoBRef.current, canvasBRef.current);
      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [drawVideoToCanvas, isActive, srcA, srcB, useCanvasRendering]);

  // Advance to next video with crossfade
  const advanceVideo = useCallback(() => {
    if (videos.length <= 1) return;

    const nextIdx = (currentIndex + 1) % videos.length;
    setActiveVideoDurationMs(null);

    if (showB) {
      // B is visible → load next into A, then show A
      setSrcA(videos[nextIdx]);
      setShowB(false);
    } else {
      // A is visible → load next into B, then show B
      setSrcB(videos[nextIdx]);
      setShowB(true);
    }

    setCurrentIndex(nextIdx);
  }, [videos, currentIndex, showB]);

  // Schedule periodic advancement
  useEffect(() => {
    if (!isActive || videos.length <= 1) return;

    // Keep each clip on screen long enough to visibly loop, then start crossfade
    // right before a loop boundary for a seamless transition.
    const timeUntilCrossfadeMs = (() => {
      if (!activeVideoDurationMs || !Number.isFinite(activeVideoDurationMs)) {
        return VIDEO_DURATION_MS;
      }

      const minimumVisibleMs = Math.max(VIDEO_DURATION_MS, activeVideoDurationMs + LOOP_BUFFER_MS);
      const loopsToPlay = Math.max(1, Math.ceil((minimumVisibleMs + CROSSFADE_MS) / activeVideoDurationMs));
      const alignedCrossfadeStartMs = loopsToPlay * activeVideoDurationMs - CROSSFADE_MS;
      return Math.max(1_000, alignedCrossfadeStartMs);
    })();

    timerRef.current = setTimeout(advanceVideo, timeUntilCrossfadeMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isActive, videos.length, activeVideoDurationMs, advanceVideo]);

  // Also advance when the active video naturally ends
  const handleVideoEnded = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    advanceVideo();
  }, [advanceVideo]);

  // Resume on visibility change (tab switch)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const active = showB ? videoBRef.current : videoARef.current;
      ensurePlay(active);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [showB, ensurePlay]);

  if (!srcA) {
    return <div className={`bg-black ${className}`} />;
  }

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden ${className}`}
    >
      {useCanvasRendering ? (
        <>
          <canvas
            ref={canvasARef}
            className="absolute inset-0 w-full h-full"
            style={{
              opacity: showB ? 0 : 1,
              transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
            }}
          />

          {videos.length > 1 && srcB && (
            <canvas
              ref={canvasBRef}
              className="absolute inset-0 w-full h-full"
              style={{
                opacity: showB ? 1 : 0,
                transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
              }}
            />
          )}
        </>
      ) : (
        <>
          {/* Video A */}
          <video
            ref={videoARef}
            src={srcA}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            data-webkit-playsinline="true"
            onEnded={!showB ? handleVideoEnded : undefined}
            onCanPlayThrough={(e) => {
              const v = e.currentTarget;
              if (v.paused) v.play().catch(() => {});
            }}
            onLoadedMetadata={(e) => {
              if (showB) return;
              const durationMs = e.currentTarget.duration * 1000;
              if (Number.isFinite(durationMs) && durationMs > 0) {
                setActiveVideoDurationMs(durationMs);
              }
            }}
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              opacity: showB ? 0 : 1,
              transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
            }}
          />

          {/* Video B */}
          {videos.length > 1 && srcB && (
            <video
              ref={videoBRef}
              src={srcB}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              data-webkit-playsinline="true"
              onEnded={showB ? handleVideoEnded : undefined}
              onCanPlayThrough={(e) => {
                const v = e.currentTarget;
                if (v.paused) v.play().catch(() => {});
              }}
              onLoadedMetadata={(e) => {
                if (!showB) return;
                const durationMs = e.currentTarget.duration * 1000;
                if (Number.isFinite(durationMs) && durationMs > 0) {
                  setActiveVideoDurationMs(durationMs);
                }
              }}
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                opacity: showB ? 1 : 0,
                transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
              }}
            />
          )}
        </>
      )}

      {useCanvasRendering && (
        <>
          {/* Hidden video sources feed the canvases so landscape playback does not rely on visible video tags. */}
          <video
            ref={videoARef}
            src={srcA}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            data-webkit-playsinline="true"
            onEnded={!showB ? handleVideoEnded : undefined}
            onCanPlayThrough={(e) => {
              const v = e.currentTarget;
              if (v.paused) v.play().catch(() => {});
            }}
            onLoadedMetadata={(e) => {
              if (showB) return;
              const durationMs = e.currentTarget.duration * 1000;
              if (Number.isFinite(durationMs) && durationMs > 0) {
                setActiveVideoDurationMs(durationMs);
              }
            }}
            className="absolute left-[-9999px] top-[-9999px] w-px h-px opacity-0 pointer-events-none"
          />

          {/* Hidden video B source */}
          {videos.length > 1 && srcB && (
            <video
              ref={videoBRef}
              src={srcB}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              data-webkit-playsinline="true"
              onEnded={showB ? handleVideoEnded : undefined}
              onCanPlayThrough={(e) => {
                const v = e.currentTarget;
                if (v.paused) v.play().catch(() => {});
              }}
              onLoadedMetadata={(e) => {
                if (!showB) return;
                const durationMs = e.currentTarget.duration * 1000;
                if (Number.isFinite(durationMs) && durationMs > 0) {
                  setActiveVideoDurationMs(durationMs);
                }
              }}
              className="absolute left-[-9999px] top-[-9999px] w-px h-px opacity-0 pointer-events-none"
            />
          )}
        </>
      )}

      {/* Subtle darkening overlay for better lyrics readability */}
      <div className="absolute inset-0 bg-black/20" />
    </div>
  );
}
