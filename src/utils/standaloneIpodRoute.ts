import type { IpodInitialData } from "@/apps/base/types";

export const STANDALONE_IPOD_BASE_PATH = "/standalone/ipod";

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "") || "/";
}

/** True when the SPA should render only the iPod app (no desktop shell). */
export function isStandaloneIpodPath(pathname?: string): boolean {
  const path = normalizePathname(pathname ?? window.location.pathname);
  return (
    path === STANDALONE_IPOD_BASE_PATH ||
    path.startsWith(`${STANDALONE_IPOD_BASE_PATH}/`)
  );
}

/**
 * Parse `/standalone/ipod` and `/standalone/ipod/:trackId` (and optional query).
 * Returns null when the path is not a standalone iPod route.
 */
export function parseStandaloneIpodRoute(
  pathname?: string,
  search?: string
): IpodInitialData | null {
  const path = normalizePathname(pathname ?? window.location.pathname);
  if (!isStandaloneIpodPath(path)) {
    return null;
  }

  const initialData: IpodInitialData = {};

  const trackMatch = path.match(
    new RegExp(
      `^${STANDALONE_IPOD_BASE_PATH.replace(/\//g, "\\/")}/([^/]+)$`
    )
  );
  if (trackMatch?.[1]) {
    initialData.videoId = decodeURIComponent(trackMatch[1]);
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

/** Canonical path for linking to the standalone iPod experience. */
export function standaloneIpodPath(trackId?: string): string {
  if (!trackId) return STANDALONE_IPOD_BASE_PATH;
  return `${STANDALONE_IPOD_BASE_PATH}/${encodeURIComponent(trackId)}`;
}
