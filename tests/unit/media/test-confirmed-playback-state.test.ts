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
