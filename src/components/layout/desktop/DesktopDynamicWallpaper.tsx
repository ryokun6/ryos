import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useWallpaper } from "@/hooks/useWallpaper";
import { useNowPlayingCover } from "@/hooks/useNowPlayingCover";
import {
  getDayNightGradientCss,
  isCoverWallpaper,
  isDayNightGradientWallpaper,
} from "@/utils/dynamicWallpaper";

/** Recompute the day/night gradient roughly once a minute. */
const GRADIENT_REFRESH_MS = 60 * 1000;

function DayNightGradientLayer() {
  const [gradient, setGradient] = useState(() => getDayNightGradientCss());

  useEffect(() => {
    const update = () => setGradient(getDayNightGradientCss());
    update();
    const id = setInterval(update, GRADIENT_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="absolute inset-0 w-full h-full z-[-10]"
      style={{
        backgroundImage: gradient,
        // Slow cross-fade between successive gradients so shifts feel ambient.
        transition: "background-image 3s linear",
      }}
    />
  );
}

function CoverWallpaperLayer() {
  const { coverUrl } = useNowPlayingCover();

  return (
    <div className="absolute inset-0 w-full h-full z-[-10] overflow-hidden bg-neutral-950">
      <AnimatePresence mode="popLayout">
        {coverUrl ? (
          <motion.div
            key={coverUrl}
            className="absolute inset-0 w-full h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* Blurred, scaled fill so any aspect ratio covers the desktop. */}
            <div
              className="absolute inset-0 w-full h-full"
              style={{
                backgroundImage: `url("${coverUrl}")`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                filter: "blur(48px) saturate(1.2)",
                transform: "scale(1.2)",
              }}
            />
            {/* Sharp, centered cover floating on top of the blur. */}
            <div
              className="absolute inset-0 w-full h-full"
              style={{
                backgroundImage: `url("${coverUrl}")`,
                backgroundSize: "contain",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
              }}
            />
            {/* Subtle darkening keeps desktop icons readable. */}
            <div className="absolute inset-0 w-full h-full bg-black/25" />
          </motion.div>
        ) : (
          <motion.div
            key="cover-empty"
            className="absolute inset-0 w-full h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            style={{
              backgroundImage:
                "linear-gradient(to bottom, #1a1a1f 0%, #0c0c10 100%)",
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Renders dynamic desktop wallpapers (day/night gradient and now-playing cover)
 * that can't be expressed as a single CSS background-image. Returns null for all
 * other wallpaper kinds (static images, tiles, videos, shuffle — those render
 * via the desktop background styles / video element).
 */
export function DesktopDynamicWallpaper() {
  const { currentWallpaper } = useWallpaper();

  if (isDayNightGradientWallpaper(currentWallpaper)) {
    return <DayNightGradientLayer />;
  }
  if (isCoverWallpaper(currentWallpaper)) {
    return <CoverWallpaperLayer />;
  }
  return null;
}
