import { describe, expect, test } from "bun:test";
import { normalizeListenSyncPayload } from "../../../src/shared/contracts/listen";

describe("normalizeListenSyncPayload", () => {
  test("fills legacy missing sourceUsername from djUsername", () => {
    expect(
      normalizeListenSyncPayload({
        currentTrackId: "track-1",
        currentTrackMeta: { title: "Song" },
        isPlaying: true,
        positionMs: 1000,
        timestamp: 123,
        djUsername: "alice",
        listenerCount: 2,
      }).sourceUsername
    ).toBe("alice");
  });

  test("preserves explicit sourceUsername", () => {
    expect(
      normalizeListenSyncPayload({
        currentTrackId: null,
        currentTrackMeta: null,
        isPlaying: false,
        positionMs: 0,
        timestamp: 456,
        djUsername: "alice",
        listenerCount: 1,
        sourceUsername: "bob",
      }).sourceUsername
    ).toBe("bob");
  });
});
