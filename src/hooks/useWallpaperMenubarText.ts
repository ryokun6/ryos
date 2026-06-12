import { useEffect, useState } from "react";
import { useWallpaper } from "@/hooks/useWallpaper";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import {
  menubarTextColorForLuminance,
  menubarTextForTone,
  menubarTextToneForLuminance,
  sampleWallpaperTopLuminance,
  type MenubarTextTone,
} from "@/themes/wallpaperMenubarText";

export interface WallpaperMenubarText {
  textColor: string;
  tone: MenubarTextTone;
}

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
export function useWallpaperMenubarText(enabled: boolean): WallpaperMenubarText {
  const { wallpaperSource, isVideoWallpaper } = useWallpaper();
  const { isDarkMode } = useThemeFlags();
  const [result, setResult] = useState<WallpaperMenubarText>(() => {
    if (enabled && wallpaperSource && !isVideoWallpaper) {
      ensurePersistedLoaded();
      const cached = luminanceCache.get(wallpaperSource);
      if (cached !== undefined) return menubarTextForLuminance(cached);
    }
    return fallbackMenubarText(isDarkMode);
  });

  useEffect(() => {
    if (!enabled) return;

    if (isVideoWallpaper || !wallpaperSource) {
      setResult(fallbackMenubarText(isDarkMode));
      return;
    }

    ensurePersistedLoaded();
    const cached = luminanceCache.get(wallpaperSource);
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
        cacheLuminance(wallpaperSource, luminance);
        setResult(menubarTextForLuminance(luminance));
      } catch {
        setResult(fallbackMenubarText(isDarkMode));
      }
    };

    img.onerror = () => {
      if (!cancelled) setResult(fallbackMenubarText(isDarkMode));
    };

    img.src = wallpaperSource;
    return () => {
      cancelled = true;
    };
  }, [enabled, wallpaperSource, isVideoWallpaper, isDarkMode]);

  return result;
}
