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
 */
export function LandscapeVideoBackground({
  isActive,
  className = "",
}: LandscapeVideoBackgroundProps) {
  const [videos, setVideos] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [nextIndex, setNextIndex] = useState(1);
  const [isCrossfading, setIsCrossfading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentVideoRef = useRef<HTMLVideoElement>(null);
  const nextVideoRef = useRef<HTMLVideoElement>(null);

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
        setCurrentIndex(0);
        setNextIndex(shuffled.length > 1 ? 1 : 0);
      })
      .catch((err) => {
        console.warn("[LandscapeVideoBackground] Failed to load manifest:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Advance to next video with crossfade
  const advanceVideo = useCallback(() => {
    if (videos.length <= 1) return;

    setIsCrossfading(true);

    // After crossfade completes, swap videos
    setTimeout(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % videos.length;
        setNextIndex((next + 1) % videos.length);
        return next;
      });
      setIsCrossfading(false);
    }, CROSSFADE_MS);
  }, [videos.length]);

  // Schedule video advancement timer
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

  // Also advance when video naturally ends
  const handleVideoEnded = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    advanceVideo();
  }, [advanceVideo]);

  if (videos.length === 0) {
    return <div className={`bg-black ${className}`} />;
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Current video */}
      <video
        ref={currentVideoRef}
        key={`current-${currentIndex}`}
        src={videos[currentIndex]}
        autoPlay
        muted
        loop={videos.length === 1}
        playsInline
        onEnded={handleVideoEnded}
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          opacity: 1,
          transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
        }}
      />

      {/* Next video (preloaded, fades in during crossfade) */}
      {videos.length > 1 && (
        <video
          ref={nextVideoRef}
          key={`next-${nextIndex}`}
          src={videos[nextIndex]}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            opacity: isCrossfading ? 1 : 0,
            transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
          }}
        />
      )}

      {/* Subtle darkening overlay for better lyrics readability */}
      <div className="absolute inset-0 bg-black/20" />
    </div>
  );
}
