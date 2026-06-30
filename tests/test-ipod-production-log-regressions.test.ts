import { describe, expect, test } from "bun:test";
import { canStartLyricsTranslation } from "../src/shared/media/lyricsLifecycle";
import {
  IPOD_WHEEL_SOUND_MIN_INTERVAL_MS,
  shouldPlayIpodWheelSound,
} from "../src/apps/ipod/utils/wheelSound";

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
});
