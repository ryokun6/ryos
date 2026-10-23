import { describe, expect, test } from "bun:test";
import {
  LYRIC_CLOCK_HARD_CORRECT_MS,
  correctLyricClock,
  readLyricClock,
} from "../../../src/shared/listen/lyricClock";
import {
  isSelfOriginatedSync,
  shouldIgnoreOwnSyncEcho,
} from "../../../src/shared/listen/selfSync";

describe("correctLyricClock", () => {
  test("a new anchor starts at the sync target", () => {
    const anchor = correctLyricClock({
      anchor: null,
      targetMs: 12_000,
      nowMs: 100,
      trackKey: "track",
      playing: true,
    });
    expect(readLyricClock(anchor, 100)).toBe(12_000);
    expect(readLyricClock(anchor, 350)).toBe(12_250);
  });

  test("small drift eases instead of jumping", () => {
    const anchor = correctLyricClock({
      anchor: {
        mediaMs: 10_000,
        anchoredAtMs: 0,
        rate: 1,
        trackKey: "track",
      },
      targetMs: 11_400,
      nowMs: 1_000,
      trackKey: "track",
      playing: true,
    });
    expect(readLyricClock(anchor, 1_000)).toBe(11_000);
    expect(anchor.rate).toBe(1.08);
    expect(readLyricClock(anchor, 1_200)).toBeCloseTo(11_216, 5);
  });

  test("a real seek snaps", () => {
    const anchor = correctLyricClock({
      anchor: {
        mediaMs: 0,
        anchoredAtMs: 0,
        rate: 1,
        trackKey: "track",
      },
      targetMs: 500 + LYRIC_CLOCK_HARD_CORRECT_MS,
      nowMs: 500,
      trackKey: "track",
      playing: true,
    });
    expect(readLyricClock(anchor, 500)).toBe(500 + LYRIC_CLOCK_HARD_CORRECT_MS);
    expect(anchor.rate).toBe(1);
  });

  test("pause and a track change snap to the new target and stop", () => {
    const paused = correctLyricClock({
      anchor: {
        mediaMs: 4_000,
        anchoredAtMs: 0,
        rate: 1,
        trackKey: "a",
      },
      targetMs: 4_500,
      nowMs: 800,
      trackKey: "a",
      playing: false,
    });
    expect(paused.rate).toBe(0);
    expect(readLyricClock(paused, 5_000)).toBe(4_500);

    const next = correctLyricClock({
      anchor: paused,
      targetMs: 0,
      nowMs: 900,
      trackKey: "b",
      playing: true,
    });
    expect(readLyricClock(next, 900)).toBe(0);
    expect(next.trackKey).toBe("b");
  });
});

describe("shouldIgnoreOwnSyncEcho", () => {
  const self = {
    isDj: true,
    username: "Ryo",
    clientInstanceId: "tab-a",
    sourceUsername: "ryo",
    sourceClientInstanceId: "tab-a",
  };

  test("a live DJ ignores their own heartbeat", () => {
    expect(shouldIgnoreOwnSyncEcho({ ...self, playbackCatchUp: false })).toBe(true);
  });

  test("the first snapshot after rejoin is applied", () => {
    expect(shouldIgnoreOwnSyncEcho({ ...self, playbackCatchUp: true })).toBe(false);
  });

  test("another device and a listener still apply the payload", () => {
    expect(
      shouldIgnoreOwnSyncEcho({
        ...self,
        playbackCatchUp: false,
        sourceClientInstanceId: "tab-b",
      })
    ).toBe(false);
    expect(
      shouldIgnoreOwnSyncEcho({ ...self, isDj: false, playbackCatchUp: false })
    ).toBe(false);
    expect(
      isSelfOriginatedSync({
        username: "Ryo",
        clientInstanceId: "tab-a",
        sourceUsername: "ryo",
        sourceClientInstanceId: null,
      })
    ).toBe(true);
  });
});
