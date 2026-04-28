import { describe, expect, test } from "bun:test";
import {
  isYouTubeUrl,
  nextIndex,
  prevIndex,
  randomTuneInOffset,
  shuffleArray,
} from "../src/apps/tv/utils";

describe("isYouTubeUrl", () => {
  test("accepts standard YouTube hosts", () => {
    expect(isYouTubeUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isYouTubeUrl("https://youtube.com/watch?v=abc")).toBe(true);
    expect(isYouTubeUrl("https://youtu.be/abc")).toBe(true);
    expect(isYouTubeUrl("https://m.youtube.com/watch?v=abc")).toBe(true);
    expect(isYouTubeUrl("https://music.youtube.com/watch?v=abc")).toBe(true);
  });

  test("rejects non-YouTube hosts", () => {
    expect(isYouTubeUrl("https://vimeo.com/123")).toBe(false);
    expect(isYouTubeUrl("https://example.com/video.mp4")).toBe(false);
    expect(isYouTubeUrl("file:///Users/me/song.mp3")).toBe(false);
  });

  test("returns false for malformed / empty inputs without throwing", () => {
    expect(isYouTubeUrl("")).toBe(false);
    expect(isYouTubeUrl(undefined)).toBe(false);
    expect(isYouTubeUrl(null)).toBe(false);
    expect(isYouTubeUrl("not a url")).toBe(false);
  });
});

describe("nextIndex / prevIndex", () => {
  test("nextIndex wraps at length", () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(2, 3)).toBe(0);
  });

  test("prevIndex wraps at 0", () => {
    expect(prevIndex(0, 3)).toBe(2);
    expect(prevIndex(2, 3)).toBe(1);
  });

  test("returns 0 on empty list rather than NaN/Infinity", () => {
    expect(nextIndex(0, 0)).toBe(0);
    expect(prevIndex(0, 0)).toBe(0);
  });

  test("handles a single-item list", () => {
    expect(nextIndex(0, 1)).toBe(0);
    expect(prevIndex(0, 1)).toBe(0);
  });
});

describe("shuffleArray", () => {
  test("returns a permutation of the same elements", () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffleArray(input);
    expect(out.slice().sort()).toEqual([1, 2, 3, 4, 5]);
    expect(out.length).toBe(input.length);
  });

  test("does not mutate the input array", () => {
    const input = [1, 2, 3, 4, 5];
    const snapshot = input.slice();
    shuffleArray(input);
    expect(input).toEqual(snapshot);
  });

  test("with a deterministic rng, produces a deterministic order", () => {
    const seedRng = () => 0; // always picks index 0 in Fisher–Yates inner step
    const a = shuffleArray([1, 2, 3, 4], seedRng);
    const b = shuffleArray([1, 2, 3, 4], seedRng);
    expect(a).toEqual(b);
  });

  test("empty / single-element arrays are stable", () => {
    expect(shuffleArray([])).toEqual([]);
    expect(shuffleArray(["only"])).toEqual(["only"]);
  });
});

describe("randomTuneInOffset", () => {
  test("returns a value in [0, d * 0.75) for normal durations", () => {
    const out = randomTuneInOffset(100, () => 0.5);
    expect(out).toBeCloseTo(37.5);
  });

  test("returns null for live streams (Infinity)", () => {
    expect(randomTuneInOffset(Infinity)).toBeNull();
  });

  test("returns null for unknown / zero / NaN durations", () => {
    expect(randomTuneInOffset(0)).toBeNull();
    expect(randomTuneInOffset(NaN)).toBeNull();
  });

  test("returns null for clips below the threshold", () => {
    expect(randomTuneInOffset(15)).toBeNull();
    expect(randomTuneInOffset(30)).toBeNull(); // boundary: not strictly greater
  });

  test("custom threshold lets callers tune in to shorter clips", () => {
    const out = randomTuneInOffset(20, () => 0.5, 10);
    expect(out).toBeCloseTo(7.5);
  });
});
