import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  useIpodStore,
  type AppleMusicPlaylist,
  type Track,
} from "@/stores/useIpodStore";
import { getMusicKitInstance } from "@/hooks/useMusicKit";
import {
  loadAllAppleMusicPlaylistTracks,
  loadAppleMusicLibrary,
  loadAppleMusicPlaylists,
  loadAppleMusicPlaylistTracks,
  loadAppleMusicTrackCollection,
  saveAppleMusicPlaylists,
  saveAppleMusicPlaylistTracks,
  saveAppleMusicTrackCollection,
  type AppleMusicTrackCollectionKey,
} from "@/utils/appleMusicLibraryCache";

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
    albumArtistName?: string;
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
  relationships?: {
    albums?: {
      data?: { id: string; type: string }[];
    };
  };
}

interface AppleMusicAlbumResource {
  id: string;
  type: string;
  attributes?: {
    name?: string;
    artistName?: string;
    artwork?: {
      url?: string;
      width?: number;
      height?: number;
    };
    playParams?: {
      id?: string;
      catalogId?: string;
    };
  };
}

interface LibrarySongsResponse {
  data?: AppleMusicLibrarySongResource[];
  included?: AppleMusicAlbumResource[];
  next?: string;
  meta?: {
    total?: number;
  };
}

interface AppleMusicLibraryPlaylistResource {
  id: string;
  type: string;
  attributes?: {
    name?: string;
    artwork?: {
      url?: string;
      width?: number;
      height?: number;
    };
    trackCount?: number;
    canEdit?: boolean;
    playParams?: {
      id: string;
      globalId?: string;
    };
  };
}

interface LibraryPlaylistsResponse {
  data?: AppleMusicLibraryPlaylistResource[];
  meta?: {
    total?: number;
  };
}

interface LibraryPlaylistTracksResponse {
  data?: AppleMusicLibrarySongResource[];
  included?: AppleMusicAlbumResource[];
  meta?: {
    total?: number;
  };
}

interface AppleMusicTrackSearchResponse {
  results?: {
    songs?: { data?: AppleMusicLibrarySongResource[] };
    "library-songs"?: { data?: AppleMusicLibrarySongResource[] };
    "library-playlists"?: { data?: AppleMusicLibraryPlaylistResource[] };
  };
}

interface RecentlyAddedResponse {
  data?: AppleMusicLibrarySongResource[];
}

export type AppleMusicSearchScope = "catalog" | "library";

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
  res: AppleMusicLibrarySongResource,
  albumResource?: AppleMusicAlbumResource
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
    album: attrs.albumName || albumResource?.attributes?.name,
    albumArtist: attrs.albumArtistName || albumResource?.attributes?.artistName,
    appleMusicAlbumId:
      albumResource?.attributes?.playParams?.catalogId ||
      albumResource?.attributes?.playParams?.id ||
      albumResource?.id,
    cover: resolveArtworkUrl(attrs.artwork, 600) ?? resolveArtworkUrl(albumResource?.attributes?.artwork, 600),
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

function buildIncludedAlbumMap(
  included: AppleMusicAlbumResource[] | undefined
): Map<string, AppleMusicAlbumResource> {
  const albums = new Map<string, AppleMusicAlbumResource>();
  for (const item of included ?? []) {
    if (item.type !== "albums" && item.type !== "library-albums") continue;
    albums.set(`${item.type}:${item.id}`, item);
    albums.set(item.id, item);
  }
  return albums;
}

function getIncludedAlbumForSong(
  song: AppleMusicLibrarySongResource,
  albums: Map<string, AppleMusicAlbumResource>
): AppleMusicAlbumResource | undefined {
  const ref = song.relationships?.albums?.data?.[0];
  if (!ref) return undefined;
  return albums.get(`${ref.type}:${ref.id}`) ?? albums.get(ref.id);
}

function libraryPlaylistResourceToPlaylist(
  res: AppleMusicLibraryPlaylistResource
): AppleMusicPlaylist | null {
  const attrs = res.attributes;
  if (!attrs?.name) return null;

  const playParams = attrs.playParams;
  return {
    id: res.id,
    globalId: playParams?.globalId,
    name: attrs.name,
    artworkUrl: resolveArtworkUrl(attrs.artwork, 300),
    trackCount: attrs.trackCount,
    canEdit: attrs.canEdit,
  };
}

const PAGE_SIZE = 100;
const MAX_PAGES = 50; // safety cap (5,000 songs)
const SEARCH_RESULT_LIMIT = 15;
const RECENTLY_ADDED_RESOURCE_LIMIT = 25;
const RECENTLY_ADDED_TRACK_LIMIT = 100;
const RECENTLY_ADDED_COLLECTION_KEY: AppleMusicTrackCollectionKey =
  "recently-added";
const FAVORITE_SONGS_COLLECTION_KEY: AppleMusicTrackCollectionKey =
  "favorite-songs";

function getAppleMusicInstanceForUser() {
  const instance = getMusicKitInstance();
  if (!instance) throw new Error("MusicKit instance is not configured");
  if (!instance.isAuthorized) {
    throw new Error("Apple Music user is not authorized");
  }
  return instance;
}

function getCatalogStorefront(instance: MusicKit.MusicKitInstance): string {
  return (
    instance.storefrontId ||
    useIpodStore.getState().appleMusicStorefrontId ||
    "us"
  );
}

function isAppleMusicCacheFresh(loadedAt: number | undefined): boolean {
  return (
    typeof loadedAt === "number" &&
    Date.now() - loadedAt < APPLE_MUSIC_LIBRARY_STALE_AFTER_MS
  );
}

export async function searchAppleMusicTracks(
  query: string,
  scope: AppleMusicSearchScope
): Promise<Track[]> {
  const term = query.trim();
  if (!term) return [];

  const instance = getAppleMusicInstanceForUser();
  const response =
    scope === "catalog"
      ? await instance.api.music<AppleMusicTrackSearchResponse>(
          `/v1/catalog/${encodeURIComponent(getCatalogStorefront(instance))}/search`,
          {
            term,
            types: "songs",
            limit: SEARCH_RESULT_LIMIT,
          }
        )
      : await instance.api.music<AppleMusicTrackSearchResponse>(
          "/v1/me/library/search",
          {
            term,
            types: "library-songs",
            limit: SEARCH_RESULT_LIMIT,
          }
        );

  const data = response?.data as AppleMusicTrackSearchResponse | undefined;
  const resources =
    scope === "catalog"
      ? data?.results?.songs?.data
      : data?.results?.["library-songs"]?.data;

  return (resources ?? [])
    .map((resource) => libraryResourceToTrack(resource))
    .filter((track): track is Track => track !== null);
}

async function fetchLibraryAlbumTracks(albumId: string): Promise<Track[]> {
  const instance = getAppleMusicInstanceForUser();
  const response = await instance.api.music<LibraryPlaylistTracksResponse>(
    `/v1/me/library/albums/${encodeURIComponent(albumId)}/tracks`,
    {
      limit: PAGE_SIZE,
      "include[library-songs]": "catalog,albums",
    }
  );
  const data = response?.data as LibraryPlaylistTracksResponse | undefined;
  const albums = buildIncludedAlbumMap(data?.included);
  return (data?.data ?? [])
    .map((resource) =>
      libraryResourceToTrack(resource, getIncludedAlbumForSong(resource, albums))
    )
    .filter((track): track is Track => track !== null);
}

async function fetchAppleMusicRecentlyAddedTracksFromApi(): Promise<Track[]> {
  const instance = getAppleMusicInstanceForUser();
  const response = await instance.api.music<RecentlyAddedResponse>(
    "/v1/me/library/recently-added",
    {
      limit: RECENTLY_ADDED_RESOURCE_LIMIT,
    }
  );

  const data = response?.data as RecentlyAddedResponse | undefined;
  const tracks: Track[] = [];
  const seenIds = new Set<string>();

  for (const resource of data?.data ?? []) {
    if (tracks.length >= RECENTLY_ADDED_TRACK_LIMIT) break;

    const addTrack = (track: Track) => {
      if (seenIds.has(track.id)) return;
      seenIds.add(track.id);
      tracks.push(track);
    };

    if (resource.type === "library-songs") {
      const track = libraryResourceToTrack(resource);
      if (track) addTrack(track);
      continue;
    }

    if (resource.type === "library-albums") {
      try {
        const albumTracks = await fetchLibraryAlbumTracks(resource.id);
        for (const track of albumTracks) {
          if (tracks.length >= RECENTLY_ADDED_TRACK_LIMIT) break;
          addTrack(track);
        }
      } catch (err) {
        console.warn(
          `[apple music] failed to load recently added album ${resource.id}`,
          err
        );
      }
    }
  }

  return tracks;
}

export async function fetchAppleMusicRecentlyAddedTracks(
  options: FetchPlaylistTracksOptions = {}
): Promise<Track[]> {
  const cached = await loadAppleMusicTrackCollection(
    RECENTLY_ADDED_COLLECTION_KEY
  );
  if (
    !options.force &&
    cached?.tracks.length &&
    isAppleMusicCacheFresh(cached.loadedAt)
  ) {
    return cached.tracks;
  }

  try {
    const tracks = await fetchAppleMusicRecentlyAddedTracksFromApi();
    if (tracks.length === 0 && cached?.tracks.length) {
      console.warn(
        "[apple music] recently added refresh returned 0 songs; keeping cached collection"
      );
      return cached.tracks;
    }

    void saveAppleMusicTrackCollection(RECENTLY_ADDED_COLLECTION_KEY, {
      tracks,
      loadedAt: Date.now(),
    });
    return tracks;
  } catch (err) {
    if (cached?.tracks.length) {
      console.warn(
        "[apple music] recently added refresh failed (using cached collection)",
        err
      );
      return cached.tracks;
    }
    throw err;
  }
}

function isFavoriteSongsPlaylist(playlist: AppleMusicPlaylist): boolean {
  const normalizedName = playlist.name.trim().toLocaleLowerCase();
  return (
    normalizedName === "favorite songs" ||
    normalizedName === "favourite songs"
  );
}

async function findFavoriteSongsPlaylist(): Promise<AppleMusicPlaylist | null> {
  const cachedPlaylist = useIpodStore
    .getState()
    .appleMusicPlaylists.find(isFavoriteSongsPlaylist);
  if (cachedPlaylist) return cachedPlaylist;

  const instance = getAppleMusicInstanceForUser();
  const response = await instance.api.music<AppleMusicTrackSearchResponse>(
    "/v1/me/library/search",
    {
      term: "Favorite Songs",
      types: "library-playlists",
      limit: 10,
    }
  );
  const data = response?.data as AppleMusicTrackSearchResponse | undefined;
  const playlists = (data?.results?.["library-playlists"]?.data ?? [])
    .map((resource) => libraryPlaylistResourceToPlaylist(resource))
    .filter((playlist): playlist is AppleMusicPlaylist => playlist !== null);

  return playlists.find(isFavoriteSongsPlaylist) ?? playlists[0] ?? null;
}

export async function fetchAppleMusicFavoriteSongTracks(
  options: FetchPlaylistTracksOptions = {}
): Promise<Track[]> {
  const cached = await loadAppleMusicTrackCollection(
    FAVORITE_SONGS_COLLECTION_KEY
  );
  if (
    !options.force &&
    cached?.tracks.length &&
    isAppleMusicCacheFresh(cached.loadedAt)
  ) {
    return cached.tracks;
  }

  try {
    const playlist = await findFavoriteSongsPlaylist();
    if (!playlist) return cached?.tracks ?? [];

    const tracks = await fetchAppleMusicPlaylistTracks(playlist.id, {
      force: options.force,
    });
    if (tracks.length === 0 && cached?.tracks.length) {
      console.warn(
        "[apple music] favorite songs refresh returned 0 songs; keeping cached collection"
      );
      return cached.tracks;
    }

    void saveAppleMusicTrackCollection(FAVORITE_SONGS_COLLECTION_KEY, {
      tracks,
      loadedAt: Date.now(),
    });
    return tracks;
  } catch (err) {
    if (cached?.tracks.length) {
      console.warn(
        "[apple music] favorite songs refresh failed (using cached collection)",
        err
      );
      return cached.tracks;
    }
    throw err;
  }
}

export async function cacheAppleMusicFavoriteSongTrack(
  track: Track
): Promise<void> {
  const cached = await loadAppleMusicTrackCollection(
    FAVORITE_SONGS_COLLECTION_KEY
  );
  const tracks = [
    track,
    ...(cached?.tracks ?? []).filter((candidate) => candidate.id !== track.id),
  ];
  await saveAppleMusicTrackCollection(FAVORITE_SONGS_COLLECTION_KEY, {
    tracks,
    // If we only know about the newly favorited track, keep the cache stale
    // so the next menu open still asks Apple Music for the complete playlist.
    loadedAt: cached?.tracks.length ? Date.now() : 0,
  });
}

export async function addAppleMusicTrackToFavorites(track: Track): Promise<void> {
  const instance = getAppleMusicInstanceForUser();
  const params = track.appleMusicPlayParams;
  const catalogId = params?.catalogId || track.id.replace(/^am:/, "");
  const libraryId = params?.libraryId;

  const searchParams = new URLSearchParams();
  if (catalogId && !catalogId.startsWith("i.")) {
    searchParams.set("ids[songs]", catalogId);
  } else if (libraryId || catalogId) {
    searchParams.set("ids[library-songs]", libraryId || catalogId);
  } else {
    throw new Error("Current Apple Music track is missing a favorite-able ID");
  }

  const response = await fetch(
    `https://api.music.apple.com/v1/me/favorites?${searchParams.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${instance.developerToken}`,
        "Music-User-Token": instance.musicUserToken,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      errorText || `Apple Music favorites request failed (${response.status})`
    );
  }
}

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
export const APPLE_MUSIC_LIBRARY_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

interface FetchOptions {
  /** Force a refetch even if a load is already in progress. */
  force?: boolean;
  /** Optional progress callback; invoked with `(loaded, total)` per page. */
  onProgress?: (loaded: number, total: number | undefined) => void;
}

interface FetchPlaylistTracksOptions {
  /** Force a refetch even when a fresh cache exists. */
  force?: boolean;
}

function isAppleMusicNotFoundError(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const maybeStatus = (err as { status?: unknown; statusCode?: unknown });
    if (maybeStatus.status === 404 || maybeStatus.statusCode === 404) {
      return true;
    }
    const maybeResponse = (err as { response?: { status?: unknown } }).response;
    if (maybeResponse?.status === 404) return true;
  }
  return err instanceof Error && /\b404\b/.test(err.message);
}

async function fetchAppleMusicPlaylistsList(): Promise<AppleMusicPlaylist[]> {
  const instance = getMusicKitInstance();
  if (!instance) throw new Error("MusicKit instance is not configured");
  if (!instance.isAuthorized) {
    throw new Error("Apple Music user is not authorized");
  }

  const aggregated: AppleMusicPlaylist[] = [];
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await instance.api.music<LibraryPlaylistsResponse>(
      "/v1/me/library/playlists",
      {
        limit: PAGE_SIZE,
        offset,
      }
    );
    const data = response?.data as LibraryPlaylistsResponse | undefined;
    const items = data?.data ?? [];

    for (const item of items) {
      const playlist = libraryPlaylistResourceToPlaylist(item);
      if (playlist) aggregated.push(playlist);
    }

    if (items.length < PAGE_SIZE) break;
    offset += items.length;
  }

  return aggregated;
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
          "include[library-songs]": "catalog,albums",
        }
      );
      const data = response?.data as LibrarySongsResponse | undefined;
      const items = data?.data ?? [];
      const albums = buildIncludedAlbumMap(data?.included);
      total = data?.meta?.total ?? total;

      for (const item of items) {
        const track = libraryResourceToTrack(
          item,
          getIncludedAlbumForSong(item, albums)
        );
        if (track) aggregated.push(track);
      }

      options.onProgress?.(aggregated.length, total);

      if (items.length < PAGE_SIZE) break;
      offset += items.length;
    }

    // Defensive: never overwrite a non-empty cached library with an empty
    // refresh result. A flaky network or rate-limit response can return zero
    // pages even when the user has thousands of songs — wiping the cache
    // (and its IndexedDB copy) makes the iPod look empty until the next
    // successful fetch. Treat empty-after-non-empty as a refresh failure
    // and keep the existing tracks.
    const existingTracks = useIpodStore.getState().appleMusicTracks;
    if (aggregated.length === 0 && existingTracks.length > 0) {
      store.setAppleMusicLibraryLoading(false);
      console.warn(
        "[apple music] refresh returned 0 songs; keeping cached library"
      );
    } else {
      store.setAppleMusicTracks(aggregated);
    }

    try {
      const playlists = await fetchAppleMusicPlaylistsList();
      const existingPlaylists = useIpodStore.getState().appleMusicPlaylists;
      if (playlists.length === 0 && existingPlaylists.length > 0) {
        console.warn(
          "[apple music] playlist refresh returned 0; keeping cached list"
        );
      } else {
        const loadedAt = Date.now();
        store.setAppleMusicPlaylists(playlists);
        void saveAppleMusicPlaylists({ playlists, loadedAt });
      }
    } catch (err) {
      console.warn("[apple music] playlist sync failed (songs kept)", err);
    }

    return aggregated.length || existingTracks.length;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    store.setAppleMusicLibraryError(message);
    throw err;
  }
}

/**
 * Lazy-load tracks for one library playlist. Uses a 24h stale-while-revalidate
 * window keyed per playlist id.
 */
export async function fetchAppleMusicPlaylistTracks(
  playlistId: string,
  options: FetchPlaylistTracksOptions = {}
): Promise<Track[]> {
  const instance = getMusicKitInstance();
  if (!instance) throw new Error("MusicKit instance is not configured");
  if (!instance.isAuthorized) {
    throw new Error("Apple Music user is not authorized");
  }

  const store = useIpodStore.getState();
  let cachedTracks = store.appleMusicPlaylistTracks[playlistId];
  let loadedAt = store.appleMusicPlaylistTracksLoadedAt[playlistId];

  if (!cachedTracks || cachedTracks.length === 0) {
    const cached = await loadAppleMusicPlaylistTracks(playlistId);
    if (cached && cached.tracks.length > 0) {
      useIpodStore.setState((state) => ({
        appleMusicPlaylistTracks: {
          ...state.appleMusicPlaylistTracks,
          [playlistId]: cached.tracks,
        },
        appleMusicPlaylistTracksLoadedAt: {
          ...state.appleMusicPlaylistTracksLoadedAt,
          [playlistId]: cached.loadedAt,
        },
      }));
      cachedTracks = cached.tracks;
      loadedAt = cached.loadedAt;
    }
  }

  const ageMs = loadedAt ? Date.now() - loadedAt : Infinity;
  const isFresh = ageMs < APPLE_MUSIC_LIBRARY_STALE_AFTER_MS;

  if (!options.force && isFresh && cachedTracks && cachedTracks.length > 0) {
    return cachedTracks;
  }

  if (store.appleMusicPlaylistTracksLoading[playlistId]) {
    return cachedTracks ?? [];
  }

  store.setAppleMusicPlaylistTracksLoading(playlistId, true);

  const aggregated: Track[] = [];
  try {
    let offset = 0;
    let total: number | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      let response: { data: LibraryPlaylistTracksResponse };
      try {
        response = await instance.api.music<LibraryPlaylistTracksResponse>(
          `/v1/me/library/playlists/${encodeURIComponent(playlistId)}/tracks`,
          {
            limit: PAGE_SIZE,
            offset,
            "include[library-songs]": "catalog,albums",
          }
        );
      } catch (err) {
        if (offset > 0 && isAppleMusicNotFoundError(err)) {
          console.warn(
            `[apple music] playlist ${playlistId} returned 404 after ${aggregated.length} tracks; treating as end of pagination`
          );
          break;
        }
        throw err;
      }
      const data = response?.data as LibraryPlaylistTracksResponse | undefined;
      const items = data?.data ?? [];
      const albums = buildIncludedAlbumMap(data?.included);
      total = data?.meta?.total ?? total;

      for (const item of items) {
        const track = libraryResourceToTrack(
          item,
          getIncludedAlbumForSong(item, albums)
        );
        if (track) aggregated.push(track);
      }

      if (typeof total === "number" && aggregated.length >= total) break;
      if (items.length < PAGE_SIZE) break;
      offset += items.length;
    }

    const savedAt = Date.now();
    store.setAppleMusicPlaylistTracks(playlistId, aggregated);
    void saveAppleMusicPlaylistTracks(playlistId, {
      tracks: aggregated,
      loadedAt: savedAt,
    });
    return aggregated;
  } catch (err) {
    store.setAppleMusicPlaylistTracksLoading(playlistId, false);
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
 *   - The library is persisted to IndexedDB, so reloading the page or
 *     reopening the app does NOT re-fetch.
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

  // Hydrate from IndexedDB as soon as the iPod opens — auth not required.
  //
  // Important: do NOT guard this behind a `useRef(false)` flag. React Fast
  // Refresh preserves component state across HMR, but Vite invalidation
  // cascades through `useIpodStore.ts` whenever any of its dependencies
  // change — and the recreated store starts with empty Apple Music
  // collections (those fields are excluded from the localStorage
  // `partialize` because they live in IndexedDB). A surviving ref would
  // prevent re-hydration after that reset, leaving the library blank.
  //
  // Instead, the body is idempotent: every branch checks the live store
  // first and only fills the slot when it is empty. We also subscribe to
  // the store so a *runtime* reset (HMR, sign-out + back-in, etc.) fires
  // a fresh hydration pass.
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let inFlight = false;

    const hydrateFromCache = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        // Library tracks --------------------------------------------------
        if (useIpodStore.getState().appleMusicTracks.length === 0) {
          const cached = await loadAppleMusicLibrary();
          if (cancelled) return;
          const latest = useIpodStore.getState();
          if (
            cached &&
            cached.tracks.length > 0 &&
            latest.appleMusicTracks.length === 0
          ) {
            useIpodStore.setState({
              appleMusicTracks: cached.tracks,
              appleMusicLibraryLoadedAt: cached.loadedAt,
              appleMusicStorefrontId:
                cached.storefrontId ?? latest.appleMusicStorefrontId,
            });
          }
        }

        // Playlist list ---------------------------------------------------
        if (useIpodStore.getState().appleMusicPlaylists.length === 0) {
          const cachedPlaylists = await loadAppleMusicPlaylists();
          if (cancelled) return;
          if (
            cachedPlaylists &&
            cachedPlaylists.playlists.length > 0 &&
            useIpodStore.getState().appleMusicPlaylists.length === 0
          ) {
            useIpodStore.setState({
              appleMusicPlaylists: cachedPlaylists.playlists,
            });
          }
        }

        // Per-playlist tracks (bulk hydrate every cached playlist) -------
        if (
          Object.keys(useIpodStore.getState().appleMusicPlaylistTracks)
            .length === 0
        ) {
          const all = await loadAllAppleMusicPlaylistTracks();
          if (cancelled) return;
          const playlistIds = Object.keys(all);
          if (playlistIds.length > 0) {
            useIpodStore.setState((state) => {
              const tracksMap = { ...state.appleMusicPlaylistTracks };
              const loadedAtMap = {
                ...state.appleMusicPlaylistTracksLoadedAt,
              };
              for (const id of playlistIds) {
                if (!tracksMap[id] || tracksMap[id].length === 0) {
                  tracksMap[id] = all[id].tracks;
                  loadedAtMap[id] = all[id].loadedAt;
                }
              }
              return {
                appleMusicPlaylistTracks: tracksMap,
                appleMusicPlaylistTracksLoadedAt: loadedAtMap,
              };
            });
          }
        }
      } finally {
        inFlight = false;
      }
    };

    void hydrateFromCache();

    // Re-hydrate when the store gets reset out from under us. HMR is the
    // common cause in development; signing out + signing back in via the
    // menu hits the same code path so this is also load-bearing in prod.
    const unsubscribe = useIpodStore.subscribe((state, prev) => {
      if (cancelled) return;
      const tracksCleared =
        state.appleMusicTracks.length === 0 &&
        prev.appleMusicTracks.length > 0;
      const playlistsCleared =
        state.appleMusicPlaylists.length === 0 &&
        prev.appleMusicPlaylists.length > 0;
      const playlistTracksCleared =
        Object.keys(state.appleMusicPlaylistTracks).length === 0 &&
        Object.keys(prev.appleMusicPlaylistTracks).length > 0;
      if (tracksCleared || playlistsCleared || playlistTracksCleared) {
        void hydrateFromCache();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled]);

  // Decide whether the cache is fresh enough or needs a network refresh.
  // Auth IS required here because this path may hit the Apple Music API.
  useEffect(() => {
    if (!enabled || !isAuthorized) return;
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    let cancelled = false;
    const decideLoadStrategy = async () => {
      // Make sure hydration has had a chance to run before we decide.
      // The hydration effect above is fire-and-forget; if the in-memory
      // store is still empty, do the IndexedDB read inline so we don't
      // accidentally fall into the "first-ever load" branch and pop a
      // toast for users who already have a cached library.
      let { appleMusicTracks, appleMusicLibraryLoadedAt } =
        useIpodStore.getState();
      if (appleMusicTracks.length === 0) {
        const cached = await loadAppleMusicLibrary();
        if (cancelled) return;
        if (cached && cached.tracks.length > 0) {
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

  // Reset the refresh-decision guard whenever the user signs out so a new
  // sign-in re-evaluates whether a fetch is needed. Hydration runs once
  // per mount and doesn't need to retry on sign-out.
  useEffect(() => {
    if (!isAuthorized) hasLoadedRef.current = false;
  }, [isAuthorized]);

  return { refresh };
}
