import {
  useWallpaperAccent,
  useWeatherWallpaperAccent,
} from "./useWallpaperAccent";

/** Mounts {@link useWallpaperAccent} once at the app root so the wallpaper
 * accent stays in sync with the active wallpaper regardless of open apps. */
export function WallpaperAccentRunner() {
  const { weatherAccentActive } = useWallpaperAccent();
  // Only subscribe to live weather (and its geolocation/network fetch) while
  // the weather wallpaper is actually driving the accent.
  return weatherAccentActive ? <WeatherWallpaperAccentRunner /> : null;
}

function WeatherWallpaperAccentRunner() {
  useWeatherWallpaperAccent();
  return null;
}
