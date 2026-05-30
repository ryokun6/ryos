import { describe, expect, test } from "bun:test";
import {
  STANDALONE_KARAOKE_BASE_PATH,
  isStandaloneKaraokePath,
  parseStandaloneKaraokeRoute,
  standaloneKaraokePath,
} from "../src/utils/standaloneKaraokeRoute";

describe("standalone Karaoke route", () => {
  test("isStandaloneKaraokePath matches base and track paths", () => {
    expect(isStandaloneKaraokePath("/standalone/karaoke")).toBe(true);
    expect(isStandaloneKaraokePath("/standalone/karaoke/")).toBe(true);
    expect(isStandaloneKaraokePath("/standalone/karaoke/abc123")).toBe(true);
    expect(isStandaloneKaraokePath("/karaoke")).toBe(false);
    expect(isStandaloneKaraokePath("/standalone/ipod")).toBe(false);
    expect(isStandaloneKaraokePath("/")).toBe(false);
  });

  test("parseStandaloneKaraokeRoute extracts track and listen session", () => {
    expect(parseStandaloneKaraokeRoute("/standalone/karaoke")).toEqual({});
    expect(parseStandaloneKaraokeRoute("/standalone/karaoke/my-song-id")).toEqual({
      videoId: "my-song-id",
    });
    expect(
      parseStandaloneKaraokeRoute("/standalone/karaoke/x", "?listen=session-42")
    ).toEqual({
      videoId: "x",
      listenSessionId: "session-42",
    });
  });

  test("standaloneKaraokePath builds canonical URLs", () => {
    expect(standaloneKaraokePath()).toBe(STANDALONE_KARAOKE_BASE_PATH);
    expect(standaloneKaraokePath("a/b")).toBe("/standalone/karaoke/a%2Fb");
  });
});
