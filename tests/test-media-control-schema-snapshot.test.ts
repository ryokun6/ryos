/**
 * MediaCore Phase 0 guardrails — AI media tool schema snapshots.
 *
 * Pins the exact action vocabulary and parameter rules of the three media
 * control tools (`ipodControl`, `karaokeControl`, `tvControl`) so the
 * Phase 5 consolidation into a single `mediaControl` tool can prove it
 * accepts everything the current tools accept.
 */
import { describe, expect, test } from "bun:test";
import {
  ipodControlSchema,
  karaokeControlSchema,
  tvControlSchema,
} from "../api/chat/tools/schemas";
import { TV_ACTIONS } from "../api/chat/tools/types";

const MEDIA_ACTIONS = [
  "toggle",
  "play",
  "pause",
  "playKnown",
  "addAndPlay",
  "next",
  "previous",
] as const;

/** Minimal extra params each action needs to pass refinement. */
const validParamsFor = (action: string): Record<string, unknown> =>
  action === "addAndPlay" ? { id: "dQw4w9WgXcQ" } : {};

for (const [name, schema] of [
  ["ipodControl", ipodControlSchema],
  ["karaokeControl", karaokeControlSchema],
] as const) {
  describe(`${name} schema snapshot`, () => {
    test("accepts exactly the pinned action vocabulary", () => {
      for (const action of MEDIA_ACTIONS) {
        const result = schema.safeParse({
          action,
          ...validParamsFor(action),
        });
        expect(result.success).toBe(true);
      }
      expect(schema.safeParse({ action: "stop" }).success).toBe(false);
      expect(schema.safeParse({ action: "tune" }).success).toBe(false);
    });

    test("defaults the action to toggle", () => {
      const result = schema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.action).toBe("toggle");
      }
    });

    test("addAndPlay requires id and rejects manual title/artist", () => {
      expect(schema.safeParse({ action: "addAndPlay" }).success).toBe(false);
      expect(
        schema.safeParse({
          action: "addAndPlay",
          id: "dQw4w9WgXcQ",
          title: "Manual",
        }).success
      ).toBe(false);
      expect(
        schema.safeParse({
          action: "addAndPlay",
          id: "dQw4w9WgXcQ",
          artist: "Manual",
        }).success
      ).toBe(false);
    });

    test("playKnown allows id/title/artist and also bare invocation", () => {
      expect(schema.safeParse({ action: "playKnown" }).success).toBe(true);
      expect(
        schema.safeParse({
          action: "playKnown",
          title: "Song",
          artist: "Artist",
        }).success
      ).toBe(true);
    });

    test("playback-state and navigation actions reject item identifiers", () => {
      for (const action of ["toggle", "play", "pause", "next", "previous"]) {
        expect(schema.safeParse({ action, id: "x" }).success).toBe(false);
        expect(schema.safeParse({ action, title: "x" }).success).toBe(false);
      }
    });

    test("supports enableTranslation and enableFullscreen flags", () => {
      const result = schema.safeParse({
        action: "play",
        enableTranslation: "zh-TW",
        enableFullscreen: true,
      });
      expect(result.success).toBe(true);
    });
  });
}

describe("ipodControl vs karaokeControl surface difference", () => {
  test("only ipodControl carries the enableVideo flag", () => {
    const ipodResult = ipodControlSchema.safeParse({
      action: "play",
      enableVideo: true,
    });
    expect(ipodResult.success).toBe(true);
    if (ipodResult.success) {
      expect(
        (ipodResult.data as { enableVideo?: boolean }).enableVideo
      ).toBe(true);
    }

    // Karaoke's schema has no enableVideo key; Zod strips it from output.
    const karaokeResult = karaokeControlSchema.safeParse({
      action: "play",
      enableVideo: true,
    });
    expect(karaokeResult.success).toBe(true);
    if (karaokeResult.success) {
      expect("enableVideo" in karaokeResult.data).toBe(false);
    }
  });
});

describe("tvControl schema snapshot", () => {
  test("action vocabulary is pinned", () => {
    expect([...TV_ACTIONS]).toEqual([
      "list",
      "tune",
      "createChannel",
      "deleteChannel",
      "addVideo",
      "removeVideo",
    ]);
  });

  test("accepts representative calls for every action", () => {
    const calls: Record<(typeof TV_ACTIONS)[number], Record<string, unknown>> =
      {
        list: { action: "list" },
        tune: { action: "tune", channelId: "mtv" },
        createChannel: { action: "createChannel", prompt: "lofi beats" },
        deleteChannel: { action: "deleteChannel", channelId: "custom-1" },
        addVideo: {
          action: "addVideo",
          channelId: "custom-1",
          videoId: "dQw4w9WgXcQ",
        },
        removeVideo: {
          action: "removeVideo",
          channelId: "custom-1",
          removeVideoId: "dQw4w9WgXcQ",
        },
      };
    for (const action of TV_ACTIONS) {
      expect(tvControlSchema.safeParse(calls[action]).success).toBe(true);
    }
    expect(tvControlSchema.safeParse({ action: "play" }).success).toBe(false);
  });
});
