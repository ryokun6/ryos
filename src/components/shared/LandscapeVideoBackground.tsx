import { useState, useEffect, useRef, useCallback } from "react";
import { loadWallpaperManifest } from "@/utils/wallpapers";

/** Duration each landscape video plays before crossfading to the next (ms) */
const VIDEO_DURATION_MS = 30_000;
/** Crossfade transition duration (ms) */
const CROSSFADE_MS = 2_000;

interface LandscapeVideoBackgroundProps {
  /** Whether the landscape videos should be playing */
  isActive: boolean;
  className?: string;
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
}: LandscapeVideoBackgroundProps) {
  const [videos, setVideos] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showB, setShowB] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoARef = useRef<HTMLVideoElement | null>(null);
  const videoBRef = useRef<HTMLVideoElement | null>(null);

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

  // When srcA/srcB change, trigger play on the relevant element
  useEffect(() => {
    if (srcA && !showB) ensurePlay(videoARef.current);
  }, [srcA, showB, ensurePlay]);

  useEffect(() => {
    if (srcB && showB) ensurePlay(videoBRef.current);
  }, [srcB, showB, ensurePlay]);

  // Advance to next video with crossfade
  const advanceVideo = useCallback(() => {
    if (videos.length <= 1) return;

    const nextIdx = (currentIndex + 1) % videos.length;

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

    timerRef.current = setTimeout(advanceVideo, VIDEO_DURATION_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isActive, currentIndex, videos.length, advanceVideo]);

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
    <div className={`relative overflow-hidden ${className}`}>
      {/* Video A */}
      <video
        ref={videoARef}
        src={srcA}
        autoPlay
        muted
        loop={videos.length <= 1}
        playsInline
        preload="auto"
        data-webkit-playsinline="true"
        onEnded={!showB ? handleVideoEnded : undefined}
        onCanPlayThrough={(e) => {
          const v = e.currentTarget;
          if (v.paused) v.play().catch(() => {});
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
          playsInline
          preload="auto"
          data-webkit-playsinline="true"
          onEnded={showB ? handleVideoEnded : undefined}
          onCanPlayThrough={(e) => {
            const v = e.currentTarget;
            if (v.paused) v.play().catch(() => {});
          }}
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            opacity: showB ? 1 : 0,
            transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
          }}
        />
      )}

      {/* Subtle darkening overlay for better lyrics readability */}
      <div className="absolute inset-0 bg-black/20" />
    </div>
  );
}
