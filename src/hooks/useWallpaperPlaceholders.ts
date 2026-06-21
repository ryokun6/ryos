import { useEffect, useState } from "react";
import {
  loadWallpaperPlaceholders,
  getCachedWallpaperPlaceholders,
  type WallpaperPlaceholder,
} from "@/utils/wallpapers";

/**
 * Loads the blur-up placeholder map (`/wallpapers/placeholders.json`) once and
 * returns it (or null until ready). Backed by an in-memory singleton cache in
 * `wallpapers.ts`, so multiple consumers share one fetch.
 */
export function useWallpaperPlaceholders(): Record<
  string,
  WallpaperPlaceholder
> | null {
  const [placeholders, setPlaceholders] = useState<Record<
    string,
    WallpaperPlaceholder
  > | null>(() => getCachedWallpaperPlaceholders());

  useEffect(() => {
    if (placeholders) return;
    let cancelled = false;
    void loadWallpaperPlaceholders().then((p) => {
      if (!cancelled) setPlaceholders(p);
    });
    return () => {
      cancelled = true;
    };
  }, [placeholders]);

  return placeholders;
}
