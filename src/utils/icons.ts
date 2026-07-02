// Utility for resolving themed icon paths using a pre-generated manifest.
// Generated manifest: public/icons/manifest.json
// Initial implementation supports only the 'default' theme.
import { abortableFetch } from "./abortableFetch";
//
// Note: Icon cache busting via ?v= query params was removed because:
// 1. Service worker uses ignoreSearch: true for images (query params are ignored)
// 2. Prefetching now uses cache: 'reload' to bypass browser HTTP cache
// 3. On updates, all caches are cleared before prefetching fresh icons

export interface IconManifest {
  version: number;
  generatedAt: string;
  themes: Record<string, string[]>;
}

let manifestCache: IconManifest | null = null;
let manifestPromise: Promise<IconManifest> | null = null;
let manifestGeneration = 0;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isIconManifest(value: unknown): value is IconManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  if (
    !("version" in value) ||
    typeof value.version !== "number" ||
    !("generatedAt" in value) ||
    typeof value.generatedAt !== "string" ||
    !("themes" in value) ||
    typeof value.themes !== "object" ||
    value.themes === null ||
    Array.isArray(value.themes)
  ) {
    return false;
  }

  return Object.values(value.themes).every(isStringArray);
}

export async function fetchIconManifest(): Promise<IconManifest> {
  if (manifestCache) return manifestCache;
  if (!manifestPromise) {
    const requestGeneration = manifestGeneration;
    manifestPromise = abortableFetch("/icons/manifest.json", {
      cache: "no-store",
      timeout: 15000,
      retry: { maxAttempts: 1, initialDelayMs: 250 },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load icon manifest: ${r.status}`);
        return r.json();
      })
      .then((data: unknown) => {
        if (!isIconManifest(data)) {
          throw new Error("Invalid icon manifest");
        }
        if (requestGeneration === manifestGeneration) {
          manifestCache = data;
        }
        return data;
      });
  }

  const currentPromise = manifestPromise;
  try {
    return await currentPromise;
  } finally {
    if (manifestPromise === currentPromise) {
      manifestPromise = null;
    }
  }
}

/**
 * Clear the cached manifest to force a reload on next access.
 * Useful when themes or icons may have changed.
 */
export function invalidateIconCache(): void {
  manifestGeneration += 1;
  manifestCache = null;
  manifestPromise = null;
}

export interface GetIconPathOptions {
  theme?: string | null;
  fallbackTheme?: string; // usually 'default'
  manifest?: IconManifest; // optional preloaded manifest
}

export function pickIconPath(
  name: string,
  { theme, fallbackTheme = "default", manifest }: GetIconPathOptions = {}
): string {
  // No theme provided: always fallback.
  if (!theme) {
    return `/icons/${fallbackTheme}/${name}`;
  }
  // If theme explicitly equals fallback, just return fallback path.
  if (theme === fallbackTheme) {
    return `/icons/${fallbackTheme}/${name}`;
  }
  const m = manifestCache || manifest; // allow pre-supplied
  // If manifest not yet loaded, optimistically return themed path to avoid flash.
  if (!m) {
    return `/icons/${theme}/${name}`;
  }
  if (m.themes[theme] && m.themes[theme].includes(name)) {
    return `/icons/${theme}/${name}`;
  }
  // Fallback if manifest knows the theme or icon missing.
  return `/icons/${fallbackTheme}/${name}`;
}

// React helper hook (lazy, no suspense) to resolve icon path.
// Usage: const path = useIconPath('videos.png', theme);
import { useEffect, useState } from "react";
// --- Legacy-aware resolver ---
// Accepts legacy stored values like /icons/file-text.png (no theme segment) or
// themed paths (/icons/default/file-text.png) or plain logical names (file-text.png).
export function resolveIconLegacyAware(
  iconOrName: string,
  theme?: string | null
): string {
  // Pass through absolute/remote URLs & data/blob URIs
  if (/^(https?:|data:|blob:|\/\/)/i.test(iconOrName)) {
    return iconOrName;
  }
  // If it's already a full /icons/... path, try to reduce to relative name & re-theme.
  if (iconOrName.startsWith("/icons/")) {
    const rest = iconOrName.slice("/icons/".length); // e.g. default/file.png OR file.png OR macpaint/brush.png
    const parts = rest.split("/");
    const maybeTheme = parts[0];
    // Known themes (even before manifest loads). Include 'default'.
    const KNOWN_THEMES = ["default", "macosx", "system7", "xp", "win98"];
    const m = manifestCache;
    const isKnownTheme =
      (m && m.themes[maybeTheme]) || KNOWN_THEMES.includes(maybeTheme);
    if (isKnownTheme) {
      const relative = parts.slice(1).join("/");
      if (!relative) return iconOrName; // nothing after theme
      return pickIconPath(relative, { theme });
    }
    // Not a known theme folder; treat whole rest as a logical name (already relative).
    return pickIconPath(rest, { theme });
  }
  // Otherwise treat as relative logical name.
  return pickIconPath(iconOrName, { theme });
}

export function normalizeSameOriginIconPath(src: string): string | null {
  const withoutHash = src.split("#")[0];
  if (withoutHash.startsWith("/icons/")) {
    return withoutHash;
  }
  if (!/^https?:\/\//i.test(withoutHash)) {
    return null;
  }

  try {
    if (typeof window === "undefined") {
      return null;
    }
    const url = new URL(withoutHash);
    if (
      url.origin !== window.location.origin ||
      !url.pathname.startsWith("/icons/")
    ) {
      return null;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export function defaultIconPathForLogicalName(logicalName: string): string {
  return pickIconPath(logicalName, { theme: "default" });
}

export function getIconRecoveryCandidates(
  failedSrc: string | null,
  logicalName: string
): string[] {
  const failedPath = failedSrc ? normalizeSameOriginIconPath(failedSrc) : null;
  return [
    ...(failedPath && !failedPath.startsWith("/icons/default/")
      ? [failedPath]
      : []),
    defaultIconPathForLogicalName(logicalName),
  ];
}

export async function createCachedIconObjectUrl(
  iconPath: string
): Promise<string | null> {
  const normalizedPath = normalizeSameOriginIconPath(iconPath);
  if (
    !normalizedPath ||
    typeof caches === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return null;
  }

  try {
    const response = await caches.match(normalizedPath, {
      ignoreSearch: true,
    });
    if (!response?.ok) {
      return null;
    }
    return URL.createObjectURL(await response.blob());
  } catch {
    return null;
  }
}

export function useIconPath(name: string, theme?: string | null) {
  // Start with an optimistic themed path (or fallback) to prevent flash.
  const [path, setPath] = useState(pickIconPath(name, { theme }));
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await fetchIconManifest();
        if (cancelled) return;
        // Re-evaluate with manifest; may fallback if icon not present.
        setPath(pickIconPath(name, { theme, manifest: m }));
      } catch {
        // ignore; optimistic path already set
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name, theme]);
  return path;
}
