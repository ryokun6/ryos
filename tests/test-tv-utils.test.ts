import { describe, expect, test } from "bun:test";
import {
  hashStringToSeed,
  isShortDuration,
  isYouTubeUrl,
  mulberry32,
  nextIndex,
  parseYouTubeId,
  prevIndex,
  randomTuneInOffset,
  shuffleArray,
  shufflePlaylistWithSeed,
  SHORTS_MAX_DURATION_SECONDS,
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

  test("rejects substring-confusable host spoofs", () => {
    // Hosts that *contain* "youtube.com" but are not actually YouTube
    // (would have slipped through a `hostname.includes("youtube.com")`
    // check).
    expect(isYouTubeUrl("https://evil-youtube.com/watch?v=abc")).toBe(false);
    expect(isYouTubeUrl("https://youtube.com.attacker.test/watch?v=abc")).toBe(
      false
    );
    expect(isYouTubeUrl("https://fakeyoutube.com/watch?v=abc")).toBe(false);
    expect(isYouTubeUrl("https://notyoutu.be/abc")).toBe(false);
  });

  test("returns false for malformed / empty inputs without throwing", () => {
    expect(isYouTubeUrl("")).toBe(false);
    expect(isYouTubeUrl(undefined)).toBe(false);
    expect(isYouTubeUrl(null)).toBe(false);
    expect(isYouTubeUrl("not a url")).toBe(false);
  });
});

describe("parseYouTubeId", () => {
  const VID = "dQw4w9WgXcQ";

  test("returns the id for a bare 11-char id", () => {
    expect(parseYouTubeId(VID)).toBe(VID);
  });

  test("extracts the id from supported YouTube URL shapes", () => {
    expect(parseYouTubeId(`https://www.youtube.com/watch?v=${VID}`)).toBe(VID);
    expect(parseYouTubeId(`https://youtube.com/watch?v=${VID}&t=10`)).toBe(VID);
    expect(parseYouTubeId(`https://m.youtube.com/watch?v=${VID}`)).toBe(VID);
    expect(parseYouTubeId(`https://music.youtube.com/watch?v=${VID}`)).toBe(
      VID
    );
    expect(parseYouTubeId(`https://youtu.be/${VID}`)).toBe(VID);
    expect(parseYouTubeId(`https://youtu.be/${VID}?si=abc`)).toBe(VID);
    expect(parseYouTubeId(`https://www.youtube.com/embed/${VID}`)).toBe(VID);
    expect(parseYouTubeId(`https://www.youtube.com/shorts/${VID}`)).toBe(VID);
    expect(parseYouTubeId(`https://www.youtube.com/v/${VID}`)).toBe(VID);
  });

  test("rejects substring-confusable host spoofs", () => {
    // The whole point of this regression coverage: hosts that merely
    // *contain* a YouTube domain string must NOT be treated as YouTube.
    expect(
      parseYouTubeId(`https://evil-youtube.com/watch?v=${VID}`)
    ).toBeNull();
    expect(
      parseYouTubeId(`https://youtube.com.attacker.test/watch?v=${VID}`)
    ).toBeNull();
    expect(parseYouTubeId(`https://fakeyoutube.com/watch?v=${VID}`)).toBeNull();
    expect(parseYouTubeId(`https://notyoutu.be/${VID}`)).toBeNull();
    expect(
      parseYouTubeId(`https://userinfo@evil.com/youtube.com/watch?v=${VID}`)
    ).toBeNull();
  });

  test("returns null for non-YouTube and malformed inputs", () => {
    expect(parseYouTubeId("https://vimeo.com/123")).toBeNull();
    expect(parseYouTubeId("not a url")).toBeNull();
    expect(parseYouTubeId("")).toBeNull();
    expect(parseYouTubeId(null)).toBeNull();
    expect(parseYouTubeId(undefined)).toBeNull();
  });

  test("returns null for YouTube URLs without a recognizable id", () => {
    expect(parseYouTubeId("https://www.youtube.com/")).toBeNull();
    expect(parseYouTubeId("https://www.youtube.com/feed/trending")).toBeNull();
    // Too short / too long bare ids are rejected.
    expect(parseYouTubeId("short")).toBeNull();
    expect(parseYouTubeId("a".repeat(12))).toBeNull();
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

describe("shufflePlaylistWithSeed", () => {
  const ids = (items: { id: string }[]) => items.map((i) => i.id).join(",");

  test("same seedKey yields identical order on repeated calls", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const key = "mtv:a\0b\0c\0d";
    expect(ids(shufflePlaylistWithSeed(items, key))).toBe(
      ids(shufflePlaylistWithSeed(items, key))
    );
  });

  test("order differs when seedKey differs (same items)", () => {
    const items = [
      { id: "a" },
      { id: "b" },
      { id: "c" },
      { id: "d" },
      { id: "e" },
    ];
    expect(ids(shufflePlaylistWithSeed(items, "ch-a"))).not.toBe(
      ids(shufflePlaylistWithSeed(items, "ch-b"))
    );
  });
});

describe("hashStringToSeed / mulberry32", () => {
  test("deterministic outputs", () => {
    expect(hashStringToSeed("hello")).toBe(hashStringToSeed("hello"));
    const r = mulberry32(hashStringToSeed("x"));
    expect(r()).toBeCloseTo(mulberry32(hashStringToSeed("x"))(), 10);
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

describe("isShortDuration", () => {
  test("flags durations at or below the default 60s threshold as Shorts", () => {
    expect(isShortDuration(15)).toBe(true);
    expect(isShortDuration(45)).toBe(true);
    expect(isShortDuration(SHORTS_MAX_DURATION_SECONDS)).toBe(true);
  });

  test("does not flag durations above the threshold", () => {
    expect(isShortDuration(SHORTS_MAX_DURATION_SECONDS + 0.5)).toBe(false);
    expect(isShortDuration(120)).toBe(false);
    expect(isShortDuration(3600)).toBe(false);
  });

  test("treats unknown / not-yet-loaded durations as not-Shorts", () => {
    // Don't drop a video while the player is still bootstrapping — duration
    // shows up as 0 (not loaded) or NaN (driver glitch) before the video
    // actually starts playing.
    expect(isShortDuration(0)).toBe(false);
    expect(isShortDuration(NaN)).toBe(false);
  });

  test("treats live streams (Infinity) as not-Shorts", () => {
    expect(isShortDuration(Infinity)).toBe(false);
  });

  test("custom threshold lets callers tune the cutoff", () => {
    expect(isShortDuration(90, 120)).toBe(true);
    expect(isShortDuration(150, 120)).toBe(false);
  });
});
