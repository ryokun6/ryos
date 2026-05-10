import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useIpodStore, type Track } from "@/stores/useIpodStore";
import { getMusicKitInstance } from "@/hooks/useMusicKit";
import { loadAppleMusicLibrary } from "@/utils/appleMusicLibraryCache";

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

/**
 * Anything younger than this is treated as "fresh enough" — we use the
 * cached library immediately without any network request. Older copies
 * are still shown immediately, but we kick off a silent background
 * refresh so the next interaction has up-to-date data.
 *
 * 24h is a reasonable trade-off: most users don't add hundreds of new
 * songs in a single day, and Apple Music libraries can be very large
 * (5,000+ songs = 50 paginated API calls), so re-fetching on every
 * page reload is hugely wasteful.
 */
const APPLE_MUSIC_LIBRARY_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

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
 * Hook that auto-loads the user's Apple Music library the first time
 * both `enabled` and `isAuthorized` are true.
 *
 * Caching strategy (stale-while-revalidate):
 *   - The library is persisted to localStorage by `useIpodStore`, so
 *     reloading the page or reopening the app does NOT re-fetch.
 *   - On mount, if a cached copy exists:
 *       - Fresh (< 24h): use it as-is, no network request.
 *       - Stale (>= 24h): use it immediately, kick off a silent
 *         background refresh that updates the store when it finishes.
 *   - On mount with no cached copy: show the progress toast and fetch
 *     paginated; this is the only path that ever blocks the UI on a
 *     network round-trip.
 *
 * `refresh()` always forces a foreground fetch and shows the toast.
 */
export function useAppleMusicLibrary({
  enabled,
  isAuthorized,
}: UseAppleMusicLibraryOptions) {
  const { t } = useTranslation();
  const hasLoadedRef = useRef(false);

  // Reusable progress-toast helper. Used for both the very first
  // (cold) load and any explicit user-driven refresh.
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

    let cancelled = false;
    const decideLoadStrategy = async () => {
      // Hydrate from IndexedDB if the in-memory store is empty (always
      // the case after a fresh page load — only librarySource and the
      // current song id are persisted to localStorage).
      let { appleMusicTracks, appleMusicLibraryLoadedAt } =
        useIpodStore.getState();
      if (appleMusicTracks.length === 0) {
        const cached = await loadAppleMusicLibrary();
        if (cancelled) return;
        if (cached && cached.tracks.length > 0) {
          // Use a direct `set` so we don't trigger another IndexedDB
          // write — this is purely a hydration step.
          useIpodStore.setState({
            appleMusicTracks: cached.tracks,
            appleMusicLibraryLoadedAt: cached.loadedAt,
            appleMusicStorefrontId:
              cached.storefrontId ??
              useIpodStore.getState().appleMusicStorefrontId,
          });
          appleMusicTracks = cached.tracks;
          appleMusicLibraryLoadedAt = cached.loadedAt;
        }
      }

      const hasCachedLibrary = appleMusicTracks.length > 0;
      const ageMs = appleMusicLibraryLoadedAt
        ? Date.now() - appleMusicLibraryLoadedAt
        : Infinity;
      const isFresh =
        hasCachedLibrary && ageMs < APPLE_MUSIC_LIBRARY_STALE_AFTER_MS;

      if (isFresh) {
        // Cached library is recent enough — nothing to do. The user
        // sees their tracks instantly and we make zero network
        // requests.
        return;
      }

      if (hasCachedLibrary) {
        // Stale-while-revalidate: keep showing the cached tracks, and
        // refresh quietly in the background. Don't show the progress
        // toast — the user already has a working library.
        fetchAppleMusicLibrary({ force: true }).catch((err) => {
          console.warn(
            "[apple music] background library refresh failed (using cached copy)",
            err
          );
        });
        return;
      }

      // First-ever load (or library was cleared on sign-out): show the
      // toast since the user has nothing to look at until this
      // finishes.
      runWithProgressToast(false).catch((err) => {
        console.error("[apple music] initial library load failed", err);
      });
    };

    void decideLoadStrategy();
    return () => {
      cancelled = true;
    };
  }, [enabled, isAuthorized, runWithProgressToast]);

  // Reset the "has loaded" guard whenever the user signs out so a new sign-in
  // re-evaluates whether a fetch is needed.
  useEffect(() => {
    if (!isAuthorized) hasLoadedRef.current = false;
  }, [isAuthorized]);

  return { refresh };
}
