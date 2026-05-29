import { describe, expect, test } from "bun:test";
import {
  STANDALONE_IPOD_BASE_PATH,
  isStandaloneIpodPath,
  parseStandaloneIpodRoute,
} from "../src/utils/standaloneIpodRoute";
import { standaloneIpodPath } from "../src/utils/standaloneIpodRoute";

describe("standalone iPod route", () => {
  test("isStandaloneIpodPath matches base and track paths", () => {
    expect(isStandaloneIpodPath("/standalone/ipod")).toBe(true);
    expect(isStandaloneIpodPath("/standalone/ipod/")).toBe(true);
    expect(isStandaloneIpodPath("/standalone/ipod/abc123")).toBe(true);
    expect(isStandaloneIpodPath("/ipod")).toBe(false);
    expect(isStandaloneIpodPath("/ipod/track-id")).toBe(false);
    expect(isStandaloneIpodPath("/")).toBe(false);
  });

  test("parseStandaloneIpodRoute extracts track and listen session", () => {
    expect(parseStandaloneIpodRoute("/standalone/ipod")).toEqual({});
    expect(parseStandaloneIpodRoute("/standalone/ipod/my-song-id")).toEqual({
      videoId: "my-song-id",
    });
    expect(
      parseStandaloneIpodRoute("/standalone/ipod/x", "?listen=session-42")
    ).toEqual({
      videoId: "x",
      listenSessionId: "session-42",
    });
  });

  test("standaloneIpodPath builds canonical URLs", () => {
    expect(standaloneIpodPath()).toBe(STANDALONE_IPOD_BASE_PATH);
    expect(standaloneIpodPath("a/b")).toBe("/standalone/ipod/a%2Fb");
  });
});
