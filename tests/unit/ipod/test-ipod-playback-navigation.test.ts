import "fake-indexeddb/auto";
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

const {
  shouldRestartTrackOnPrevious,
  PREVIOUS_RESTART_THRESHOLD_SECONDS,
} = await import("../../../src/shared/media/previousTrackBehavior");
const { useIpodStore } = await import("../../../src/stores/useIpodStore");
type Track = import("../../../src/shared/media/library").Track;

const amTrack = (n: number): Track => ({
  id: `am:${n}`,
  url: `applemusic:${n}`,
  title: `Song ${n}`,
  source: "appleMusic",
});

describe("shouldRestartTrackOnPrevious", () => {
  test("restarts only after the elapsed time passes the threshold", () => {
    expect(
      shouldRestartTrackOnPrevious(PREVIOUS_RESTART_THRESHOLD_SECONDS + 0.5, true)
    ).toBe(true);
    // At or below the threshold (e.g. just-started or a quick double-press)
    // we skip to the previous track instead of restarting.
    expect(
      shouldRestartTrackOnPrevious(PREVIOUS_RESTART_THRESHOLD_SECONDS, true)
    ).toBe(false);
    expect(shouldRestartTrackOnPrevious(0, true)).toBe(false);
  });

  test("never restarts when there is no current track", () => {
    expect(shouldRestartTrackOnPrevious(120, false)).toBe(false);
  });

  test("guards against non-finite elapsed values", () => {
    expect(shouldRestartTrackOnPrevious(Number.NaN, true)).toBe(false);
    expect(shouldRestartTrackOnPrevious(Number.POSITIVE_INFINITY, true)).toBe(
      false
    );
  });

  test("honours a custom threshold", () => {
    expect(shouldRestartTrackOnPrevious(4, true, 5)).toBe(false);
    expect(shouldRestartTrackOnPrevious(6, true, 5)).toBe(true);
  });
});

describe("Apple Music shuffle navigation", () => {
  beforeEach(() => {
    useIpodStore.setState({
      librarySource: "appleMusic",
      appleMusicTracks: [],
      appleMusicPlaybackQueue: null,
      appleMusicCurrentSongId: null,
      appleMusicPlaybackHistory: [],
      appleMusicKitNowPlaying: null,
      isPlaying: false,
      isShuffled: false,
      loopAll: true,
      loopCurrent: false,
    });
  });

  test("next records the current track in shuffle history and avoids repeating it", () => {
    useIpodStore.getState().setAppleMusicTracks([amTrack(1), amTrack(2)]);
    useIpodStore.setState({
      isShuffled: true,
      appleMusicCurrentSongId: "am:1",
      appleMusicPlaybackHistory: [],
    });

    useIpodStore.getState().appleMusicNextTrack();

    const state = useIpodStore.getState();
    // Only one other track exists, so the pick is deterministic and must not
    // repeat the song we were just on.
    expect(state.appleMusicCurrentSongId).toBe("am:2");
    expect(state.appleMusicPlaybackHistory).toEqual(["am:1"]);
  });

  test("previous retraces the actual shuffle history instead of jumping at random", () => {
    useIpodStore
      .getState()
      .setAppleMusicTracks([amTrack(1), amTrack(2), amTrack(3)]);
    // Simulate having shuffled am:1 → am:2 → am:3.
    useIpodStore.setState({
      isShuffled: true,
      appleMusicCurrentSongId: "am:3",
      appleMusicPlaybackHistory: ["am:1", "am:2"],
    });

    useIpodStore.getState().appleMusicPreviousTrack();
    expect(useIpodStore.getState().appleMusicCurrentSongId).toBe("am:2");
    expect(useIpodStore.getState().appleMusicPlaybackHistory).toEqual(["am:1"]);

    useIpodStore.getState().appleMusicPreviousTrack();
    expect(useIpodStore.getState().appleMusicCurrentSongId).toBe("am:1");
    expect(useIpodStore.getState().appleMusicPlaybackHistory).toEqual([]);
  });

  test("previous with no shuffle history falls back to an avoid-current random pick", () => {
    useIpodStore.getState().setAppleMusicTracks([amTrack(1), amTrack(2)]);
    useIpodStore.setState({
      isShuffled: true,
      appleMusicCurrentSongId: "am:1",
      appleMusicPlaybackHistory: [],
    });

    useIpodStore.getState().appleMusicPreviousTrack();

    // With a two-track library the only valid pick is the other song.
    expect(useIpodStore.getState().appleMusicCurrentSongId).toBe("am:2");
  });

  test("toggling shuffle on clears the Apple Music shuffle history", () => {
    useIpodStore.setState({
      isShuffled: false,
      appleMusicPlaybackHistory: ["am:1", "am:2"],
    });
    useIpodStore.getState().toggleShuffle();
    const state = useIpodStore.getState();
    expect(state.isShuffled).toBe(true);
    expect(state.appleMusicPlaybackHistory).toEqual([]);
  });

  test("manually selecting an Apple Music track resets the shuffle history", () => {
    useIpodStore.getState().setAppleMusicTracks([amTrack(1), amTrack(2)]);
    useIpodStore.setState({
      isShuffled: true,
      appleMusicCurrentSongId: "am:1",
      appleMusicPlaybackHistory: ["am:2"],
    });

    useIpodStore.getState().setAppleMusicCurrentSongId("am:2");

    expect(useIpodStore.getState().appleMusicPlaybackHistory).toEqual([]);
  });
});
