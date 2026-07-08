/**
 * MediaCore Phase 4 — lyric-offset auto-seek decision shared by the iPod and
 * Karaoke track-change effects.
 */
import { describe, expect, test } from "bun:test";
import { getLyricOffsetSeekTarget } from "../../../src/shared/media/useLyricOffsetTrackChange";

describe("getLyricOffsetSeekTarget", () => {
  test("negative offsets of 1s or more seek to where lyrics time hits 0", () => {
    expect(getLyricOffsetSeekTarget(-1000)).toBe(1);
    expect(getLyricOffsetSeekTarget(-2500)).toBe(2.5);
    expect(getLyricOffsetSeekTarget(-60000)).toBe(60);
  });

  test("small negative offsets start from the beginning", () => {
    expect(getLyricOffsetSeekTarget(-999)).toBeNull();
    expect(getLyricOffsetSeekTarget(-1)).toBeNull();
  });

  test("zero and positive offsets start from the beginning", () => {
    expect(getLyricOffsetSeekTarget(0)).toBeNull();
    expect(getLyricOffsetSeekTarget(500)).toBeNull();
    expect(getLyricOffsetSeekTarget(120000)).toBeNull();
  });
});
