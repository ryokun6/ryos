import { useEffect, useState } from "react";
import { useWallpaper } from "@/hooks/useWallpaper";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useNowPlayingCover } from "@/hooks/useNowPlayingCover";
import {
  menubarTextColorForLuminance,
  menubarTextForTone,
  menubarTextToneForLuminance,
  sampleWallpaperTopLuminance,
  wallpaperLuminance,
  type MenubarTextTone,
} from "@/themes/wallpaperMenubarText";
import {
  getDayNightGradientColors,
  isCoverWallpaper,
  isDayNightGradientWallpaper,
} from "@/utils/dynamicWallpaper";

export interface WallpaperMenubarText {
  textColor: string;
  tone: MenubarTextTone;
}

// The gradient drifts with wall-clock time, so re-derive its tone on a slow
// interval to keep the menubar tracking the day → night shift.
const GRADIENT_MENUBAR_REFRESH_MS = 60 * 1000;

function fallbackMenubarText(isDarkMode: boolean): WallpaperMenubarText {
  const tone: MenubarTextTone = isDarkMode ? "light" : "dark";
  return { textColor: menubarTextForTone(tone), tone };
}

function menubarTextForLuminance(luminance: number): WallpaperMenubarText {
  return {
    textColor: menubarTextColorForLuminance(luminance),
    tone: menubarTextToneForLuminance(luminance),
  };
}

/**
 * Sampled luminance per wallpaper source, cached so the menubar tone resolves
 * synchronously on remount (app switches) and on reload (localStorage) instead
 * of flashing the fallback color while the wallpaper image decodes.
 */
const STORAGE_KEY = "ryos:wallpaper-menubar-luminance";
const MAX_PERSISTED_ENTRIES = 20;

const luminanceCache = new Map<string, number>();

let persistedLoaded = false;
function ensurePersistedLoaded() {
  if (persistedLoaded) return;
  persistedLoaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, number>;
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number") luminanceCache.set(key, value);
    }
  } catch {
    // Ignore corrupt cache — it will be rewritten on the next sample.
  }
}

function persistCache() {
  try {
    // Keep only the most recent entries (Map preserves insertion order).
    const entries = [...luminanceCache.entries()].slice(-MAX_PERSISTED_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Storage may be full/unavailable — in-memory cache still works.
  }
}

function cacheLuminance(source: string, luminance: number) {
  // Re-insert to refresh recency for the persistence cap.
  luminanceCache.delete(source);
  luminanceCache.set(source, luminance);
  persistCache();
}

/**
 * Samples the wallpaper region behind the menubar and picks a readable label
 * color. Only meaningful for Aqua Glass (transparent menubar); callers should
 * pass `enabled: isAquaGlass`.
 */
function gradientMenubarText(): WallpaperMenubarText {
  // The top gradient color is the strip directly behind the menubar.
  const [top] = getDayNightGradientColors(new Date());
  return menubarTextForLuminance(wallpaperLuminance(top[0], top[1], top[2]));
}

export function useWallpaperMenubarText(enabled: boolean): WallpaperMenubarText {
  const { currentWallpaper, wallpaperSource, isVideoWallpaper } =
    useWallpaper();
  const { isDarkMode } = useThemeFlags();

  const isGradient = isDayNightGradientWallpaper(currentWallpaper);
  const isCover = isCoverWallpaper(currentWallpaper);
  const { coverUrl: nowPlayingCoverUrl } = useNowPlayingCover();

  // Image URL sampled for the menubar tone. The gradient has no loadable image
  // (handled live below); the cover wallpaper samples its album art; videos and
  // the inactive state sample nothing.
  let sampleSource: string | null = null;
  if (!isGradient) {
    if (isCover) sampleSource = nowPlayingCoverUrl;
    else if (!isVideoWallpaper) sampleSource = wallpaperSource || null;
  }

  const [result, setResult] = useState<WallpaperMenubarText>(() => {
    if (enabled && isGradient) return gradientMenubarText();
    if (enabled && sampleSource) {
      ensurePersistedLoaded();
      const cached = luminanceCache.get(sampleSource);
      if (cached !== undefined) return menubarTextForLuminance(cached);
    }
    return fallbackMenubarText(isDarkMode);
  });

  useEffect(() => {
    if (!enabled || isGradient) return;

    if (!sampleSource) {
      setResult(fallbackMenubarText(isDarkMode));
      return;
    }

    ensurePersistedLoaded();
    const cached = luminanceCache.get(sampleSource);
    if (cached !== undefined) {
      setResult(menubarTextForLuminance(cached));
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      if (cancelled) return;
      try {
        const luminance = sampleWallpaperTopLuminance(img);
        if (luminance === null) {
          // Sampling failed — fall back without caching so the next mount
          // retries instead of locking in a placeholder tone.
          setResult(fallbackMenubarText(isDarkMode));
          return;
        }
        cacheLuminance(sampleSource, luminance);
        setResult(menubarTextForLuminance(luminance));
      } catch {
        setResult(fallbackMenubarText(isDarkMode));
      }
    };

    img.onerror = () => {
      if (!cancelled) setResult(fallbackMenubarText(isDarkMode));
    };

    img.src = sampleSource;
    return () => {
      cancelled = true;
    };
  }, [enabled, isGradient, sampleSource, isDarkMode]);

  // Day/night gradient: derive the tone from the live top gradient color and
  // refresh on an interval so the menubar tracks the day → night transition.
  useEffect(() => {
    if (!enabled || !isGradient) return;

    const apply = () => setResult(gradientMenubarText());

    apply();
    const id = window.setInterval(apply, GRADIENT_MENUBAR_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [enabled, isGradient]);

  return result;
}
