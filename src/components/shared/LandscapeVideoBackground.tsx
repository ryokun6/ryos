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
 * Follows the same video playback patterns as Desktop.tsx for reliability.
 */
export function LandscapeVideoBackground({
  isActive,
  className = "",
}: LandscapeVideoBackgroundProps) {
  const [videos, setVideos] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showSecond, setShowSecond] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);

  // Load video wallpaper list from manifest
  useEffect(() => {
    let cancelled = false;
    loadWallpaperManifest()
      .then((manifest) => {
        if (cancelled) return;
        const videoPaths = manifest.videos.map((p) => `/wallpapers/${p}`);
        // Shuffle the list so it's different each session
        const shuffled = [...videoPaths].sort(() => Math.random() - 0.5);
        setVideos(shuffled);
      })
      .catch((err) => {
        console.warn("[LandscapeVideoBackground] Failed to load manifest:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Attempt to play a video element safely
  const safePlay = useCallback((video: HTMLVideoElement) => {
    if (video.readyState >= 3) {
      video.play().catch((err) => {
        console.warn("[LandscapeVideoBackground] Could not play video:", err);
      });
    } else {
      const handleCanPlay = () => {
        video.play().catch((err) => {
          console.warn("[LandscapeVideoBackground] Could not play video:", err);
        });
        video.removeEventListener("canplaythrough", handleCanPlay);
      };
      video.addEventListener("canplaythrough", handleCanPlay);
    }
  }, []);

  // Set source and play on a video element
  const loadAndPlay = useCallback(
    (video: HTMLVideoElement, src: string) => {
      video.src = src;
      video.load();
      safePlay(video);
    },
    [safePlay]
  );

  // Initialize the first video once video list is loaded
  useEffect(() => {
    if (videos.length === 0 || !videoARef.current) return;
    loadAndPlay(videoARef.current, videos[0]);
    setCurrentIndex(0);
    setShowSecond(false);
  }, [videos, loadAndPlay]);

  // Advance to the next video with crossfade
  const advanceVideo = useCallback(() => {
    if (videos.length <= 1) return;

    const nextIdx = (currentIndex + 1) % videos.length;
    // Load the next video into the hidden element
    const incomingRef = showSecond ? videoARef : videoBRef;
    if (incomingRef.current) {
      loadAndPlay(incomingRef.current, videos[nextIdx]);
    }

    // Start crossfade: show the incoming element
    setShowSecond((prev) => !prev);
    setCurrentIndex(nextIdx);
  }, [videos, currentIndex, showSecond, loadAndPlay]);

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

  // Also advance when the current video naturally ends
  const handleVideoEnded = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    advanceVideo();
  }, [advanceVideo]);

  // Resume playback on visibility change (tab switch back)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const active = showSecond ? videoBRef.current : videoARef.current;
      if (active && active.paused && active.src) {
        safePlay(active);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [showSecond, safePlay]);

  if (videos.length === 0) {
    return <div className={`bg-black ${className}`} />;
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Video A */}
      <video
        ref={videoARef}
        autoPlay
        muted
        loop={videos.length === 1}
        playsInline
        preload="auto"
        data-webkit-playsinline="true"
        onEnded={!showSecond ? handleVideoEnded : undefined}
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          opacity: showSecond ? 0 : 1,
          transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
        }}
      />

      {/* Video B */}
      {videos.length > 1 && (
        <video
          ref={videoBRef}
          autoPlay
          muted
          loop={false}
          playsInline
          preload="auto"
          data-webkit-playsinline="true"
          onEnded={showSecond ? handleVideoEnded : undefined}
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            opacity: showSecond ? 1 : 0,
            transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
          }}
        />
      )}

      {/* Subtle darkening overlay for better lyrics readability */}
      <div className="absolute inset-0 bg-black/20" />
    </div>
  );
}
