import { afterAll, beforeEach, describe, expect, test } from "bun:test";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const originalLocalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage"
);
if (!originalLocalStorage) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new MemoryStorage(),
    writable: true,
  });
}

afterAll(() => {
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  } else {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});

const { useVideoStore } = await import("../../../src/stores/useVideoStore");
const {
  applyPlayStateAfterViewResume,
  resolvePlayStateAfterViewResume,
} = await import("../../../src/shared/media/confirmedPlayback");

describe("confirmed media playback state", () => {
  beforeEach(() => {
    useVideoStore.setState({
      isPlaying: false,
      playbackRequested: false,
    });
  });

  test("does not store playing=true for an unconfirmed or failed play attempt", () => {
    useVideoStore.getState().setIsPlaying(true);

    expect(useVideoStore.getState().playbackRequested).toBe(true);
    expect(useVideoStore.getState().isPlaying).toBe(false);

    // This is the rollback used by timeout and player-error callbacks.
    useVideoStore.getState().setIsPlaying(false);

    expect(useVideoStore.getState().playbackRequested).toBe(false);
    expect(useVideoStore.getState().isPlaying).toBe(false);
  });

  test("stores playing=true only after the onPlay confirmation", () => {
    useVideoStore.getState().setIsPlaying(true);
    expect(useVideoStore.getState().isPlaying).toBe(false);

    useVideoStore.getState().confirmPlayback();

    expect(useVideoStore.getState().playbackRequested).toBe(true);
    expect(useVideoStore.getState().isPlaying).toBe(true);
  });

  test("ignores a stale onPlay confirmation after the request was cancelled", () => {
    useVideoStore.getState().setIsPlaying(true);
    useVideoStore.getState().setIsPlaying(false);

    useVideoStore.getState().confirmPlayback();

    expect(useVideoStore.getState().playbackRequested).toBe(false);
    expect(useVideoStore.getState().isPlaying).toBe(false);
  });
});

describe("resolvePlayStateAfterViewResume", () => {
  test("confirms playing when the live YouTube player is playing", () => {
    expect(
      resolvePlayStateAfterViewResume({
        playerState: 1,
        playbackRequested: false,
      })
    ).toEqual({ isPlaying: true, playbackRequested: true });
  });

  test("confirms playing while the player is buffering", () => {
    expect(
      resolvePlayStateAfterViewResume({
        playerState: 3,
        playbackRequested: false,
      })
    ).toEqual({ isPlaying: true, playbackRequested: true });
  });

  test("keeps a pending play request confirmed when onPlay will not re-fire", () => {
    // Cover Flow selecting the current track calls setIsPlaying(true) →
    // requestPlayback() (isPlaying=false, playbackRequested=true) while
    // the engine is already running, so YouTube skips a new onPlay.
    expect(
      resolvePlayStateAfterViewResume({
        playerState: undefined,
        playbackRequested: true,
      })
    ).toEqual({ isPlaying: true, playbackRequested: true });
  });

  test("stays paused when audio is not requested and the player is paused", () => {
    expect(
      resolvePlayStateAfterViewResume({
        playerState: 2,
        playbackRequested: false,
      })
    ).toEqual({ isPlaying: false, playbackRequested: false });
  });

  test("stays paused when the player state is unknown and nothing is requested", () => {
    expect(
      resolvePlayStateAfterViewResume({
        playerState: -1,
        playbackRequested: false,
      })
    ).toEqual({ isPlaying: false, playbackRequested: false });
  });
});

describe("applyPlayStateAfterViewResume", () => {
  test("confirms a pending request without issuing another play request", () => {
    const setIsPlaying = () => {
      throw new Error("should not re-request play");
    };
    let confirmed = false;

    const next = applyPlayStateAfterViewResume(
      { isPlaying: false, playbackRequested: true },
      1,
      {
        setIsPlaying,
        confirmPlayback: () => {
          confirmed = true;
        },
      }
    );

    expect(next).toEqual({ isPlaying: true, playbackRequested: true });
    expect(confirmed).toBe(true);
  });

  test("re-requests play when the live player is running but the store was stopped", () => {
    const calls: Array<boolean | "confirm"> = [];

    applyPlayStateAfterViewResume(
      { isPlaying: false, playbackRequested: false },
      1,
      {
        setIsPlaying: (playing) => {
          calls.push(playing);
        },
        confirmPlayback: () => {
          calls.push("confirm");
        },
      }
    );

    expect(calls).toEqual([true, "confirm"]);
  });

  test("is a no-op when UI already matches a paused player", () => {
    const setIsPlaying = () => {
      throw new Error("should not change play state");
    };

    const next = applyPlayStateAfterViewResume(
      { isPlaying: false, playbackRequested: false },
      2,
      { setIsPlaying, confirmPlayback: () => {} }
    );

    expect(next).toEqual({ isPlaying: false, playbackRequested: false });
  });
});
