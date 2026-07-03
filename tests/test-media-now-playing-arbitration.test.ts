/**
 * MediaCore Phase 2 — now-playing bus + single-active playback arbitration.
 *
 * Exercises `mediaCoreRuntime` against the real media stores: requesting
 * playback in one app must stop every other app's in-flight or confirmed
 * playback, and the bus must always know which app is driving.
 */
import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, test } from "bun:test";

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
  Object.defineProperty(browserGlobals, "localStorage", {
    configurable: true,
    value: new MemoryStorage(),
    writable: true,
  });
}
Object.defineProperty(browserGlobals, "navigator", {
  value: {
    ...(browserGlobals.navigator ?? {}),
    onLine: true,
    userAgent: "test",
  },
  configurable: true,
});

const { useIpodStore } = await import("../src/stores/useIpodStore");
const { useKaraokeStore } = await import("../src/stores/useKaraokeStore");
const { useVideoStore } = await import("../src/stores/useVideoStore");
const { useTvStore } = await import("../src/stores/useTvStore");
const { useNowPlayingStore } = await import(
  "../src/shared/media/nowPlayingStore"
);
const { initMediaCoreRuntime } = await import(
  "../src/shared/media/mediaCoreRuntime"
);

const resetStores = () => {
  useIpodStore.setState({
    tracks: [
      { id: "song1", url: "https://youtu.be/song1", title: "Song 1" },
      { id: "song2", url: "https://youtu.be/song2", title: "Song 2" },
    ],
    librarySource: "youtube",
    currentSongId: "song1",
    isPlaying: false,
    playbackRequested: false,
  });
  useKaraokeStore.setState({
    currentSongId: "song1",
    isPlaying: false,
    playbackRequested: false,
  });
  useVideoStore.setState({
    currentVideoId: "vid1",
    videos: [
      { id: "vid1", url: "https://youtu.be/vid1", title: "Video 1" },
    ],
    isPlaying: false,
    playbackRequested: false,
  });
  useTvStore.setState({
    currentChannelId: "ryo",
    isPlaying: false,
    playbackRequested: false,
  });
};

resetStores();
const cleanup = initMediaCoreRuntime();
afterAll(() => cleanup());

describe("single-active playback arbitration", () => {
  beforeEach(() => {
    resetStores();
  });

  test("starting the iPod stops an in-flight Videos request", () => {
    useVideoStore.getState().setIsPlaying(true);
    expect(useVideoStore.getState().playbackRequested).toBe(true);

    useIpodStore.getState().setIsPlaying(true);

    expect(useIpodStore.getState().playbackRequested).toBe(true);
    expect(useVideoStore.getState().playbackRequested).toBe(false);
    expect(useVideoStore.getState().isPlaying).toBe(false);
  });

  test("starting Videos stops confirmed iPod playback", () => {
    useIpodStore.getState().setIsPlaying(true);
    useIpodStore.getState().confirmPlayback();
    expect(useIpodStore.getState().isPlaying).toBe(true);

    useVideoStore.getState().togglePlay();

    expect(useVideoStore.getState().playbackRequested).toBe(true);
    expect(useIpodStore.getState().isPlaying).toBe(false);
    expect(useIpodStore.getState().playbackRequested).toBe(false);
  });

  test("starting TV stops Karaoke; the winner's request survives arbitration", () => {
    useKaraokeStore.getState().setIsPlaying(true);
    useKaraokeStore.getState().confirmPlayback();

    useTvStore.getState().setIsPlaying(true);
    useTvStore.getState().confirmPlayback();

    expect(useTvStore.getState().isPlaying).toBe(true);
    expect(useKaraokeStore.getState().isPlaying).toBe(false);
    expect(useKaraokeStore.getState().playbackRequested).toBe(false);
  });

  test("pausing does not disturb the other transports", () => {
    useIpodStore.getState().setIsPlaying(true);
    useIpodStore.getState().confirmPlayback();

    useVideoStore.getState().setIsPlaying(false);

    expect(useIpodStore.getState().isPlaying).toBe(true);
  });

  test("track navigation inside one app keeps its own playback request", () => {
    useIpodStore.getState().setIsPlaying(true);
    useIpodStore.getState().confirmPlayback();

    useIpodStore.getState().nextTrack();

    expect(useIpodStore.getState().currentSongId).toBe("song2");
    expect(useIpodStore.getState().playbackRequested).toBe(true);
  });
});

describe("now-playing bus", () => {
  beforeEach(() => {
    resetStores();
  });

  test("mirrors the playing app and its item id", () => {
    useVideoStore.getState().setIsPlaying(true);
    useVideoStore.getState().confirmPlayback();

    const bus = useNowPlayingStore.getState();
    expect(bus.activeAppId).toBe("videos");
    expect(bus.entries.videos).toEqual({
      itemId: "vid1",
      isPlaying: true,
      playbackRequested: true,
      hasSelection: true,
    });
  });

  test("music surfaces win the priority tie-break over video surfaces", () => {
    // Arbitration means only one can *request*, but a paused iPod with a
    // selection still outranks idle video surfaces in the fallback tier.
    useIpodStore.getState().setIsPlaying(true);
    useIpodStore.getState().confirmPlayback();
    useIpodStore.getState().setIsPlaying(false);

    expect(useNowPlayingStore.getState().activeAppId).toBe("ipod");
  });

  test("idle Videos/TV do not surface their default selection", () => {
    useIpodStore.setState({ currentSongId: null });
    useKaraokeStore.setState({ currentSongId: null });

    const bus = useNowPlayingStore.getState();
    expect(bus.entries.videos.hasSelection).toBe(false);
    expect(bus.entries.tv.hasSelection).toBe(false);
    expect(bus.activeAppId).toBeNull();
  });

  test("Apple Music mode reports the Apple Music song id", () => {
    useIpodStore.setState({
      librarySource: "appleMusic",
      appleMusicCurrentSongId: "am:9",
    });
    expect(useNowPlayingStore.getState().entries.ipod.itemId).toBe("am:9");
  });
});
