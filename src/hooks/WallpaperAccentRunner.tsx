import { Suspense, lazy } from "react";
import {
  useWallpaperAccent,
  useWeatherWallpaperAccent,
} from "./useWallpaperAccent";

// Code-split: the cover accent subscribes to the full iPod + Karaoke store
// stack via useNowPlayingCover, which should only load when a cover / lyrics
// wallpaper is actually driving the accent.
const CoverWallpaperAccentRunner = lazy(() =>
  import("./CoverWallpaperAccentRunner").then((m) => ({
    default: m.CoverWallpaperAccentRunner,
  }))
);

/** Mounts {@link useWallpaperAccent} once at the app root so the wallpaper
 * accent stays in sync with the active wallpaper regardless of open apps. */
export function WallpaperAccentRunner() {
  const { weatherAccentActive, coverAccentActive } = useWallpaperAccent();
  // Only subscribe to live weather (and its geolocation/network fetch) or the
  // now-playing cover while that wallpaper is actually driving the accent.
  return (
    <>
      {weatherAccentActive ? <WeatherWallpaperAccentRunner /> : null}
      {coverAccentActive ? (
        <Suspense fallback={null}>
          <CoverWallpaperAccentRunner />
        </Suspense>
      ) : null}
    </>
  );
}

function WeatherWallpaperAccentRunner() {
  useWeatherWallpaperAccent();
  return null;
}
