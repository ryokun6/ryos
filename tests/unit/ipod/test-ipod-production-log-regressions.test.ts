import { describe, expect, test } from "bun:test";
import { canStartLyricsTranslation } from "../../../src/shared/media/lyricsLifecycle";
import {
  IPOD_WHEEL_SOUND_MIN_INTERVAL_MS,
  shouldPlayIpodWheelSound,
} from "../../../src/apps/ipod/utils/wheelSound";
import { runSingleFlight } from "../../../src/utils/singleFlight";

describe("lyrics track-change lifecycle", () => {
  test("does not translate lines left over from the previous song", () => {
    expect(
      canStartLyricsTranslation({
        songId: "song-b",
        loadedSongId: "song-a",
        originalLineCount: 37,
        isFetchingOriginal: false,
      })
    ).toBe(false);
  });

  test("starts translation only after current-song lyrics finish loading", () => {
    expect(
      canStartLyricsTranslation({
        songId: "song-b",
        loadedSongId: "song-b",
        originalLineCount: 45,
        isFetchingOriginal: true,
      })
    ).toBe(false);
    expect(
      canStartLyricsTranslation({
        songId: "song-b",
        loadedSongId: "song-b",
        originalLineCount: 45,
        isFetchingOriginal: false,
      })
    ).toBe(true);
  });

  test("does not translate an empty current-song response", () => {
    expect(
      canStartLyricsTranslation({
        songId: "song-b",
        loadedSongId: "song-b",
        originalLineCount: 0,
        isFetchingOriginal: false,
      })
    ).toBe(false);
  });
});

describe("iPod wheel sound burst limiting", () => {
  test("plays the first wheel sound", () => {
    expect(shouldPlayIpodWheelSound(null, 1_000)).toBe(true);
  });

  test("suppresses duplicate and burst sounds inside the minimum interval", () => {
    expect(shouldPlayIpodWheelSound(1_000, 1_000)).toBe(false);
    expect(
      shouldPlayIpodWheelSound(
        1_000,
        1_000 + IPOD_WHEEL_SOUND_MIN_INTERVAL_MS - 1
      )
    ).toBe(false);
  });

  test("allows the next sound when the interval has elapsed", () => {
    expect(
      shouldPlayIpodWheelSound(
        1_000,
        1_000 + IPOD_WHEEL_SOUND_MIN_INTERVAL_MS
      )
    ).toBe(true);
  });

  test("coalesces requests while a cold sound is still loading", async () => {
    let resolveLoad: (() => void) | undefined;
    let operationCount = 0;
    const load = new Promise<void>((resolve) => {
      resolveLoad = resolve;
    });
    const ref = { current: null as Promise<void> | null };
    const operation = async () => {
      operationCount += 1;
      await load;
    };

    const first = runSingleFlight(ref, operation);
    const second = runSingleFlight(ref, operation);

    expect(second).toBe(first);
    expect(operationCount).toBe(1);

    resolveLoad?.();
    await first;
    await Promise.resolve();

    await runSingleFlight(ref, operation);
    expect(operationCount).toBe(2);
  });
});
