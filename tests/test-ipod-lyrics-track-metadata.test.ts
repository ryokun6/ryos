import { describe, expect, test } from "bun:test";

// Browser globals must be installed before importing the iPod store —
// the store re-imports `useChatsStore`, which reads `localStorage` at
// module-load time. Mirrors the harness in
// `tests/test-ipod-apple-music.test.ts`.
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
  resolveLyricsTrackMetadata,
  resolveLyricsOverrideTargetId,
} = await import("../src/apps/ipod/utils/lyricsTrackMetadata");
type Track = import("../src/stores/useIpodStore").Track;

const youtubeTrack: Track = {
  id: "dQw4w9WgXcQ",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  title: "Never Gonna Give You Up",
  artist: "Rick Astley",
  source: "youtube",
};

const appleMusicLibraryTrack: Track = {
  id: "am:1616228595",
  url: "applemusic:1616228595",
  title: "Bohemian Rhapsody",
  artist: "Queen",
  source: "appleMusic",
  appleMusicPlayParams: {
    catalogId: "1616228595",
  },
};

const stationShellTrack: Track = {
  id: "am:station:ra.todays-hits",
  url: "applemusic:station:ra.todays-hits",
  title: "Today's Hits",
  artist: "Apple Music",
  source: "appleMusic",
  appleMusicPlayParams: {
    stationId: "ra.todays-hits",
    kind: "radioStation",
  },
};

const playlistShellTrack: Track = {
  id: "am:playlist:pl.favorites-mix",
  url: "applemusic:playlist:pl.favorites-mix",
  title: "Favorites Mix",
  artist: "Apple Music for Me",
  source: "appleMusic",
  appleMusicPlayParams: {
    playlistId: "pl.favorites-mix",
    kind: "playlist",
  },
};

describe("resolveLyricsTrackMetadata", () => {
  test("uses currentTrack for YouTube library songs (live MusicKit ignored)", () => {
    const meta = resolveLyricsTrackMetadata(youtubeTrack, {
      id: "irrelevant",
      title: "Irrelevant",
      artist: "Whoever",
    });
    expect(meta).toEqual({
      title: "Never Gonna Give You Up",
      artist: "Rick Astley",
      songId: "dQw4w9WgXcQ",
    });
  });

  test("uses currentTrack for Apple Music library songs", () => {
    const meta = resolveLyricsTrackMetadata(appleMusicLibraryTrack, null);
    expect(meta).toEqual({
      title: "Bohemian Rhapsody",
      artist: "Queen",
      songId: "am:1616228595",
    });
  });

  test("uses LIVE MusicKit metadata for radio stations (not the station name)", () => {
    const meta = resolveLyricsTrackMetadata(stationShellTrack, {
      id: "1616228595",
      title: "Bohemian Rhapsody",
      artist: "Queen",
    });
    expect(meta.title).toBe("Bohemian Rhapsody");
    expect(meta.artist).toBe("Queen");
    expect(meta.songId).toBe("am:1616228595");
    expect(meta.title).not.toBe("Today's Hits");
    expect(meta.artist).not.toBe("Apple Music");
  });

  test("uses LIVE MusicKit metadata for playlists (not the playlist name)", () => {
    const meta = resolveLyricsTrackMetadata(playlistShellTrack, {
      id: "1616228595",
      title: "Bohemian Rhapsody",
      artist: "Queen",
    });
    expect(meta.title).toBe("Bohemian Rhapsody");
    expect(meta.artist).toBe("Queen");
    expect(meta.songId).toBe("am:1616228595");
    expect(meta.title).not.toBe("Favorites Mix");
    expect(meta.artist).not.toBe("Apple Music for Me");
  });

  test("returns empty strings for a station with no live MusicKit metadata yet", () => {
    // The bug this guards against: pre-fix `lyricsTitle` / `lyricsArtist`
    // fell back to the shell title ("Today's Hits") whenever
    // `appleMusicKitNowPlaying` was null, so the auto-fetch would
    // search lyrics for the station name. Empty values short-circuit
    // `useLyrics` instead.
    const meta = resolveLyricsTrackMetadata(stationShellTrack, null);
    expect(meta).toEqual({ title: "", artist: "", songId: "" });
  });

  test("returns empty strings for a playlist with no live MusicKit metadata yet", () => {
    const meta = resolveLyricsTrackMetadata(playlistShellTrack, undefined);
    expect(meta).toEqual({ title: "", artist: "", songId: "" });
  });

  test("trims whitespace-only live titles to empty (not station fallback)", () => {
    const meta = resolveLyricsTrackMetadata(stationShellTrack, {
      id: "1616228595",
      title: "   ",
      artist: "  ",
    });
    expect(meta.title).toBe("");
    expect(meta.artist).toBe("");
    expect(meta.title).not.toBe("Today's Hits");
  });

  test("returns the live song id even when the live title isn't trimmed yet", () => {
    const meta = resolveLyricsTrackMetadata(stationShellTrack, {
      id: "1616228595",
      title: "Bohemian Rhapsody",
    });
    expect(meta.songId).toBe("am:1616228595");
  });

  test("returns empty for a null currentTrack", () => {
    expect(resolveLyricsTrackMetadata(null, null)).toEqual({
      title: "",
      artist: "",
      songId: "",
    });
  });
});

describe("resolveLyricsOverrideTargetId", () => {
  test("returns the YouTube track id directly", () => {
    expect(resolveLyricsOverrideTargetId(youtubeTrack, null)).toBe(
      "dQw4w9WgXcQ"
    );
  });

  test("returns the Apple Music library track id directly", () => {
    expect(resolveLyricsOverrideTargetId(appleMusicLibraryTrack, null)).toBe(
      "am:1616228595"
    );
  });

  test("returns the live MusicKit song id for a station — NOT the station shell id", () => {
    const id = resolveLyricsOverrideTargetId(stationShellTrack, {
      id: "1616228595",
      title: "Bohemian Rhapsody",
    });
    expect(id).toBe("am:1616228595");
    expect(id).not.toBe("am:station:ra.todays-hits");
  });

  test("returns the live MusicKit song id for a playlist — NOT the playlist shell id", () => {
    const id = resolveLyricsOverrideTargetId(playlistShellTrack, {
      id: "1616228595",
      title: "Bohemian Rhapsody",
    });
    expect(id).toBe("am:1616228595");
    expect(id).not.toBe("am:playlist:pl.favorites-mix");
  });

  test("returns null when a station has no live MusicKit metadata yet (no shell fallback)", () => {
    // The bug this guards against: pre-fix `setTrackLyricsSource` was
    // called with the station shell id, so every song streamed
    // through that station inherited the user's pick. Returning null
    // makes the search-select handler no-op until MusicKit reports
    // the actual song.
    expect(resolveLyricsOverrideTargetId(stationShellTrack, null)).toBeNull();
  });

  test("returns null when a playlist has no live MusicKit metadata yet", () => {
    expect(
      resolveLyricsOverrideTargetId(playlistShellTrack, undefined)
    ).toBeNull();
  });

  test("returns null for a null currentTrack", () => {
    expect(resolveLyricsOverrideTargetId(null, null)).toBeNull();
  });
});
