import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const browserGlobals = globalThis as typeof globalThis & {
  localStorage?: Storage;
};

if (!browserGlobals.localStorage) {
  Object.defineProperty(browserGlobals, "localStorage", {
    configurable: true,
    value: new MemoryStorage(),
    writable: true,
  });
}

const actualMusicKit = await import("../src/hooks/useMusicKit");
const actualAppleMusicCache = await import("../src/utils/appleMusicLibraryCache");

interface MockMusicKitInstance {
  isAuthorized: boolean;
  storefrontId: string;
  api: {
    music: ReturnType<typeof mock>;
  };
}

let mockMusicKitInstance: MockMusicKitInstance | null = null;
const savedLibraries: unknown[] = [];
const savedPlaylists: unknown[] = [];
const prunedPlaylistIds: string[][] = [];

mock.module("@/hooks/useMusicKit", () => ({
  ...actualMusicKit,
  getMusicKitInstance: () =>
    mockMusicKitInstance as unknown as MusicKit.MusicKitInstance | null,
}));

mock.module("@/utils/appleMusicLibraryCache", () => ({
  ...actualAppleMusicCache,
  loadAppleMusicLibrary: mock(async () => null),
  loadAppleMusicPlaylists: mock(async () => null),
  loadAppleMusicPlaylistTracks: mock(async () => null),
  loadAppleMusicTrackCollection: mock(async () => null),
  saveAppleMusicLibrary: mock(async (payload: unknown) => {
    savedLibraries.push(payload);
  }),
  saveAppleMusicPlaylists: mock(async (payload: unknown) => {
    savedPlaylists.push(payload);
  }),
  saveAppleMusicPlaylistTracks: mock(async () => undefined),
  saveAppleMusicTrackCollection: mock(async () => undefined),
  pruneAppleMusicPlaylistTracksCache: mock(async (playlistIds: string[]) => {
    prunedPlaylistIds.push(playlistIds);
  }),
}));

const {
  bumpAppleMusicSyncGeneration,
  fetchAppleMusicLibrary,
  refreshAppleMusicPlaylists,
} = await import("../src/apps/ipod/hooks/useAppleMusicLibrary");
const { useIpodStore } = await import("../src/stores/useIpodStore");

afterAll(() => {
  mock.module("@/hooks/useMusicKit", () => actualMusicKit);
  mock.module("@/utils/appleMusicLibraryCache", () => actualAppleMusicCache);
});

beforeEach(() => {
  bumpAppleMusicSyncGeneration();
  mockMusicKitInstance = null;
  savedLibraries.length = 0;
  savedPlaylists.length = 0;
  prunedPlaylistIds.length = 0;
  useIpodStore.setState({
    appleMusicTracks: [],
    appleMusicPlaylists: [],
    appleMusicPlaylistsLoadedAt: null,
    appleMusicPlaylistsLoading: false,
    appleMusicPlaylistTracks: {},
    appleMusicPlaylistTracksLoadedAt: {},
    appleMusicPlaylistTracksLoading: {},
    appleMusicRecentlyAddedTracks: [],
    appleMusicRecentlyAddedLoadedAt: null,
    appleMusicRecentlyAddedLoading: false,
    appleMusicFavoriteTracks: [],
    appleMusicFavoriteTracksLoadedAt: null,
    appleMusicFavoritesLoading: false,
    appleMusicCurrentSongId: null,
    appleMusicPlaybackQueue: null,
    appleMusicLibraryLoadedAt: null,
    appleMusicLibraryLoading: false,
    appleMusicLibraryError: null,
    appleMusicStorefrontId: null,
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createMusicKitInstance(
  music: ReturnType<typeof mock>
): MockMusicKitInstance {
  return {
    isAuthorized: true,
    storefrontId: "us",
    api: { music },
  };
}

describe("Apple Music sign-out race guards", () => {
  test("drops an in-flight library refresh after sign-out invalidates the session", async () => {
    const response = deferred<unknown>();
    const music = mock(async () => response.promise);
    mockMusicKitInstance = createMusicKitInstance(music);

    const refresh = fetchAppleMusicLibrary({ force: true });
    expect(music).toHaveBeenCalledTimes(1);

    mockMusicKitInstance.isAuthorized = false;
    bumpAppleMusicSyncGeneration();
    useIpodStore.setState({
      appleMusicTracks: [],
      appleMusicLibraryLoading: false,
      appleMusicLibraryLoadedAt: null,
    });

    response.resolve({
      data: {
        data: [
          {
            id: "i.stale",
            type: "library-songs",
            attributes: {
              name: "Stale Song",
              artistName: "Old User",
              playParams: {
                id: "i.stale",
                kind: "song",
                isLibrary: true,
                catalogId: "123",
              },
            },
          },
        ],
        meta: { total: 1 },
      },
    });

    await expect(refresh).resolves.toBe(0);
    expect(useIpodStore.getState().appleMusicTracks).toEqual([]);
    expect(useIpodStore.getState().appleMusicLibraryLoading).toBe(false);
    expect(savedLibraries).toHaveLength(0);
  });

  test("drops an in-flight playlist refresh after sign-out invalidates the session", async () => {
    const response = deferred<unknown>();
    const music = mock(async () => response.promise);
    mockMusicKitInstance = createMusicKitInstance(music);

    const refresh = refreshAppleMusicPlaylists({ force: true });
    expect(useIpodStore.getState().appleMusicPlaylistsLoading).toBe(true);

    mockMusicKitInstance.isAuthorized = false;
    bumpAppleMusicSyncGeneration();
    useIpodStore.setState({
      appleMusicPlaylists: [],
      appleMusicPlaylistsLoadedAt: null,
      appleMusicPlaylistsLoading: false,
    });

    response.resolve({
      data: {
        data: [
          {
            id: "p.stale",
            type: "library-playlists",
            attributes: {
              name: "Old Playlist",
              playParams: { id: "p.stale" },
            },
          },
        ],
      },
    });

    await expect(refresh).resolves.toEqual([]);
    expect(useIpodStore.getState().appleMusicPlaylists).toEqual([]);
    expect(useIpodStore.getState().appleMusicPlaylistsLoading).toBe(false);
    expect(savedPlaylists).toHaveLength(0);
    expect(prunedPlaylistIds).toHaveLength(0);
  });
});
