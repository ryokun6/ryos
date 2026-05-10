import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useIpodStore, type Track } from "@/stores/useIpodStore";
import { getMusicKitInstance } from "@/hooks/useMusicKit";

/**
 * Apple Music library fetcher.
 *
 * Pulls the user's personal library via the v1 Apple Music API
 * (`/v1/me/library/songs`) using the configured MusicKit instance, paginates
 * through every result, and projects them into the iPod's `Track` shape so
 * the existing UI can render them without modification.
 *
 * The Apple-issued IDs are namespaced as `am:<id>` so they coexist with
 * YouTube IDs in the lyrics cache (server enforces the same prefix scheme
 * via `isValidAppleMusicSongId`).
 */

export interface AppleMusicLibrarySongResource {
  id: string;
  type: string;
  attributes?: {
    name?: string;
    artistName?: string;
    albumName?: string;
    durationInMillis?: number;
    artwork?: {
      url?: string;
      width?: number;
      height?: number;
    };
    playParams?: {
      id: string;
      kind: string;
      isLibrary?: boolean;
      catalogId?: string;
      reporting?: boolean;
    };
  };
}

interface LibrarySongsResponse {
  data?: AppleMusicLibrarySongResource[];
  next?: string;
  meta?: {
    total?: number;
  };
}

/**
 * Resolve an artwork URL with the supplied resolution. Apple Music returns
 * URL templates like `https://.../{w}x{h}bb.jpg` — we substitute reasonable
 * sizes so cover images aren't tiny.
 */
function resolveArtworkUrl(
  artwork:
    | { url?: string; width?: number; height?: number }
    | undefined,
  size = 600
): string | undefined {
  const url = artwork?.url;
  if (!url) return undefined;
  return url.replace("{w}", String(size)).replace("{h}", String(size));
}

/**
 * Convert a v1 library-songs resource into the iPod Track type.
 */
export function libraryResourceToTrack(
  res: AppleMusicLibrarySongResource
): Track | null {
  const attrs = res.attributes;
  const playParams = attrs?.playParams;
  if (!attrs || !playParams) return null;

  // Prefer the catalog ID for `setQueue({ song: ... })`. Fall back to the
  // library ID — MusicKit accepts both via the `song` param when the ID is
  // a library ID prefixed with `i.`.
  const stableId = playParams.catalogId || playParams.id || res.id;
  if (!stableId) return null;

  return {
    id: `am:${stableId}`,
    url: `applemusic:${stableId}`,
    title: attrs.name || "Untitled",
    artist: attrs.artistName || "",
    album: attrs.albumName,
    cover: resolveArtworkUrl(attrs.artwork, 600),
    durationMs: attrs.durationInMillis,
    source: "appleMusic",
    appleMusicPlayParams: {
      catalogId: playParams.catalogId,
      libraryId: playParams.isLibrary ? playParams.id : undefined,
      kind: playParams.kind,
      isLibrary: playParams.isLibrary,
    },
    // Sensible default for offset; user can tweak per-track via the sync UI.
    lyricOffset: 0,
  };
}

const PAGE_SIZE = 100;
const MAX_PAGES = 50; // safety cap (5,000 songs)

interface FetchOptions {
  /** Force a refetch even if a load is already in progress. */
  force?: boolean;
  /** Optional progress callback; invoked with `(loaded, total)` per page. */
  onProgress?: (loaded: number, total: number | undefined) => void;
}

/**
 * Fetch the user's full Apple Music library and write the result into the
 * store. Resolves with the number of tracks loaded; rejects when MusicKit
 * is unavailable / the user is not authorized.
 */
export async function fetchAppleMusicLibrary(
  options: FetchOptions = {}
): Promise<number> {
  const instance = getMusicKitInstance();
  if (!instance) throw new Error("MusicKit instance is not configured");
  if (!instance.isAuthorized) {
    throw new Error("Apple Music user is not authorized");
  }

  const store = useIpodStore.getState();
  if (!options.force && store.appleMusicLibraryLoading) {
    return store.appleMusicTracks.length;
  }

  // Cache the storefront on every fetch — saves us another API hop later
  // when we need to render genre / explicit info.
  if (instance.storefrontId) {
    store.setAppleMusicStorefrontId(instance.storefrontId);
  }

  store.setAppleMusicLibraryLoading(true);
  store.setAppleMusicLibraryError(null);

  const aggregated: Track[] = [];
  try {
    let offset = 0;
    let total: number | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await instance.api.music<LibrarySongsResponse>(
        "/v1/me/library/songs",
        {
          limit: PAGE_SIZE,
          offset,
          // Include catalog play params so we can reach the catalog version
          // of each library track for streaming + lyrics matching.
          "include[library-songs]": "catalog",
        }
      );
      const data = response?.data as LibrarySongsResponse | undefined;
      const items = data?.data ?? [];
      total = data?.meta?.total ?? total;

      for (const item of items) {
        const track = libraryResourceToTrack(item);
        if (track) aggregated.push(track);
      }

      options.onProgress?.(aggregated.length, total);

      if (items.length < PAGE_SIZE) break;
      offset += items.length;
    }

    store.setAppleMusicTracks(aggregated);
    return aggregated.length;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    store.setAppleMusicLibraryError(message);
    throw err;
  }
}

export interface UseAppleMusicLibraryOptions {
  /** Set to true to load the library when the hook becomes enabled. */
  enabled: boolean;
  /** Auth state — wait for this to be true before fetching. */
  isAuthorized: boolean;
}

/**
 * Hook that auto-loads the user's Apple Music library the first time both
 * `enabled` and `isAuthorized` are true. Subsequent enabling reuses the
 * cached list (call `refresh()` to re-fetch).
 *
 * The initial load shows a live progress toast — Apple Music libraries
 * routinely contain thousands of songs and pulling them takes long enough
 * that without feedback the user has no idea anything is happening.
 */
export function useAppleMusicLibrary({
  enabled,
  isAuthorized,
}: UseAppleMusicLibraryOptions) {
  const { t } = useTranslation();
  const hasLoadedRef = useRef(false);

  // Reusable progress-toast helper so both the auto-load and `refresh()`
  // share the same UX. Returns the toast id so callers can finalize it.
  const runWithProgressToast = useCallback(
    async (force: boolean): Promise<number> => {
      const toastId = `apple-music-library-load`;
      const initialMessage = t(
        "apps.ipod.dialogs.appleMusicLibraryLoading",
        "Loading Apple Music library…"
      );
      toast.loading(initialMessage, {
        id: toastId,
        duration: Infinity,
      });
      try {
        const count = await fetchAppleMusicLibrary({
          force,
          onProgress: (loaded, total) => {
            const message = total
              ? t(
                  "apps.ipod.dialogs.appleMusicLibraryProgressOf",
                  `Loading Apple Music library… ${loaded} of ${total}`,
                  { loaded, total }
                )
              : t(
                  "apps.ipod.dialogs.appleMusicLibraryProgress",
                  `Loading Apple Music library… ${loaded} songs`,
                  { loaded }
                );
            toast.loading(message, { id: toastId, duration: Infinity });
          },
        });
        toast.success(
          t(
            "apps.ipod.dialogs.appleMusicLibraryLoaded",
            `Apple Music library loaded — ${count} songs`,
            { count }
          ),
          { id: toastId, duration: 4000 }
        );
        return count;
      } catch (err) {
        toast.error(
          t(
            "apps.ipod.dialogs.appleMusicLibraryFailed",
            "Failed to load Apple Music library"
          ),
          {
            id: toastId,
            description: err instanceof Error ? err.message : String(err),
            duration: 6000,
          }
        );
        throw err;
      }
    },
    [t]
  );

  const refresh = useCallback(async () => {
    if (!isAuthorized) return 0;
    return runWithProgressToast(true);
  }, [isAuthorized, runWithProgressToast]);

  useEffect(() => {
    if (!enabled || !isAuthorized) return;
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    runWithProgressToast(false).catch((err) => {
      console.error("[apple music] initial library load failed", err);
    });
  }, [enabled, isAuthorized, runWithProgressToast]);

  // Reset the "has loaded" guard whenever the user signs out so a new sign-in
  // triggers a fresh fetch.
  useEffect(() => {
    if (!isAuthorized) hasLoadedRef.current = false;
  }, [isAuthorized]);

  return { refresh };
}
