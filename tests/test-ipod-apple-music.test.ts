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

const { libraryResourceToTrack } = await import(
  "../src/apps/ipod/hooks/useAppleMusicLibrary"
);
const { useIpodStore } = await import("../src/stores/useIpodStore");
const {
  isValidAppleMusicSongId,
  isValidYouTubeVideoId,
  isValidSongId,
} = await import("../api/songs/_utils");

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

  test("returns null when the resource has no playParams", () => {
    const track = libraryResourceToTrack({
      id: "i.broken",
      type: "library-songs",
      attributes: { name: "No params" },
    });
    expect(track).toBeNull();
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
    });
    useIpodStore.getState().setLibrarySource("appleMusic");
    const state = useIpodStore.getState();
    expect(state.librarySource).toBe("appleMusic");
    expect(state.isPlaying).toBe(false);
    expect(state.elapsedTime).toBe(0);
    expect(state.totalTime).toBe(0);
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
