/**
 * Native shell media/haptic bridge (`window.ryosDesktop` playHaptic /
 * setAudioActive / setNowPlaying / updatePlayback): null-safe helpers, the
 * multi-source audio-session aggregator, and the MediaCore store feed.
 */
import "fake-indexeddb/auto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { ensureTestLocalStorage } from "../../setup";

const g = globalThis as Record<string, unknown> & typeof globalThis;
let registeredDomForSuite = false;
if (typeof document === "undefined") {
  GlobalRegistrator.register();
  registeredDomForSuite = true;
}
ensureTestLocalStorage();

const {
  HAPTIC_MIN_INTERVAL_MS,
  playHaptic,
  resetNativeHapticRateLimitForTests,
  sanitizeNowPlayingInfo,
  setNativeAudioActive,
  setNativeNowPlaying,
  updateNativePlayback,
} = await import("../../../src/utils/nativeShellBridge");
const {
  AUDIO_RELEASE_GRACE_MS,
  flushNativeMediaSessionRelease,
  handleNativeRemoteCommand,
  installNativeRemoteCommandHandler,
  resetNativeMediaSession,
  updateNativeMediaSource,
} = await import(
  "../../../src/shared/media/nativeMediaSession"
);
const { useIpodStore } = await import("../../../src/stores/useIpodStore");
const { useVideoStore } = await import("../../../src/stores/useVideoStore");
const { useKaraokeStore } = await import("../../../src/stores/useKaraokeStore");
const { useTvStore } = await import("../../../src/stores/useTvStore");
const { useAppStore } = await import("../../../src/stores/useAppStore");
const { initMediaCoreRuntime } = await import(
  "../../../src/shared/media/mediaCoreRuntime"
);
const { publishTvNowPlaying } = await import(
  "../../../src/shared/media/tvNowPlaying"
);

type Call = [method: string, ...args: unknown[]];

let calls: Call[] = [];

function installBridge(methods?: string[]) {
  const names = methods ?? [
    "playHaptic",
    "setAudioActive",
    "setNowPlaying",
    "updatePlayback",
  ];
  const bridge: Record<string, unknown> = { platform: "ios" };
  for (const name of names) {
    bridge[name] = (...args: unknown[]) => {
      calls.push([name, ...args]);
    };
  }
  (g.window as unknown as Record<string, unknown>).ryosDesktop = bridge;
}

function removeBridge() {
  delete (g.window as unknown as Record<string, unknown>).ryosDesktop;
}

function callsOf(method: string) {
  return calls.filter((call) => call[0] === method).map((call) => call.slice(1));
}

/**
 * Other suites in the same Bun process leave transports requesting playback;
 * MediaCore would seed them as active (sending `setAudioActive(true)` before
 * the test starts recording), so every transport and the session start idle.
 */
function resetMediaTransports() {
  useIpodStore.setState({ isPlaying: false, playbackRequested: false });
  useKaraokeStore.setState({ isPlaying: false, playbackRequested: false });
  useVideoStore.setState({ isPlaying: false, playbackRequested: false });
  useTvStore.setState({ isPlaying: false, playbackRequested: false });
  useAppStore.setState({ instances: {} });
  publishTvNowPlaying(null);
  resetNativeMediaSession();
}

afterAll(async () => {
  // The stores above import useFilesStore, whose first hydration fetches the
  // default library (with a delayed retry) in the background.
  const { settleFilesRehydrationTasks } = await import(
    "../../../src/stores/useFilesStore"
  );
  await settleFilesRehydrationTasks();
  removeBridge();
  if (registeredDomForSuite && GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
  ensureTestLocalStorage();
});

describe("nativeShellBridge helpers", () => {
  beforeEach(() => {
    calls = [];
    resetNativeHapticRateLimitForTests();
    installBridge();
  });
  afterEach(() => removeBridge());

  test("no-op safely without a bridge or without the optional methods", () => {
    removeBridge();
    expect(playHaptic("light")).toBe(false);
    expect(setNativeAudioActive(true)).toBe(false);
    expect(setNativeNowPlaying({ title: "x" })).toBe(false);
    expect(updateNativePlayback(1, 1)).toBe(false);

    installBridge([]);
    expect(playHaptic("light")).toBe(false);
    expect(setNativeAudioActive(true)).toBe(false);
    expect(calls).toEqual([]);
  });

  test("swallows bridge exceptions", () => {
    (g.window as unknown as Record<string, unknown>).ryosDesktop = {
      setAudioActive: () => {
        throw new Error("boom");
      },
    };
    expect(setNativeAudioActive(true)).toBe(false);
  });

  test("rate-limits haptics to one per interval", () => {
    expect(playHaptic("soft", 1000)).toBe(true);
    expect(playHaptic("light", 1000 + HAPTIC_MIN_INTERVAL_MS - 1)).toBe(false);
    expect(playHaptic("medium", 1000 + HAPTIC_MIN_INTERVAL_MS)).toBe(true);
    expect(callsOf("playHaptic")).toEqual([["soft"], ["medium"]]);
  });

  test("sanitizes now-playing metadata", () => {
    expect(sanitizeNowPlayingInfo({ title: "  " })).toBeNull();
    expect(
      sanitizeNowPlayingInfo({
        title: " Song ",
        artist: "",
        album: "Album",
        durationSeconds: Number.NaN,
        artworkUrl: "http://insecure.example/a.jpg",
      })
    ).toEqual({ title: "Song", album: "Album" });

    setNativeNowPlaying(null);
    updateNativePlayback(-3, 0.5);
    expect(calls).toEqual([
      ["setNowPlaying", null],
      ["updatePlayback", 0, 1],
    ]);
  });
});

describe("native media session aggregator", () => {
  beforeEach(() => {
    installBridge();
    resetNativeMediaSession();
    calls = [];
  });
  afterEach(() => {
    resetNativeMediaSession();
    removeBridge();
  });

  test("audio stays active until every source stops", () => {
    updateNativeMediaSource("a", {
      playing: true,
      nowPlaying: { title: "A" },
      positionSeconds: 0,
    });
    updateNativeMediaSource("b", {
      playing: true,
      nowPlaying: { title: "B" },
      positionSeconds: 0,
    });
    updateNativeMediaSource("a", {
      playing: false,
      nowPlaying: null,
      positionSeconds: 0,
    });
    expect(callsOf("setAudioActive")).toEqual([[true]]);

    updateNativeMediaSource("b", null);
    expect(callsOf("setAudioActive")).toEqual([[true]]);
    flushNativeMediaSessionRelease();
    expect(callsOf("setAudioActive")).toEqual([[true], [false]]);
    expect(callsOf("setNowPlaying").at(-1)).toEqual([null]);
  });

  test("the most recently started source owns now-playing", () => {
    updateNativeMediaSource("a", {
      playing: true,
      nowPlaying: { title: "A" },
      positionSeconds: 10,
    });
    updateNativeMediaSource("b", {
      playing: true,
      nowPlaying: { title: "B", artist: "Artist" },
      positionSeconds: 0,
    });
    expect(callsOf("setNowPlaying")).toEqual([
      [{ title: "A" }],
      [{ title: "B", artist: "Artist" }],
    ]);
    expect(callsOf("updatePlayback")).toEqual([
      [10, 1],
      [0, 1],
    ]);

    updateNativeMediaSource("b", null);
    expect(callsOf("setNowPlaying").at(-1)).toEqual([{ title: "A" }]);
  });

  test("only re-sends playback on pause, seek, or metadata change", () => {
    const state = {
      playing: true,
      nowPlaying: { title: "A" },
      positionSeconds: 5,
    };
    updateNativeMediaSource("a", state);
    updateNativeMediaSource("a", { ...state, positionSeconds: 5.05 });
    updateNativeMediaSource("a", { ...state, positionSeconds: 5.1 });
    expect(callsOf("updatePlayback")).toEqual([[5, 1]]);
    expect(callsOf("setNowPlaying")).toHaveLength(1);

    updateNativeMediaSource("a", { ...state, positionSeconds: 60 });
    updateNativeMediaSource("a", {
      ...state,
      playing: false,
      positionSeconds: 60,
    });
    expect(callsOf("updatePlayback")).toEqual([
      [5, 1],
      [60, 1],
      [60, 0],
    ]);
    // Paused but still showing metadata keeps the lock-screen entry.
    flushNativeMediaSessionRelease();
    expect(callsOf("setAudioActive")).toEqual([[true], [false]]);
    expect(callsOf("setNowPlaying")).toHaveLength(1);
  });
});

describe("MediaCore → native session", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    installBridge();
    resetMediaTransports();
    useIpodStore.setState({
      tracks: [
        {
          id: "dQw4w9WgXcQ",
          url: "https://youtu.be/dQw4w9WgXcQ",
          title: "Never Gonna Give You Up",
          artist: "Rick Astley",
          album: "Whenever You Need Somebody",
        },
      ],
      librarySource: "youtube",
      currentSongId: "dQw4w9WgXcQ",
      isPlaying: false,
      playbackRequested: false,
      elapsedTime: 0,
      totalTime: 213,
    });
    cleanup = initMediaCoreRuntime();
    calls = [];
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    publishTvNowPlaying(null);
    resetNativeMediaSession();
    removeBridge();
  });

  test("iPod playback activates audio and publishes the track", () => {
    useIpodStore.getState().setIsPlaying(true);
    useIpodStore.getState().confirmPlayback();

    expect(callsOf("setAudioActive")).toEqual([[true]]);
    expect(callsOf("setNowPlaying")).toEqual([
      [
        {
          title: "Never Gonna Give You Up",
          artist: "Rick Astley",
          album: "Whenever You Need Somebody",
          durationSeconds: 213,
          artworkUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        },
      ],
    ]);
    expect(callsOf("updatePlayback")).toEqual([
      [0, 0],
      [0, 1],
    ]);

    useIpodStore.setState({ elapsedTime: 0.2 });
    expect(callsOf("updatePlayback")).toHaveLength(2);

    // Paused with the window closed → session ends and metadata clears.
    useIpodStore.getState().setIsPlaying(false);
    flushNativeMediaSessionRelease();
    expect(callsOf("setAudioActive").at(-1)).toEqual([false]);
    expect(callsOf("setNowPlaying").at(-1)).toEqual([null]);
  });

  test("a paused player keeps its lock-screen entry while its window is open", () => {
    useAppStore.setState({
      instances: {
        "1": {
          instanceId: "1",
          appId: "ipod",
          isOpen: true,
          createdAt: 0,
        },
      } as never,
    });
    useIpodStore.getState().setIsPlaying(true);
    useIpodStore.getState().confirmPlayback();
    useIpodStore.getState().setIsPlaying(false);
    flushNativeMediaSessionRelease();

    expect(callsOf("setAudioActive")).toEqual([[true], [false]]);
    expect(callsOf("setNowPlaying")).toHaveLength(1);
    expect(callsOf("updatePlayback").at(-1)).toEqual([0, 0]);

    useAppStore.setState({ instances: {} });
    flushNativeMediaSessionRelease();
    expect(callsOf("setNowPlaying").at(-1)).toEqual([null]);
  });

  test("TV uses the metadata its window publishes", () => {
    publishTvNowPlaying({ title: "Video", album: "RyoTV" });
    useTvStore.getState().setIsPlaying(true);
    useTvStore.getState().confirmPlayback();

    expect(callsOf("setAudioActive")).toEqual([[true]]);
    expect(callsOf("setNowPlaying").at(-1)).toEqual([
      { title: "Video", album: "RyoTV" },
    ]);
  });
});

describe("lock-screen remote commands", () => {
  let controlCalls: string[] = [];

  function source(id: string, playing: boolean, controllable = true) {
    updateNativeMediaSource(id, {
      playing,
      nowPlaying: { title: id },
      positionSeconds: 0,
      controls: controllable
        ? {
            play: () => controlCalls.push(`${id}:play`),
            pause: () => controlCalls.push(`${id}:pause`),
          }
        : undefined,
    });
  }

  beforeEach(() => {
    resetNativeMediaSession();
    controlCalls = [];
  });
  afterEach(() => resetNativeMediaSession());

  test("toggle pauses a playing owner and plays a paused one", () => {
    source("a", true);
    expect(handleNativeRemoteCommand("toggle-play-pause")).toBe(true);
    expect(controlCalls).toEqual(["a:pause"]);

    source("a", false);
    expect(handleNativeRemoteCommand("toggle-play-pause")).toBe(true);
    expect(controlCalls).toEqual(["a:pause", "a:play"]);
  });

  test("play and pause target the most recently started source", () => {
    source("a", true);
    source("b", true);
    handleNativeRemoteCommand("pause");
    source("a", false);
    source("b", false);
    handleNativeRemoteCommand("play");
    expect(controlCalls).toEqual(["b:pause", "b:play"]);
  });

  test("pause falls back to other playing sources when the owner can't be paused", () => {
    source("a", true);
    source("b", true, false);
    expect(handleNativeRemoteCommand("pause")).toBe(true);
    expect(controlCalls).toEqual(["a:pause"]);
  });

  test("is a safe no-op without sources, controls, or a known command", () => {
    expect(handleNativeRemoteCommand("toggle-play-pause")).toBe(false);
    expect(handleNativeRemoteCommand("pause")).toBe(false);
    expect(handleNativeRemoteCommand("skip")).toBe(false);
    expect(handleNativeRemoteCommand(undefined)).toBe(false);

    source("a", false, false);
    expect(handleNativeRemoteCommand("play")).toBe(false);

    updateNativeMediaSource("throws", {
      playing: true,
      nowPlaying: { title: "x" },
      positionSeconds: 0,
      controls: {
        pause: () => {
          throw new Error("boom");
        },
      },
    });
    expect(handleNativeRemoteCommand("pause")).toBe(false);
  });

  test("install assigns over the shell no-op and restores it idempotently", () => {
    const shellNoop = () => {};
    window.__ryosDesktopRemoteCommand = shellNoop;

    const uninstall = installNativeRemoteCommandHandler();
    const uninstallAgain = installNativeRemoteCommandHandler();
    const handler = window.__ryosDesktopRemoteCommand;
    expect(handler).not.toBe(shellNoop);

    source("a", true);
    handler?.("toggle-play-pause");
    expect(controlCalls).toEqual(["a:pause"]);

    uninstall();
    uninstallAgain();
    expect(window.__ryosDesktopRemoteCommand).not.toBe(handler);
    expect(() => window.__ryosDesktopRemoteCommand?.("pause")).not.toThrow();
    expect(controlCalls).toEqual(["a:pause"]);
    delete window.__ryosDesktopRemoteCommand;
  });

  test("MediaCore routes lock-screen commands to the iPod store transport", () => {
    installBridge();
    resetMediaTransports();
    useIpodStore.setState({
      tracks: [{ id: "s1", url: "https://youtu.be/s1", title: "Song" }],
      librarySource: "youtube",
      currentSongId: "s1",
      isPlaying: false,
      playbackRequested: false,
    });
    useAppStore.setState({
      instances: {
        "1": { instanceId: "1", appId: "ipod", isOpen: true, createdAt: 0 },
      } as never,
    });
    const cleanup = initMediaCoreRuntime();
    try {
      useIpodStore.getState().setIsPlaying(true);
      useIpodStore.getState().confirmPlayback();

      window.__ryosDesktopRemoteCommand?.("toggle-play-pause");
      expect(useIpodStore.getState().isPlaying).toBe(false);
      expect(useIpodStore.getState().playbackRequested).toBe(false);

      window.__ryosDesktopRemoteCommand?.("play");
      expect(useIpodStore.getState().playbackRequested).toBe(true);
    } finally {
      cleanup();
      useAppStore.setState({ instances: {} });
      removeBridge();
    }
    expect(() => window.__ryosDesktopRemoteCommand?.("pause")).not.toThrow();
  });
});

describe("Karaoke start regression (iOS session released mid-start)", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    installBridge();
    resetMediaTransports();
    const tracks = [
      { id: "k1", url: "https://youtu.be/k1", title: "Song One" },
      { id: "k2", url: "https://youtu.be/k2", title: "Song Two" },
    ];
    useIpodStore.setState({
      tracks,
      librarySource: "youtube",
      currentSongId: "k1",
      isPlaying: false,
      playbackRequested: false,
    });
    useKaraokeStore.setState({
      currentSongId: "k1",
      isPlaying: false,
      playbackRequested: false,
    });
    useAppStore.setState({
      instances: {
        "1": { instanceId: "1", appId: "karaoke", isOpen: true, createdAt: 0 },
      } as never,
    });
    cleanup = initMediaCoreRuntime();
    calls = [];
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    useAppStore.setState({ instances: {} });
    resetNativeMediaSession();
    removeBridge();
  });

  test("starting Karaoke while the iPod plays never deactivates audio", () => {
    useIpodStore.getState().setIsPlaying(true);
    useIpodStore.getState().confirmPlayback();

    // MediaCore stops the iPod before Karaoke's request reaches the session.
    useKaraokeStore.getState().setIsPlaying(true);
    expect(useIpodStore.getState().isPlaying).toBe(false);
    useKaraokeStore.getState().confirmPlayback();

    flushNativeMediaSessionRelease();
    expect(callsOf("setAudioActive")).toEqual([[true]]);
    expect(callsOf("setNowPlaying")).not.toContainEqual([null]);
    expect(callsOf("setNowPlaying").at(-1)).toEqual([{ title: "Song One" }]);
  });

  test("re-requests and track switches keep the session while unconfirmed", () => {
    useKaraokeStore.getState().setIsPlaying(true);
    useKaraokeStore.getState().confirmPlayback();

    // Track switch: confirmation resets until the player emits onPlay.
    useKaraokeStore.getState().setCurrentSongId("k2");
    expect(useKaraokeStore.getState().isPlaying).toBe(false);
    // Exiting fullscreen re-requests playback the same way.
    useKaraokeStore.getState().setIsPlaying(true);
    flushNativeMediaSessionRelease();

    expect(callsOf("setAudioActive")).toEqual([[true]]);
    expect(callsOf("setNowPlaying").at(-1)).toEqual([{ title: "Song Two" }]);
  });

  test("a pending request can still be paused from the lock screen", () => {
    useKaraokeStore.getState().setIsPlaying(true);
    expect(handleNativeRemoteCommand("toggle-play-pause")).toBe(true);
    expect(useKaraokeStore.getState().playbackRequested).toBe(false);
  });

  test("a real stop still releases the session after the grace period", async () => {
    useKaraokeStore.getState().setIsPlaying(true);
    useKaraokeStore.getState().confirmPlayback();
    useAppStore.setState({ instances: {} });
    useKaraokeStore.getState().setIsPlaying(false);

    expect(callsOf("setAudioActive")).toEqual([[true]]);
    await new Promise((resolve) =>
      setTimeout(resolve, AUDIO_RELEASE_GRACE_MS + 50)
    );
    expect(callsOf("setAudioActive")).toEqual([[true], [false]]);
    expect(callsOf("setNowPlaying").at(-1)).toEqual([null]);
  });
});
