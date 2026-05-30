import type { KaraokeInitialData } from "@/apps/base/types";

export const STANDALONE_KARAOKE_BASE_PATH = "/standalone/karaoke";

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "") || "/";
}

/** True when the SPA should render only the Karaoke app (no desktop shell). */
export function isStandaloneKaraokePath(pathname?: string): boolean {
  const path = normalizePathname(pathname ?? window.location.pathname);
  return (
    path === STANDALONE_KARAOKE_BASE_PATH ||
    path.startsWith(`${STANDALONE_KARAOKE_BASE_PATH}/`)
  );
}

/**
 * Parse `/standalone/karaoke` and `/standalone/karaoke/:trackId` (and optional query).
 * Returns null when the path is not a standalone Karaoke route.
 */
export function parseStandaloneKaraokeRoute(
  pathname?: string,
  search?: string
): KaraokeInitialData | null {
  const path = normalizePathname(pathname ?? window.location.pathname);
  if (!isStandaloneKaraokePath(path)) {
    return null;
  }

  const initialData: KaraokeInitialData = {};

  const trackPrefix = `${STANDALONE_KARAOKE_BASE_PATH}/`;
  if (path.startsWith(trackPrefix)) {
    const segment = path.slice(trackPrefix.length);
    if (segment.length > 0 && !segment.includes("/")) {
      initialData.videoId = decodeURIComponent(segment);
    }
  }

  const searchParams =
    typeof search === "string" && search.length > 0
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : null;

  const listenSessionId = searchParams?.get("listen")?.trim();
  if (listenSessionId) {
    initialData.listenSessionId = listenSessionId;
  }

  return initialData;
}

/** Canonical path for linking to the standalone Karaoke experience. */
export function standaloneKaraokePath(trackId?: string): string {
  if (!trackId) return STANDALONE_KARAOKE_BASE_PATH;
  return `${STANDALONE_KARAOKE_BASE_PATH}/${encodeURIComponent(trackId)}`;
}
