import { describe, expect, test, beforeEach } from "bun:test";

// Browser globals must be installed before importing the iPod store, which
// imports useChatsStore. useChatsStore reads from `localStorage` at module
// load time to recover the last-used username.
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
  navigator?: Navigator;
};
if (!browserGlobals.localStorage) {
  browserGlobals.localStorage = new MemoryStorage();
}
if (!browserGlobals.navigator) {
  browserGlobals.navigator = { onLine: true, userAgent: "test" } as Navigator;
}

const {
  appleMusicPlayableResourceToTrack,
  libraryResourceToTrack,
  refreshAppleMusicPlaylists,
  refreshStaleAppleMusicPlaylistTracks,
  refreshAppleMusicRecentlyAdded,
  refreshAppleMusicFavorites,
  APPLE_MUSIC_PLAYLISTS_OPPORTUNISTIC_TTL_MS,
  APPLE_MUSIC_PLAYLIST_TRACKS_OPPORTUNISTIC_TTL_MS,
} = await import("../src/apps/ipod/hooks/useAppleMusicLibrary");
const { useIpodStore, appleMusicKitIdToLyricsSongId } = await import("../src/stores/useIpodStore");
const {
  shouldFireEndedForPlaybackState,
  isWithinEndedFanoutDedupWindow,
  ENDED_FANOUT_DEDUP_WINDOW_MS,
  getMusicKitEventItemId,
  shouldSuppressPlaybackStateFanoutWhileQueueLoading,
} = await import(
  "../src/apps/ipod/components/appleMusicPlayerBridgeUtils"
);
type Track = import("../src/stores/useIpodStore").Track;
const {
  isValidAppleMusicSongId,
  isValidYouTubeVideoId,
  isValidSongId,
} = await import("../api/songs/_utils");
const {
  generateAppleMusicSongShareUrl,
  generateIpodSongShareUrl,
  shouldCacheSongMetadataForShare,
} = await import("../src/utils/sharedUrl");

describe("Apple Music song ID validation", () => {
  test("accepts the canonical YouTube video ID format", () => {
    expect(isValidYouTubeVideoId("dQw4w9WgXcQ")).toBe(true);
    expect(isValidSongId("dQw4w9WgXcQ")).toBe(true);
  });

  test("accepts numeric Apple Music catalog IDs prefixed with am:", () => {
    expect(isValidAppleMusicSongId("am:1616228595")).toBe(true);
    expect(isValidSongId("am:1616228595")).toBe(true);
  });

  test("accepts library-style Apple Music IDs (i.<hash>)", () => {
    expect(isValidAppleMusicSongId("am:i.uUZAkT3")).toBe(true);
    expect(isValidSongId("am:i.uUZAkT3")).toBe(true);
  });

  test("rejects malformed IDs", () => {
    expect(isValidSongId("not-a-real-id")).toBe(false);
    expect(isValidSongId("am:")).toBe(false);
    expect(isValidSongId("am:foo bar")).toBe(false);
  });

  test("normalizes MusicKit ids for lyrics API paths", () => {
    expect(appleMusicKitIdToLyricsSongId(undefined)).toBe("");
    expect(appleMusicKitIdToLyricsSongId("1616228595")).toBe("am:1616228595");
    expect(appleMusicKitIdToLyricsSongId("am:1616228595")).toBe("am:1616228595");
  });
});

describe("libraryResourceToTrack", () => {
  test("converts a catalog-backed library song into a Track with am: prefix", () => {
    const track = libraryResourceToTrack({
      id: "i.abc123",
      type: "library-songs",
      attributes: {
        name: "Bohemian Rhapsody",
        artistName: "Queen",
        albumName: "A Night at the Opera",
        durationInMillis: 354320,
        artwork: { url: "https://example/{w}x{h}bb.jpg" },
        playParams: {
          id: "i.abc123",
          kind: "library-songs",
          isLibrary: true,
          catalogId: "1616228595",
        },
      },
    });
    expect(track).not.toBeNull();
    expect(track!.id).toBe("am:1616228595");
    expect(track!.title).toBe("Bohemian Rhapsody");
    expect(track!.artist).toBe("Queen");
    expect(track!.album).toBe("A Night at the Opera");
    expect(track!.durationMs).toBe(354320);
    expect(track!.source).toBe("appleMusic");
    expect(track!.cover).toBe("https://example/600x600bb.jpg");
    expect(track!.appleMusicPlayParams).toEqual({
      catalogId: "1616228595",
      libraryId: "i.abc123",
      kind: "library-songs",
      isLibrary: true,
    });
  });

  test("falls back to library ID when no catalog match is available", () => {
    const track = libraryResourceToTrack({
      id: "i.foo",
      type: "library-songs",
      attributes: {
        name: "Solo Demo",
        playParams: { id: "i.foo", kind: "library-songs", isLibrary: true },
      },
    });
    expect(track).not.toBeNull();
    expect(track!.id).toBe("am:i.foo");
    expect(track!.appleMusicPlayParams?.catalogId).toBeUndefined();
    expect(track!.appleMusicPlayParams?.libraryId).toBe("i.foo");
  });

  test("uses playParams.id as catalog ID for catalog song resources", () => {
    const track = libraryResourceToTrack({
      id: "1616228595",
      type: "songs",
      attributes: {
        name: "Bohemian Rhapsody",
        playParams: { id: "1616228595", kind: "song" },
      },
    });

    expect(track).not.toBeNull();
    expect(track!.id).toBe("am:1616228595");
    expect(track!.appleMusicPlayParams?.catalogId).toBe("1616228595");
    expect(track!.appleMusicPlayParams?.libraryId).toBeUndefined();
  });

  test("returns null when the resource has no playParams", () => {
    const track = libraryResourceToTrack({
      id: "i.broken",
      type: "library-songs",
      attributes: { name: "No params" },
    });
    expect(track).toBeNull();
  });
});

describe("Apple Music playable resources", () => {
  test("converts a station resource into a MusicKit station queue track", () => {
    const track = appleMusicPlayableResourceToTrack({
      id: "ra.u-personal",
      type: "stations",
      attributes: {
        name: "My Station",
        curatorName: "Apple Music",
        url: "https://music.apple.com/us/station/my-station/ra.u-personal",
        artwork: { url: "https://example/{w}x{h}bb.jpg" },
        playParams: {
          id: "ra.u-personal",
          kind: "radioStation",
        },
      },
    });

    expect(track).not.toBeNull();
    expect(track!.id).toBe("am:station:ra.u-personal");
    expect(track!.url).toBe(
      "https://music.apple.com/us/station/my-station/ra.u-personal"
    );
    expect(track!.title).toBe("My Station");
    expect(track!.source).toBe("appleMusic");
    expect(track!.cover).toBe("https://example/600x600bb.jpg");
    expect(track!.appleMusicPlayParams).toEqual({
      stationId: "ra.u-personal",
      kind: "radioStation",
    });
  });

  test("converts a recommendation playlist into a MusicKit playlist queue track", () => {
    const track = appleMusicPlayableResourceToTrack({
      id: "pl.pm-mix",
      type: "playlists",
      attributes: {
        name: "Favorites Mix",
        curatorName: "Apple Music for Me",
        playParams: {
          id: "pl.pm-mix",
          kind: "playlist",
        },
      },
    });

    expect(track).not.toBeNull();
    expect(track!.id).toBe("am:playlist:pl.pm-mix");
    expect(track!.title).toBe("Favorites Mix");
    expect(track!.artist).toBe("Apple Music for Me");
    expect(track!.appleMusicPlayParams).toEqual({
      playlistId: "pl.pm-mix",
      kind: "playlist",
    });
  });
});

describe("Apple Music song sharing", () => {
  test("generates an Apple Music web link instead of an ryOS song share link", () => {
    const track = {
      id: "am:1616228595",
      url: "applemusic:1616228595",
      title: "Bohemian Rhapsody",
      artist: "Queen",
      source: "appleMusic" as const,
      appleMusicPlayParams: {
        catalogId: "1616228595",
      },
    };

    expect(generateAppleMusicSongShareUrl(track, "jp")).toBe(
      "https://music.apple.com/jp/song/1616228595"
    );
    expect(generateIpodSongShareUrl(track, "https://os.ryo.lu", "jp")).toBe(
      "https://music.apple.com/jp/song/1616228595"
    );
  });

  test("preserves Apple Music resource URLs when the API provides them", () => {
    const track = {
      id: "am:1616228595",
      url: "https://music.apple.com/us/song/bohemian-rhapsody/1616228595",
      title: "Bohemian Rhapsody",
      source: "appleMusic" as const,
    };

    expect(generateAppleMusicSongShareUrl(track, "jp")).toBe(track.url);
  });

  test("does not cache Apple Music shares as ryOS shared-song metadata", () => {
    expect(
      shouldCacheSongMetadataForShare({
        id: "am:1616228595",
        url: "applemusic:1616228595",
        title: "Bohemian Rhapsody",
        source: "appleMusic",
      })
    ).toBe(false);

    expect(
      shouldCacheSongMetadataForShare({
        id: "dQw4w9WgXcQ",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        title: "Never Gonna Give You Up",
        source: "youtube",
      })
    ).toBe(true);
  });
});

describe("useIpodStore Apple Music slice", () => {
  beforeEach(() => {
    useIpodStore.setState({
      librarySource: "youtube",
      appleMusicTracks: [],
      appleMusicPlaybackQueue: null,
      appleMusicCurrentSongId: null,
      isPlaying: false,
      currentSongId: null,
      tracks: [],
      loopAll: false,
      loopCurrent: false,
      isShuffled: false,
    });
  });

  test("setLibrarySource clears transient playback state", () => {
    useIpodStore.setState({
      isPlaying: true,
      elapsedTime: 42,
      totalTime: 200,
      appleMusicKitNowPlaying: { title: "On Air", id: "1616228595" },
    });
    useIpodStore.getState().setLibrarySource("appleMusic");
    const state = useIpodStore.getState();
    expect(state.librarySource).toBe("appleMusic");
    expect(state.isPlaying).toBe(false);
    expect(state.elapsedTime).toBe(0);
    expect(state.totalTime).toBe(0);
    expect(state.appleMusicKitNowPlaying).toBeNull();
  });

  test("setLibrarySource can hot-swap between YouTube and Apple Music repeatedly", () => {
    const { setLibrarySource } = useIpodStore.getState();
    setLibrarySource("appleMusic");
    expect(useIpodStore.getState().librarySource).toBe("appleMusic");
    setLibrarySource("youtube");
    expect(useIpodStore.getState().librarySource).toBe("youtube");
    setLibrarySource("appleMusic");
    expect(useIpodStore.getState().librarySource).toBe("appleMusic");
    setLibrarySource("youtube");
    expect(useIpodStore.getState().librarySource).toBe("youtube");
  });

  test("setAppleMusicCurrentSongId clears live MusicKit metadata snapshot", () => {
    useIpodStore.setState({
      librarySource: "appleMusic",
      appleMusicCurrentSongId: "am:station:x",
      appleMusicKitNowPlaying: { title: "Song", id: "999" },
    });
    useIpodStore.getState().setAppleMusicCurrentSongId("am:1");
    expect(useIpodStore.getState().appleMusicKitNowPlaying).toBeNull();
  });

  test("setAppleMusicTracks selects the first track when current is no longer in the list", () => {
    useIpodStore.getState().setAppleMusicTracks([
      {
        id: "am:1",
        url: "applemusic:1",
        title: "One",
        source: "appleMusic",
      },
      {
        id: "am:2",
        url: "applemusic:2",
        title: "Two",
        source: "appleMusic",
      },
    ]);
    expect(useIpodStore.getState().appleMusicCurrentSongId).toBe("am:1");
  });

  test("appleMusicNextTrack walks the library forward without touching the YouTube slice", () => {
    useIpodStore.getState().setAppleMusicTracks([
      { id: "am:1", url: "applemusic:1", title: "One", source: "appleMusic" },
      { id: "am:2", url: "applemusic:2", title: "Two", source: "appleMusic" },
      { id: "am:3", url: "applemusic:3", title: "Three", source: "appleMusic" },
    ]);
    useIpodStore.setState({ tracks: [], currentSongId: null, loopAll: true });
    useIpodStore.getState().setAppleMusicCurrentSongId("am:2");
    useIpodStore.getState().appleMusicNextTrack();
    expect(useIpodStore.getState().appleMusicCurrentSongId).toBe("am:3");
    expect(useIpodStore.getState().currentSongId).toBe(null);
  });

  test("appleMusicNextTrack skips radio stations in the full library order", () => {
    useIpodStore.getState().setAppleMusicTracks([
      { id: "am:1", url: "applemusic:1", title: "One", source: "appleMusic" },
      {
        id: "am:station:ra.1",
        url: "applemusic:station:ra.1",
        title: "Station",
        source: "appleMusic",
        appleMusicPlayParams: { stationId: "ra.1", kind: "radioStation" },
      },
      { id: "am:2", url: "applemusic:2", title: "Two", source: "appleMusic" },
    ]);
    useIpodStore.setState({
      appleMusicPlaybackQueue: null,
      loopAll: true,
      isShuffled: false,
    });
    useIpodStore.getState().setAppleMusicCurrentSongId("am:1");
    useIpodStore.getState().appleMusicNextTrack();
    expect(useIpodStore.getState().appleMusicCurrentSongId).toBe("am:2");
  });

  test("appleMusicPreviousTrack wraps when starting from the first item", () => {
    useIpodStore.getState().setAppleMusicTracks([
      { id: "am:1", url: "applemusic:1", title: "One", source: "appleMusic" },
      { id: "am:2", url: "applemusic:2", title: "Two", source: "appleMusic" },
    ]);
    useIpodStore.getState().setAppleMusicCurrentSongId("am:1");
    useIpodStore.getState().appleMusicPreviousTrack();
    expect(useIpodStore.getState().appleMusicCurrentSongId).toBe("am:2");
  });

  test("adjustLyricOffset updates the Apple Music slice when it is the active source", () => {
    useIpodStore.getState().setAppleMusicTracks([
      {
        id: "am:1",
        url: "applemusic:1",
        title: "One",
        source: "appleMusic",
        lyricOffset: 0,
      },
    ]);
    useIpodStore.getState().setLibrarySource("appleMusic");
    useIpodStore.getState().adjustLyricOffset(0, 250);
    expect(useIpodStore.getState().appleMusicTracks[0].lyricOffset).toBe(250);
    // YouTube slice must remain untouched.
    expect(useIpodStore.getState().tracks).toEqual([]);
  });

  test("setAppleMusicTracks preserves active contextual queue tracks", () => {
    useIpodStore.setState({
      appleMusicTracks: [
        {
          id: "am:library",
          url: "applemusic:library",
          title: "Library",
          source: "appleMusic",
        },
        {
          id: "am:playlist",
          url: "applemusic:playlist",
          title: "Playlist",
          source: "appleMusic",
        },
      ],
      appleMusicPlaybackQueue: ["am:playlist"],
      appleMusicCurrentSongId: "am:playlist",
    });

    useIpodStore.getState().setAppleMusicTracks([
      {
        id: "am:library",
        url: "applemusic:library",
        title: "Library",
        source: "appleMusic",
      },
    ]);

    const state = useIpodStore.getState();
    expect(state.appleMusicTracks.map((track) => track.id)).toEqual([
      "am:library",
      "am:playlist",
    ]);
    expect(state.appleMusicPlaybackQueue).toEqual(["am:playlist"]);
    expect(state.appleMusicCurrentSongId).toBe("am:playlist");
  });

  test("appleMusicNextTrack resets elapsedTime/totalTime so the new track starts at 0", () => {
    useIpodStore.getState().setAppleMusicTracks([
      { id: "am:1", url: "applemusic:1", title: "One", source: "appleMusic" },
      { id: "am:2", url: "applemusic:2", title: "Two", source: "appleMusic" },
    ]);
    useIpodStore.setState({ loopAll: true, isShuffled: false });
    useIpodStore.getState().setAppleMusicCurrentSongId("am:1");
    // Simulate the previous song being mid-playback.
    useIpodStore.setState({ elapsedTime: 95, totalTime: 240 });

    useIpodStore.getState().appleMusicNextTrack();

    const state = useIpodStore.getState();
    expect(state.appleMusicCurrentSongId).toBe("am:2");
    expect(state.elapsedTime).toBe(0);
    expect(state.totalTime).toBe(0);
  });

  test("appleMusicPreviousTrack resets elapsedTime/totalTime so the new track starts at 0", () => {
    useIpodStore.getState().setAppleMusicTracks([
      { id: "am:1", url: "applemusic:1", title: "One", source: "appleMusic" },
      { id: "am:2", url: "applemusic:2", title: "Two", source: "appleMusic" },
    ]);
    useIpodStore.setState({ isShuffled: false });
    useIpodStore.getState().setAppleMusicCurrentSongId("am:2");
    useIpodStore.setState({ elapsedTime: 60, totalTime: 180 });

    useIpodStore.getState().appleMusicPreviousTrack();

    const state = useIpodStore.getState();
    expect(state.appleMusicCurrentSongId).toBe("am:1");
    expect(state.elapsedTime).toBe(0);
    expect(state.totalTime).toBe(0);
  });

  test("appleMusicNextTrack at end of queue without loopAll preserves elapsedTime when staying on the last track", () => {
    useIpodStore.getState().setAppleMusicTracks([
      { id: "am:1", url: "applemusic:1", title: "One", source: "appleMusic" },
      { id: "am:2", url: "applemusic:2", title: "Two", source: "appleMusic" },
    ]);
    useIpodStore.setState({ loopAll: false, isShuffled: false });
    useIpodStore.getState().setAppleMusicCurrentSongId("am:2");
    useIpodStore.setState({ elapsedTime: 30, totalTime: 200 });

    useIpodStore.getState().appleMusicNextTrack();

    const state = useIpodStore.getState();
    expect(state.appleMusicCurrentSongId).toBe("am:2");
    expect(state.isPlaying).toBe(false);
    // Same track ⇒ don't reset position; we only stop playback.
    expect(state.elapsedTime).toBe(30);
    expect(state.totalTime).toBe(200);
  });

  test("appleMusicNextTrack stays inside the contextual queue after a library refresh", () => {
    useIpodStore.setState({
      appleMusicTracks: [
        {
          id: "am:library",
          url: "applemusic:library",
          title: "Library",
          source: "appleMusic",
        },
        {
          id: "am:q1",
          url: "applemusic:q1",
          title: "Queue 1",
          source: "appleMusic",
        },
        {
          id: "am:q2",
          url: "applemusic:q2",
          title: "Queue 2",
          source: "appleMusic",
        },
      ],
      appleMusicPlaybackQueue: ["am:q1", "am:q2"],
      appleMusicCurrentSongId: "am:q1",
      loopAll: true,
      isShuffled: false,
    });

    useIpodStore.getState().setAppleMusicTracks([
      {
        id: "am:library",
        url: "applemusic:library",
        title: "Library",
        source: "appleMusic",
      },
    ]);
    useIpodStore.getState().appleMusicNextTrack();

    expect(useIpodStore.getState().appleMusicCurrentSongId).toBe("am:q2");
  });
});

describe("Apple Music opportunistic playlist refresh", () => {
  beforeEach(() => {
    useIpodStore.setState({
      appleMusicPlaylists: [],
      appleMusicPlaylistsLoadedAt: null,
      appleMusicPlaylistTracks: {},
      appleMusicPlaylistTracksLoadedAt: {},
      appleMusicPlaylistTracksLoading: {},
    });
  });

  test("setAppleMusicPlaylists stamps loadedAt with the current time by default", () => {
    const before = Date.now();
    useIpodStore.getState().setAppleMusicPlaylists([
      {
        id: "p:1",
        name: "Workout",
        artworkUrl: undefined,
        trackCount: 12,
        canEdit: true,
      },
    ]);
    const after = Date.now();
    const state = useIpodStore.getState();
    expect(state.appleMusicPlaylists).toHaveLength(1);
    expect(state.appleMusicPlaylistsLoadedAt).not.toBeNull();
    expect(state.appleMusicPlaylistsLoadedAt!).toBeGreaterThanOrEqual(before);
    expect(state.appleMusicPlaylistsLoadedAt!).toBeLessThanOrEqual(after);
  });

  test("setAppleMusicPlaylists honours an explicit loadedAt (used by hydration from IndexedDB)", () => {
    useIpodStore.getState().setAppleMusicPlaylists(
      [
        {
          id: "p:1",
          name: "Old",
          artworkUrl: undefined,
          trackCount: 0,
          canEdit: false,
        },
      ],
      12345
    );
    expect(useIpodStore.getState().appleMusicPlaylistsLoadedAt).toBe(12345);
  });

  test("refreshAppleMusicPlaylists short-circuits when the cache is fresh enough", async () => {
    const cached = [
      {
        id: "p:1",
        name: "Recent",
        artworkUrl: undefined,
        trackCount: 5,
        canEdit: false,
      },
    ];
    useIpodStore.setState({
      appleMusicPlaylists: cached,
      // Pretend the cache was written 1 second ago — well within the
      // opportunistic TTL.
      appleMusicPlaylistsLoadedAt: Date.now() - 1000,
    });

    const result = await refreshAppleMusicPlaylists();

    // Returns the cached array as-is (no network call attempted).
    expect(result).toBe(cached);
    // Timestamp untouched.
    expect(
      Date.now() - (useIpodStore.getState().appleMusicPlaylistsLoadedAt ?? 0)
    ).toBeGreaterThanOrEqual(1000);
  });

  test("refreshAppleMusicPlaylists returns cached list silently when MusicKit isn't available", async () => {
    const cached = [
      {
        id: "p:1",
        name: "Stale",
        artworkUrl: undefined,
        trackCount: 5,
        canEdit: false,
      },
    ];
    useIpodStore.setState({
      appleMusicPlaylists: cached,
      // Mark the cache as stale so the freshness check doesn't short-
      // circuit and we exercise the "no MusicKit instance" branch.
      appleMusicPlaylistsLoadedAt:
        Date.now() - APPLE_MUSIC_PLAYLISTS_OPPORTUNISTIC_TTL_MS - 1,
    });

    const result = await refreshAppleMusicPlaylists();

    expect(result).toBe(cached);
  });

  test("refreshStaleAppleMusicPlaylistTracks no-ops when no playlist tracks have been cached yet", async () => {
    // No cached playlist tracks → nothing to revalidate, no network call.
    await refreshStaleAppleMusicPlaylistTracks();
    const state = useIpodStore.getState();
    expect(state.appleMusicPlaylistTracksLoadedAt).toEqual({});
    expect(state.appleMusicPlaylistTracksLoading).toEqual({});
  });

  test("refreshStaleAppleMusicPlaylistTracks no-ops silently when MusicKit isn't available even with stale entries", async () => {
    useIpodStore.setState({
      appleMusicPlaylistTracks: { "p:1": [] },
      appleMusicPlaylistTracksLoadedAt: { "p:1": 1 },
    });

    // Should not throw; should not flip any loading flags either.
    await refreshStaleAppleMusicPlaylistTracks();
    expect(useIpodStore.getState().appleMusicPlaylistTracksLoading).toEqual({});
  });
});

describe("Apple Music Recently Added & Favorites store + refresh", () => {
  beforeEach(() => {
    useIpodStore.setState({
      appleMusicRecentlyAddedTracks: [],
      appleMusicRecentlyAddedLoadedAt: null,
      appleMusicRecentlyAddedLoading: false,
      appleMusicFavoriteTracks: [],
      appleMusicFavoriteTracksLoadedAt: null,
      appleMusicFavoritesLoading: false,
    });
  });

  test("setAppleMusicRecentlyAddedTracks stamps loadedAt + clears the loading flag", () => {
    useIpodStore.setState({ appleMusicRecentlyAddedLoading: true });
    const before = Date.now();
    useIpodStore
      .getState()
      .setAppleMusicRecentlyAddedTracks([
        {
          id: "am:1",
          url: "applemusic:1",
          title: "One",
          source: "appleMusic",
        },
      ]);
    const after = Date.now();
    const state = useIpodStore.getState();
    expect(state.appleMusicRecentlyAddedTracks).toHaveLength(1);
    expect(state.appleMusicRecentlyAddedLoading).toBe(false);
    expect(state.appleMusicRecentlyAddedLoadedAt!).toBeGreaterThanOrEqual(before);
    expect(state.appleMusicRecentlyAddedLoadedAt!).toBeLessThanOrEqual(after);
  });

  test("setAppleMusicFavoriteTracks honours an explicit loadedAt (used by hydration)", () => {
    useIpodStore.getState().setAppleMusicFavoriteTracks(
      [
        {
          id: "am:1",
          url: "applemusic:1",
          title: "Liked",
          source: "appleMusic",
        },
      ],
      99999
    );
    expect(useIpodStore.getState().appleMusicFavoriteTracksLoadedAt).toBe(
      99999
    );
  });

  test("prependAppleMusicFavoriteTrack adds the track to the front and de-dupes by id", () => {
    useIpodStore.setState({
      appleMusicFavoriteTracks: [
        {
          id: "am:1",
          url: "applemusic:1",
          title: "One",
          source: "appleMusic",
        },
        {
          id: "am:2",
          url: "applemusic:2",
          title: "Two",
          source: "appleMusic",
        },
      ],
      appleMusicFavoriteTracksLoadedAt: 12345,
    });

    useIpodStore.getState().prependAppleMusicFavoriteTrack({
      id: "am:2",
      url: "applemusic:2",
      title: "Two (renamed)",
      source: "appleMusic",
    });

    const state = useIpodStore.getState();
    expect(state.appleMusicFavoriteTracks.map((t) => t.id)).toEqual([
      "am:2",
      "am:1",
    ]);
    expect(state.appleMusicFavoriteTracks[0].title).toBe("Two (renamed)");
    // Don't bump loadedAt so the next opportunistic refresh still
    // revalidates against the server.
    expect(state.appleMusicFavoriteTracksLoadedAt).toBe(12345);
  });

  test("refreshAppleMusicRecentlyAdded short-circuits when the cache is fresh enough", async () => {
    const cached = [
      {
        id: "am:1",
        url: "applemusic:1",
        title: "Cached",
        source: "appleMusic" as const,
      },
    ];
    useIpodStore.setState({
      appleMusicRecentlyAddedTracks: cached,
      appleMusicRecentlyAddedLoadedAt: Date.now() - 1000,
    });

    const result = await refreshAppleMusicRecentlyAdded();

    expect(result).toBe(cached);
    expect(useIpodStore.getState().appleMusicRecentlyAddedLoading).toBe(false);
  });

  test("refreshAppleMusicRecentlyAdded silently returns cached when MusicKit isn't available + doesn't toggle loading on a stale-but-cached refresh", async () => {
    const cached = [
      {
        id: "am:1",
        url: "applemusic:1",
        title: "Stale",
        source: "appleMusic" as const,
      },
    ];
    useIpodStore.setState({
      appleMusicRecentlyAddedTracks: cached,
      appleMusicRecentlyAddedLoadedAt:
        Date.now() - APPLE_MUSIC_PLAYLIST_TRACKS_OPPORTUNISTIC_TTL_MS - 1,
    });

    const result = await refreshAppleMusicRecentlyAdded();

    expect(result).toBe(cached);
    // Loading flag stays false because there's already cached content
    // for the menu — background refresh must never flash "Loading…".
    expect(useIpodStore.getState().appleMusicRecentlyAddedLoading).toBe(false);
  });

  test("refreshAppleMusicFavorites short-circuits when the cache is fresh enough", async () => {
    const cached = [
      {
        id: "am:liked",
        url: "applemusic:liked",
        title: "Liked",
        source: "appleMusic" as const,
      },
    ];
    useIpodStore.setState({
      appleMusicFavoriteTracks: cached,
      appleMusicFavoriteTracksLoadedAt:
        Date.now() - APPLE_MUSIC_PLAYLISTS_OPPORTUNISTIC_TTL_MS,
    });

    const result = await refreshAppleMusicFavorites();

    expect(result).toBe(cached);
    expect(useIpodStore.getState().appleMusicFavoritesLoading).toBe(false);
  });
});

describe("AppleMusicPlayerBridge playback-state fan-out", () => {
  // Regression: when MusicKit JS plays a multi-item queue (catalog
  // station / playlist), `playbackState=5 (ended)` fires once for
  // every track that finishes — including intermediate items that
  // MusicKit then auto-advances past. Forwarding that to our parent
  // calls `nextTrack` → `skipToNextItem`, which skips the song
  // MusicKit just moved to. The displayed Now Playing entry then
  // mismatches the song actually playing in the queue. The bridge
  // must suppress the parent fan-out for shells and rely on the
  // terminal `completed` (10) signal instead.
  const baseTrack: Track = {
    id: "am:1616228595",
    url: "applemusic:1616228595",
    title: "Bohemian Rhapsody",
    source: "appleMusic",
    appleMusicPlayParams: { catalogId: "1616228595" },
  };
  const stationShell: Track = {
    id: "am:station:ra.u-personal",
    url: "applemusic:station:ra.u-personal",
    title: "My Station",
    source: "appleMusic",
    appleMusicPlayParams: { stationId: "ra.u-personal", kind: "radioStation" },
  };
  const playlistShell: Track = {
    id: "am:playlist:pl.pm-mix",
    url: "applemusic:playlist:pl.pm-mix",
    title: "Favorites Mix",
    source: "appleMusic",
    appleMusicPlayParams: { playlistId: "pl.pm-mix", kind: "playlist" },
  };

  test("non-shell single-song queue: ended (5) fans out so we pick the next song", () => {
    expect(shouldFireEndedForPlaybackState(5, baseTrack)).toBe(true);
  });

  test("station shell: ended (5) is suppressed so MusicKit's auto-advance wins", () => {
    expect(shouldFireEndedForPlaybackState(5, stationShell)).toBe(false);
  });

  test("playlist shell: ended (5) is suppressed so MusicKit's auto-advance wins", () => {
    expect(shouldFireEndedForPlaybackState(5, playlistShell)).toBe(false);
  });

  test("completed (10) always fans out — terminal signal for both shells and single-song queues", () => {
    expect(shouldFireEndedForPlaybackState(10, baseTrack)).toBe(true);
    expect(shouldFireEndedForPlaybackState(10, stationShell)).toBe(true);
    expect(shouldFireEndedForPlaybackState(10, playlistShell)).toBe(true);
    expect(shouldFireEndedForPlaybackState(10, null)).toBe(true);
  });

  test("non-terminal states never fan out as ended", () => {
    for (const state of [0, 1, 2, 3, 4, 6, 8, 9, undefined]) {
      expect(shouldFireEndedForPlaybackState(state, baseTrack)).toBe(false);
      expect(shouldFireEndedForPlaybackState(state, stationShell)).toBe(false);
      expect(shouldFireEndedForPlaybackState(state, playlistShell)).toBe(false);
    }
  });

  test("null currentTrack with ended (5) fans out (no shell context to suppress)", () => {
    // Defensive: if the current track is unknown, prefer the legacy
    // behavior of advancing on `ended` over getting stuck silent.
    expect(shouldFireEndedForPlaybackState(5, null)).toBe(true);
  });
});

describe("AppleMusicPlayerBridge ended fan-out dedup window", () => {
  // Regression: even for non-shell single-song queues
  // (`setQueue({ song: id })`), MusicKit JS fires both `ended` (5) and
  // `completed` (10) when the song finishes. Forwarding both to the
  // parent runs `nextTrack` twice — the second pick races MusicKit's
  // first `setQueue`, so the audio the user actually hears can mismatch
  // the song the iPod displays. The dedup window collapses the pair so
  // `onEnded` fans out at most once per song-ending event.
  test("first fire after never having fired is allowed", () => {
    expect(isWithinEndedFanoutDedupWindow(1_000, 0)).toBe(false);
    expect(isWithinEndedFanoutDedupWindow(1_000, -1)).toBe(false);
  });

  test("second fire inside the window is suppressed (state 5 → state 10 collapse)", () => {
    // state 5 fires at t=1000, state 10 follows at t=1100 — same song.
    expect(isWithinEndedFanoutDedupWindow(1_100, 1_000)).toBe(true);
    // Even with seconds between events the dedup still bites — covers
    // builds where state 10 lags behind state 5 noticeably.
    expect(isWithinEndedFanoutDedupWindow(1_000 + 2_999, 1_000)).toBe(true);
  });

  test("subsequent song's own ended event (well outside window) fans out", () => {
    // Real songs are minimum tens of seconds, so the next track's end
    // is always well past the dedup window.
    expect(
      isWithinEndedFanoutDedupWindow(
        1_000 + ENDED_FANOUT_DEDUP_WINDOW_MS,
        1_000
      )
    ).toBe(false);
    expect(
      isWithinEndedFanoutDedupWindow(
        1_000 + ENDED_FANOUT_DEDUP_WINDOW_MS + 1,
        1_000
      )
    ).toBe(false);
    expect(isWithinEndedFanoutDedupWindow(120_000, 1_000)).toBe(false);
  });

  test("dedup window is comfortably wider than typical state 5 → state 10 latency, narrower than song length", () => {
    // Sanity: window is in the realm of "a beat between events" (>= 1s)
    // but never long enough to swallow a real song's end (< 30s).
    expect(ENDED_FANOUT_DEDUP_WINDOW_MS).toBeGreaterThanOrEqual(1_000);
    expect(ENDED_FANOUT_DEDUP_WINDOW_MS).toBeLessThan(30_000);
  });

  test("custom window override works (used by tests + future hardening)", () => {
    expect(isWithinEndedFanoutDedupWindow(100, 50, 100)).toBe(true);
    expect(isWithinEndedFanoutDedupWindow(150, 50, 100)).toBe(false);
  });
});

describe("AppleMusicPlayerBridge queue-load playback-state fan-out", () => {
  // Regression: `setQueue({ startPlaying: false })` makes MusicKit emit
  // paused/loading/stopped before we call `play()`. Forwarding those
  // states to the iPod store flips `isPlaying` off so the post-queue
  // `play()` is skipped — the user taps a song and hears nothing.
  test("suppresses non-terminal states while a queue load is in flight", () => {
    for (const state of [0, 1, 2, 3, 4, 6, 8, 9, undefined]) {
      expect(
        shouldSuppressPlaybackStateFanoutWhileQueueLoading(true, state)
      ).toBe(true);
    }
  });

  test("does not suppress when no queue load is active", () => {
    expect(
      shouldSuppressPlaybackStateFanoutWhileQueueLoading(false, 3)
    ).toBe(false);
  });

  test("still allows ended/completed through during queue load", () => {
    expect(
      shouldSuppressPlaybackStateFanoutWhileQueueLoading(true, 5)
    ).toBe(false);
    expect(
      shouldSuppressPlaybackStateFanoutWhileQueueLoading(true, 10)
    ).toBe(false);
  });
});

describe("AppleMusicPlayerBridge MusicKit event item id extraction", () => {
  // Primary dedup key for `onEnded` fan-out: state=5 and state=10 reference
  // the SAME just-ended item, so identical ids let us suppress the second
  // fan-out regardless of timing — important when state 10 lags more than
  // the timestamp window. Falls back through the multiple shapes MusicKit
  // JS uses across versions so the dedup keeps working when one shape is
  // empty.
  test("returns null for nullish items (avoids spurious dedup)", () => {
    expect(getMusicKitEventItemId(null)).toBeNull();
    expect(getMusicKitEventItemId(undefined)).toBeNull();
    expect(getMusicKitEventItemId({})).toBeNull();
    // Empty string ids are falsy → fallback chain → null.
    expect(getMusicKitEventItemId({ id: "" })).toBeNull();
  });

  test("prefers the top-level item.id when present", () => {
    expect(
      getMusicKitEventItemId({
        id: "1616228595",
        attributes: {
          playParams: { id: "other", catalogId: "another" },
        },
      })
    ).toBe("1616228595");
  });

  test("falls back to attributes.playParams.id when item.id is absent", () => {
    expect(
      getMusicKitEventItemId({
        attributes: { playParams: { id: "i.uUZAkT3" } },
      })
    ).toBe("i.uUZAkT3");
  });

  test("falls back to attributes.playParams.catalogId for library songs", () => {
    expect(
      getMusicKitEventItemId({
        attributes: { playParams: { catalogId: "1616228595" } },
      })
    ).toBe("1616228595");
  });
});
