import { describe, expect, test } from "bun:test";

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

describe("broadcastListenState", () => {
  test("builds listen sync payload from active player time", async () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: new MemoryStorage(),
    });
    const { broadcastListenState } = await import(
      "../src/shared/media/playbackListenSync"
    );
    const calls: unknown[] = [];
    const result = await broadcastListenState({
      getActivePlayer: () =>
        ({
          getCurrentTime: () => 12.5,
        }) as never,
      syncSession: async (payload) => {
        calls.push(payload);
        return { ok: true };
      },
      currentTrackId: "track-1",
      currentTrackMeta: { title: "Track One" },
      isPlaying: true,
    });

    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      {
        currentTrackId: "track-1",
        currentTrackMeta: { title: "Track One" },
        isPlaying: true,
        positionMs: 12500,
      },
    ]);
  });
});
