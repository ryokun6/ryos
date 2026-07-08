/**
 * MediaCore Phase 0 guardrails — Listen Together playback-sync contract.
 *
 * Pins how `usePlaybackListenSync` maps a transport target onto
 * `useListenSync`, and the DJ broadcast payload shape. Phase 7's
 * generalization to a shared transport interface must keep this mapping.
 */
import { afterAll, describe, expect, mock, test } from "bun:test";

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

if (!(globalThis as { localStorage?: Storage }).localStorage) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new MemoryStorage(),
    writable: true,
  });
}

const listenSyncCalls: Array<Record<string, unknown>> = [];
const actualListenSync = await import("../../../src/hooks/useListenSync");
mock.module("@/hooks/useListenSync", () => ({
  useListenSync: (args: Record<string, unknown>) => {
    listenSyncCalls.push(args);
  },
}));
afterAll(() => {
  mock.module("@/hooks/useListenSync", () => actualListenSync);
});

const { usePlaybackListenSync, broadcastListenState } = await import(
  "../../../src/shared/media/playbackListenSync"
);

const makeTarget = (listenRemoteOnly: boolean) => {
  const setVirtualElapsedSeconds = () => {};
  return {
    currentTrackId: "track-1",
    currentTrackMeta: { title: "Track One" },
    isPlaying: true,
    setIsPlaying: () => {},
    setCurrentTrackId: () => {},
    getActivePlayer: () => null,
    addTrackFromId: () => {},
    listenRemoteOnly,
    setVirtualElapsedSeconds,
  };
};

describe("usePlaybackListenSync mapping", () => {
  test("DJ/solo mode applies listener playback and drops the virtual clock", () => {
    listenSyncCalls.length = 0;
    usePlaybackListenSync(makeTarget(false));

    expect(listenSyncCalls).toHaveLength(1);
    const call = listenSyncCalls[0];
    expect(call.currentTrackId).toBe("track-1");
    expect(call.applyListenerPlayback).toBe(true);
    expect(call.setVirtualElapsedSeconds).toBeUndefined();
  });

  test("remote-only listeners do not drive the local player", () => {
    listenSyncCalls.length = 0;
    const target = makeTarget(true);
    usePlaybackListenSync(target);

    expect(listenSyncCalls).toHaveLength(1);
    const call = listenSyncCalls[0];
    expect(call.applyListenerPlayback).toBe(false);
    expect(call.setVirtualElapsedSeconds).toBe(
      target.setVirtualElapsedSeconds
    );
  });
});

describe("broadcastListenState payload", () => {
  test("converts the active player clock to positionMs", async () => {
    const payloads: unknown[] = [];
    const result = await broadcastListenState({
      getActivePlayer: () => ({ getCurrentTime: () => 61.25 }) as never,
      syncSession: async (payload) => {
        payloads.push(payload);
        return { ok: true };
      },
      currentTrackId: "track-9",
      currentTrackMeta: { title: "Nine" },
      isPlaying: false,
    });

    expect(result.ok).toBe(true);
    expect(payloads).toEqual([
      {
        currentTrackId: "track-9",
        currentTrackMeta: { title: "Nine" },
        isPlaying: false,
        positionMs: 61250,
      },
    ]);
  });

  test("clamps a missing or negative player clock to zero", async () => {
    const payloads: Array<{ positionMs: number }> = [];
    await broadcastListenState({
      getActivePlayer: () => null,
      syncSession: async (payload) => {
        payloads.push(payload as { positionMs: number });
        return { ok: true };
      },
      currentTrackId: null,
      currentTrackMeta: null,
      isPlaying: false,
    });
    await broadcastListenState({
      getActivePlayer: () => ({ getCurrentTime: () => -4 }) as never,
      syncSession: async (payload) => {
        payloads.push(payload as { positionMs: number });
        return { ok: true };
      },
      currentTrackId: null,
      currentTrackMeta: null,
      isPlaying: false,
    });

    expect(payloads.map((p) => p.positionMs)).toEqual([0, 0]);
  });
});
