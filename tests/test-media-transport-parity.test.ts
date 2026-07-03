/**
 * MediaCore Phase 0 guardrails — transport parity.
 *
 * Pins the current playback-transport semantics of the four media stores
 * (iPod, Karaoke, Videos, TV) before they are migrated onto a shared
 * transport slice factory. Phase 1 must keep every assertion here green
 * without modifying this file.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, test } from "bun:test";

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

const navigatorState = { onLine: true };
Object.defineProperty(browserGlobals, "navigator", {
  value: {
    ...(browserGlobals.navigator ?? {}),
    get onLine() {
      return navigatorState.onLine;
    },
    userAgent: "test",
  },
  configurable: true,
});

const { useIpodStore } = await import("../src/stores/useIpodStore");
const { useKaraokeStore } = await import("../src/stores/useKaraokeStore");
const { useVideoStore } = await import("../src/stores/useVideoStore");
const { useTvStore } = await import("../src/stores/useTvStore");
type Track = import("../src/shared/media/library").Track;
type Video = import("../src/stores/useVideoStore").Video;

const ytTrack = (n: number): Track => ({
  id: `yt${n}`,
  url: `https://youtu.be/yt${n}`,
  title: `Song ${n}`,
});

const video = (n: number): Video => ({
  id: `vid${n}`,
  url: `https://youtu.be/vid${n}`,
  title: `Video ${n}`,
});

/**
 * Uniform view over each store's transport so the same lifecycle assertions
 * run against all of them.
 */
interface TransportDriver {
  name: string;
  /** Reset the store and seed a 3-item library where applicable. */
  seed: () => void;
  currentId: () => string | null;
  /** Select a different item (id from the seeded library). */
  selectOther: () => void;
  togglePlay: () => void;
  setIsPlaying: (value: boolean) => void;
  confirmPlayback: () => void;
  flags: () => { isPlaying: boolean; playbackRequested: boolean };
  /** Whether setIsPlaying(true) is blocked while offline. */
  guardsOffline: boolean;
}

const seedIpodTracks = () => {
  useIpodStore.setState({
    tracks: [ytTrack(1), ytTrack(2), ytTrack(3)],
    librarySource: "youtube",
    currentSongId: "yt1",
    isPlaying: false,
    playbackRequested: false,
    loopAll: true,
    loopCurrent: false,
    isShuffled: false,
    playbackHistory: [],
    historyPosition: -1,
    elapsedTime: 0,
    totalTime: 0,
  });
};

const drivers: TransportDriver[] = [
  {
    name: "iPod",
    seed: seedIpodTracks,
    currentId: () => useIpodStore.getState().currentSongId,
    selectOther: () => useIpodStore.getState().setCurrentSongId("yt2"),
    togglePlay: () => useIpodStore.getState().togglePlay(),
    setIsPlaying: (value) => useIpodStore.getState().setIsPlaying(value),
    confirmPlayback: () => useIpodStore.getState().confirmPlayback(),
    flags: () => {
      const s = useIpodStore.getState();
      return { isPlaying: s.isPlaying, playbackRequested: s.playbackRequested };
    },
    guardsOffline: true,
  },
  {
    name: "Karaoke",
    seed: () => {
      seedIpodTracks();
      useKaraokeStore.setState({
        currentSongId: "yt1",
        isPlaying: false,
        playbackRequested: false,
        loopAll: true,
        loopCurrent: false,
        isShuffled: false,
        playbackHistory: [],
        elapsedTime: 0,
        totalTime: 0,
      });
    },
    currentId: () => useKaraokeStore.getState().currentSongId,
    selectOther: () => useKaraokeStore.getState().setCurrentSongId("yt2"),
    togglePlay: () => useKaraokeStore.getState().togglePlay(),
    setIsPlaying: (value) => useKaraokeStore.getState().setIsPlaying(value),
    confirmPlayback: () => useKaraokeStore.getState().confirmPlayback(),
    flags: () => {
      const s = useKaraokeStore.getState();
      return { isPlaying: s.isPlaying, playbackRequested: s.playbackRequested };
    },
    guardsOffline: true,
  },
  {
    name: "Videos",
    seed: () => {
      useVideoStore.setState({
        videos: [video(1), video(2), video(3)],
        currentVideoId: "vid1",
        isPlaying: false,
        playbackRequested: false,
        loopAll: true,
        loopCurrent: false,
        isShuffled: false,
        playedSeconds: 0,
        elapsedTime: 0,
      });
    },
    currentId: () => useVideoStore.getState().currentVideoId,
    selectOther: () => useVideoStore.getState().setCurrentVideoId("vid2"),
    togglePlay: () => useVideoStore.getState().togglePlay(),
    setIsPlaying: (value) => useVideoStore.getState().setIsPlaying(value),
    confirmPlayback: () => useVideoStore.getState().confirmPlayback(),
    flags: () => {
      const s = useVideoStore.getState();
      return { isPlaying: s.isPlaying, playbackRequested: s.playbackRequested };
    },
    guardsOffline: false,
  },
  {
    name: "TV",
    seed: () => {
      useTvStore.setState({
        currentChannelId: "ryo",
        lastVideoIndexByChannel: {},
        isPlaying: false,
        playbackRequested: false,
        playedSeconds: 0,
      });
    },
    currentId: () => useTvStore.getState().currentChannelId,
    selectOther: () => useTvStore.getState().setCurrentChannelId("mtv"),
    togglePlay: () => useTvStore.getState().togglePlay(),
    setIsPlaying: (value) => useTvStore.getState().setIsPlaying(value),
    confirmPlayback: () => useTvStore.getState().confirmPlayback(),
    flags: () => {
      const s = useTvStore.getState();
      return { isPlaying: s.isPlaying, playbackRequested: s.playbackRequested };
    },
    guardsOffline: false,
  },
];

for (const driver of drivers) {
  describe(`${driver.name} transport parity`, () => {
    beforeEach(() => {
      navigatorState.onLine = true;
      driver.seed();
    });

    test("request → confirm → stop lifecycle", () => {
      driver.setIsPlaying(true);
      expect(driver.flags()).toEqual({
        isPlaying: false,
        playbackRequested: true,
      });

      driver.confirmPlayback();
      expect(driver.flags()).toEqual({
        isPlaying: true,
        playbackRequested: true,
      });

      driver.setIsPlaying(false);
      expect(driver.flags()).toEqual({
        isPlaying: false,
        playbackRequested: false,
      });
    });

    test("stale confirmation after cancel is ignored", () => {
      driver.setIsPlaying(true);
      driver.setIsPlaying(false);
      driver.confirmPlayback();
      expect(driver.flags()).toEqual({
        isPlaying: false,
        playbackRequested: false,
      });
    });

    test("togglePlay requests from stopped and stops from requested", () => {
      driver.togglePlay();
      expect(driver.flags()).toEqual({
        isPlaying: false,
        playbackRequested: true,
      });

      driver.togglePlay();
      expect(driver.flags()).toEqual({
        isPlaying: false,
        playbackRequested: false,
      });
    });

    test("selecting a different item resets confirmation but keeps the request", () => {
      driver.setIsPlaying(true);
      driver.confirmPlayback();

      driver.selectOther();
      expect(driver.flags()).toEqual({
        isPlaying: false,
        playbackRequested: true,
      });
    });

    if (driver.guardsOffline) {
      test("setIsPlaying(true) is a no-op while offline", () => {
        navigatorState.onLine = false;
        driver.setIsPlaying(true);
        expect(driver.flags()).toEqual({
          isPlaying: false,
          playbackRequested: false,
        });
      });
    }
  });
}

describe("iPod YouTube next/previous navigation", () => {
  beforeEach(() => {
    navigatorState.onLine = true;
    seedIpodTracks();
  });

  test("sequential next advances and requests playback", () => {
    useIpodStore.getState().nextTrack();
    const s = useIpodStore.getState();
    expect(s.currentSongId).toBe("yt2");
    expect(s.playbackRequested).toBe(true);
    expect(s.isPlaying).toBe(false);
    expect(s.playbackHistory).toEqual(["yt1"]);
  });

  test("next at the end with loopAll on wraps to the first track", () => {
    useIpodStore.setState({ currentSongId: "yt3", loopAll: true });
    useIpodStore.getState().nextTrack();
    expect(useIpodStore.getState().currentSongId).toBe("yt1");
    expect(useIpodStore.getState().playbackRequested).toBe(true);
  });

  test("next at the end with loopAll off stops on the last track", () => {
    useIpodStore.setState({ currentSongId: "yt3", loopAll: false });
    useIpodStore.getState().nextTrack();
    const s = useIpodStore.getState();
    expect(s.currentSongId).toBe("yt3");
    expect(s.isPlaying).toBe(false);
    expect(s.playbackRequested).toBe(false);
  });

  test("loopCurrent keeps next on the same track", () => {
    useIpodStore.setState({ loopCurrent: true });
    useIpodStore.getState().nextTrack();
    expect(useIpodStore.getState().currentSongId).toBe("yt1");
    expect(useIpodStore.getState().playbackRequested).toBe(true);
  });

  test("sequential previous from the first track wraps to the last", () => {
    useIpodStore.getState().previousTrack();
    expect(useIpodStore.getState().currentSongId).toBe("yt3");
  });

  test("shuffle previous retraces history and pops it", () => {
    useIpodStore.setState({
      isShuffled: true,
      currentSongId: "yt3",
      playbackHistory: ["yt1", "yt2"],
    });
    useIpodStore.getState().previousTrack();
    expect(useIpodStore.getState().currentSongId).toBe("yt2");
    expect(useIpodStore.getState().playbackHistory).toEqual(["yt1"]);
  });

  test("track change resets the playback clock", () => {
    useIpodStore.setState({ elapsedTime: 42, totalTime: 200 });
    useIpodStore.getState().nextTrack();
    expect(useIpodStore.getState().elapsedTime).toBe(0);
    expect(useIpodStore.getState().totalTime).toBe(0);
  });
});

describe("Karaoke next/previous navigation (iPod library)", () => {
  beforeEach(() => {
    navigatorState.onLine = true;
    seedIpodTracks();
    useKaraokeStore.setState({
      currentSongId: "yt1",
      isPlaying: false,
      playbackRequested: false,
      loopAll: true,
      loopCurrent: false,
      isShuffled: false,
      playbackHistory: [],
    });
  });

  test("reads the current track from the iPod library", () => {
    const track = useKaraokeStore.getState().getCurrentTrack();
    expect(track?.id).toBe("yt1");
    expect(useKaraokeStore.getState().getCurrentIndex()).toBe(0);
  });

  test("sequential next advances and requests playback", () => {
    useKaraokeStore.getState().nextTrack();
    const s = useKaraokeStore.getState();
    expect(s.currentSongId).toBe("yt2");
    expect(s.playbackRequested).toBe(true);
    expect(s.isPlaying).toBe(false);
  });

  test("next at the end with loopAll off stops on the last track", () => {
    useKaraokeStore.setState({ currentSongId: "yt3", loopAll: false });
    useKaraokeStore.getState().nextTrack();
    const s = useKaraokeStore.getState();
    expect(s.currentSongId).toBe("yt3");
    expect(s.playbackRequested).toBe(false);
  });

  test("shuffle next records history; previous retraces it", () => {
    useKaraokeStore.setState({ isShuffled: true, currentSongId: "yt1" });
    useKaraokeStore.getState().nextTrack();
    expect(useKaraokeStore.getState().playbackHistory).toEqual(["yt1"]);

    const middle = useKaraokeStore.getState().currentSongId;
    expect(middle).not.toBe("yt1");

    useKaraokeStore.getState().previousTrack();
    expect(useKaraokeStore.getState().currentSongId).toBe("yt1");
    expect(useKaraokeStore.getState().playbackHistory).toEqual([]);
  });

  test("empty iPod library stops playback and clears the selection", () => {
    useIpodStore.setState({ tracks: [] });
    useKaraokeStore.getState().nextTrack();
    const s = useKaraokeStore.getState();
    expect(s.currentSongId).toBeNull();
    expect(s.playbackRequested).toBe(false);
  });
});

describe("TV channel-scoped transport", () => {
  beforeEach(() => {
    useTvStore.setState({
      currentChannelId: "ryo",
      lastVideoIndexByChannel: {},
      isPlaying: false,
      playbackRequested: false,
      playedSeconds: 0,
    });
  });

  test("changing the video index on the current channel resets confirmation", () => {
    useTvStore.getState().setIsPlaying(true);
    useTvStore.getState().confirmPlayback();

    useTvStore.getState().setVideoIndex("ryo", 3);
    const s = useTvStore.getState();
    expect(s.lastVideoIndexByChannel.ryo).toBe(3);
    expect(s.isPlaying).toBe(false);
    expect(s.playbackRequested).toBe(true);
  });

  test("changing the video index on another channel keeps playback confirmed", () => {
    useTvStore.getState().setIsPlaying(true);
    useTvStore.getState().confirmPlayback();

    useTvStore.getState().setVideoIndex("mtv", 2);
    const s = useTvStore.getState();
    expect(s.isPlaying).toBe(true);
    expect(s.playbackRequested).toBe(true);
  });
});
