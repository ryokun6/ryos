import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import type { Applet } from "./appletActions";

const CATALOG_TTL_MS = 60_000;

let cachedApplets: Applet[] | null = null;
let freshUntil = 0;
let inFlight: Promise<Applet[]> | null = null;

export type FetchAppletCatalogOptions = {
  force?: boolean;
  signal?: AbortSignal;
  timeout?: number;
};

/**
 * Shared applet catalog fetch with in-flight coalescing + short TTL cache.
 * All App Store / update / VFS list callers should use this instead of
 * hitting `/api/share-applet?list=true` independently.
 */
export async function fetchAppletCatalog(
  options: FetchAppletCatalogOptions = {}
): Promise<Applet[]> {
  const { force = false, signal, timeout = 15000 } = options;

  if (!force && cachedApplets && Date.now() < freshUntil) {
    return cachedApplets;
  }

  if (inFlight && !force) {
    return inFlight;
  }

  const pending = (async () => {
    const response = await abortableFetch(
      getApiUrl("/api/share-applet?list=true"),
      {
        signal,
        timeout,
        retry: { maxAttempts: 2, initialDelayMs: 500 },
      }
    );
    const data = (await response.json()) as { applets?: Applet[] };
    const applets = Array.isArray(data.applets) ? data.applets : [];
    const sorted = [...applets].sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
    );
    cachedApplets = sorted;
    freshUntil = Date.now() + CATALOG_TTL_MS;
    return sorted;
  })().finally(() => {
    if (inFlight === pending) {
      inFlight = null;
    }
  });

  inFlight = pending;
  return pending;
}

export function invalidateAppletCatalog(): void {
  cachedApplets = null;
  freshUntil = 0;
}

/** Test helper — clears cache and in-flight state. */
export function __resetAppletCatalogForTests(): void {
  invalidateAppletCatalog();
  inFlight = null;
}
