import { describe, expect, test } from "bun:test";
import {
  SHUFFLE_INTERVAL_MS,
  pickDeterministicCandidate,
  resolveWallpaperSourceForSelection,
  shuffleBucket,
} from "../src/utils/dynamicWallpaper";

const CANDIDATES = [
  "/wallpapers/photos/nature/a.jpg",
  "/wallpapers/photos/nature/b.jpg",
  "/wallpapers/photos/nature/c.jpg",
  "/wallpapers/photos/nature/d.jpg",
  "/wallpapers/photos/nature/e.jpg",
];

describe("deterministic shuffle wallpaper", () => {
  test("shuffleBucket is wall-clock aligned to the epoch and advances by interval", () => {
    const now = 1_700_000_123_456;
    expect(shuffleBucket(now)).toBe(Math.floor(now / SHUFFLE_INTERVAL_MS));
    // A point one interval later is exactly one bucket later.
    expect(shuffleBucket(now + SHUFFLE_INTERVAL_MS)).toBe(
      shuffleBucket(now) + 1
    );
    // Two instants inside the same interval share a bucket.
    const base = shuffleBucket(now) * SHUFFLE_INTERVAL_MS;
    expect(shuffleBucket(base)).toBe(shuffleBucket(base + SHUFFLE_INTERVAL_MS - 1));
  });

  test("same user + descriptor + bucket resolves the same wallpaper (cross-device match)", () => {
    const seed = "alice|shuffle://photos/nature";
    const bucketStart = 1_700_000 * SHUFFLE_INTERVAL_MS;
    const now = bucketStart + Math.floor(SHUFFLE_INTERVAL_MS / 2);
    // Simulate two devices resolving independently well inside one bucket.
    const deviceA = pickDeterministicCandidate(CANDIDATES, seed, now);
    const deviceB = pickDeterministicCandidate(CANDIDATES, seed, now + 1234);
    expect(deviceA).toBe(deviceB);
    expect(CANDIDATES).toContain(deviceA);
  });

  test("rotates when the wall-clock bucket advances", () => {
    const seed = "alice|shuffle://photos/nature";
    const bucketStart = shuffleBucket() * SHUFFLE_INTERVAL_MS;
    const picks = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const pick = pickDeterministicCandidate(
        CANDIDATES,
        seed,
        bucketStart + i * SHUFFLE_INTERVAL_MS
      );
      if (pick) picks.add(pick);
    }
    // Over several buckets we should see more than one wallpaper.
    expect(picks.size).toBeGreaterThan(1);
  });

  test("never repeats the immediately previous bucket's pick", () => {
    const seed = "bob|shuffle://tiles";
    const bucketStart = 1_000_000 * SHUFFLE_INTERVAL_MS;
    let prev: string | null = null;
    for (let i = 0; i < 50; i++) {
      const pick = pickDeterministicCandidate(
        CANDIDATES,
        seed,
        bucketStart + i * SHUFFLE_INTERVAL_MS
      );
      expect(pick).not.toBe(prev);
      prev = pick;
    }
  });

  test("different users diverge for the same bucket", () => {
    const now = Date.now();
    const alice = pickDeterministicCandidate(
      CANDIDATES,
      "alice|shuffle://photos/nature",
      now
    );
    // Find a bucket where two users differ — with 5 candidates this is common.
    let diverged = false;
    for (let i = 0; i < 20; i++) {
      const t = now + i * SHUFFLE_INTERVAL_MS;
      const a = pickDeterministicCandidate(
        CANDIDATES,
        "alice|shuffle://photos/nature",
        t
      );
      const b = pickDeterministicCandidate(
        CANDIDATES,
        "carol|shuffle://photos/nature",
        t
      );
      if (a !== b) {
        diverged = true;
        break;
      }
    }
    expect(alice).not.toBeNull();
    expect(diverged).toBe(true);
  });

  test("edge cases: empty and single-candidate lists", () => {
    expect(pickDeterministicCandidate([], "seed")).toBeNull();
    expect(pickDeterministicCandidate(["only.jpg"], "seed")).toBe("only.jpg");
  });

  test("keeps a concrete source while a shuffle selection resolves", () => {
    const current = "/wallpapers/photos/nature/a.jpg";
    expect(
      resolveWallpaperSourceForSelection(
        "shuffle://photos/nature",
        current
      )
    ).toBe(current);
  });

  test("does not reuse unresolved descriptors for shuffle", () => {
    expect(
      resolveWallpaperSourceForSelection(
        "shuffle://photos/nature",
        "dynamic://gradient/day-night"
      )
    ).toBe("");
    expect(
      resolveWallpaperSourceForSelection(
        "shuffle://photos/nature",
        "indexeddb://custom"
      )
    ).toBe("");
  });

  test("replaces stale sources for non-shuffle dynamic wallpapers", () => {
    expect(
      resolveWallpaperSourceForSelection(
        "dynamic://gradient/day-night",
        "/wallpapers/videos/previous.mp4"
      )
    ).toBe("dynamic://gradient/day-night");
  });
});
