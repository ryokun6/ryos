import { describe, expect, mock, test } from "bun:test";
import {
  settingsSchema,
  documentsControlSchema,
  calendarControlSchema,
} from "../../../api/chat/tools/schemas";
import { createChatTools } from "../../../api/chat/tools/index.js";
import { repairRyoToolCall } from "../../../api/_utils/ryo-agent.js";
import { checkToolRateLimit } from "../../../api/chat/tools/_tool-rate-limit.js";
import type { Redis } from "../../../api/_utils/redis.js";
import { FakeRedis } from "../../helpers/fake-redis";

// ============================================================================
// Expanded settings schema
// ============================================================================

describe("settingsSchema expanded fields", () => {
  test("accepts wallpaper, accent, and uiSoundsEnabled", () => {
    const result = settingsSchema.safeParse({
      wallpaper: "aurora",
      accent: "purple",
      uiSoundsEnabled: false,
    });
    expect(result.success).toBe(true);
  });

  test("accepts special accent values 'default' and 'wallpaper'", () => {
    expect(settingsSchema.safeParse({ accent: "default" }).success).toBe(true);
    expect(settingsSchema.safeParse({ accent: "wallpaper" }).success).toBe(
      true
    );
  });

  test("rejects unknown accent ids", () => {
    expect(settingsSchema.safeParse({ accent: "magenta" }).success).toBe(
      false
    );
  });

  test("rejects over-long wallpaper queries", () => {
    expect(
      settingsSchema.safeParse({ wallpaper: "x".repeat(121) }).success
    ).toBe(false);
  });

  test("rejects non-boolean uiSoundsEnabled", () => {
    expect(
      settingsSchema.safeParse({ uiSoundsEnabled: "yes" }).success
    ).toBe(false);
  });

  test("drops checkForUpdates: false during normalization", () => {
    expect(
      settingsSchema.safeParse({
        checkForUpdates: false,
        theme: "xp",
      })
    ).toEqual({
      success: true,
      data: { theme: "xp" },
    });
  });

  test("normalizes empty wallpaper strings to undefined", () => {
    expect(
      settingsSchema.safeParse({
        wallpaper: "",
        theme: "xp",
      })
    ).toEqual({
      success: true,
      data: { theme: "xp" },
    });
  });
});

// ============================================================================
// documentsControl schema hardening
// ============================================================================

describe("documentsControlSchema path hardening", () => {
  test("accepts a plain file directly under /Documents", () => {
    expect(
      documentsControlSchema.safeParse({
        action: "read",
        path: "/Documents/notes.md",
      }).success
    ).toBe(true);
  });

  test("rejects subdirectories", () => {
    expect(
      documentsControlSchema.safeParse({
        action: "read",
        path: "/Documents/folder/notes.md",
      }).success
    ).toBe(false);
  });

  test("rejects path traversal", () => {
    expect(
      documentsControlSchema.safeParse({
        action: "read",
        path: "/Documents/..secret.md",
      }).success
    ).toBe(false);
  });

  test("rejects backslashes", () => {
    expect(
      documentsControlSchema.safeParse({
        action: "read",
        path: "/Documents/notes\\evil.md",
      }).success
    ).toBe(false);
  });

  test("rejects over-long content on write", () => {
    expect(
      documentsControlSchema.safeParse({
        action: "write",
        path: "/Documents/big.md",
        content: "x".repeat(100_001),
      }).success
    ).toBe(false);
  });
});

// ============================================================================
// calendarControl location field
// ============================================================================

describe("calendarControlSchema location", () => {
  test("accepts create with a location", () => {
    expect(
      calendarControlSchema.safeParse({
        action: "create",
        title: "Dinner",
        date: "2026-07-10",
        location: "Tokyo Tower",
      }).success
    ).toBe(true);
  });

  test("rejects over-long locations", () => {
    expect(
      calendarControlSchema.safeParse({
        action: "create",
        title: "Dinner",
        date: "2026-07-10",
        location: "x".repeat(201),
      }).success
    ).toBe(false);
  });
});

// ============================================================================
// Memory tools omitted for anonymous users
// ============================================================================

describe("createChatTools anonymous memory filtering", () => {
  const baseContext = {
    log: mock(() => {}),
    logError: mock(() => {}),
    env: {},
    timeZone: "America/Los_Angeles",
  };

  test("'all' profile omits memory tools when username is missing", () => {
    const tools = createChatTools(
      { ...baseContext, username: null },
      { profile: "all" }
    ) as Record<string, unknown>;
    expect(tools.memoryWrite).toBeUndefined();
    expect(tools.memoryRead).toBeUndefined();
    expect(tools.memoryDelete).toBeUndefined();
    // Everything else stays available
    expect(tools.launchApp).toBeDefined();
    expect(tools.webFetch).toBeDefined();
  });

  test("'all' profile keeps memory tools for authenticated users", () => {
    const tools = createChatTools(
      { ...baseContext, username: "ryo" },
      { profile: "all" }
    ) as Record<string, unknown>;
    expect(tools.memoryWrite).toBeDefined();
    expect(tools.memoryRead).toBeDefined();
    expect(tools.memoryDelete).toBeDefined();
  });

  test("'telegram' profile keeps memory tools (always authenticated)", () => {
    const tools = createChatTools(
      { ...baseContext, username: "ryo" },
      { profile: "telegram" }
    ) as Record<string, unknown>;
    expect(tools.memoryWrite).toBeDefined();
  });
});

// ============================================================================
// Deterministic tool-call repair
// ============================================================================

type RepairArgs = Parameters<typeof repairRyoToolCall>[0];

function makeRepairArgs(input: unknown, error?: Error): RepairArgs {
  return {
    toolCall: {
      type: "tool-call",
      toolCallId: "call-1",
      toolName: "settings",
      input,
    },
    error: error ?? new Error("validation failed"),
  } as unknown as RepairArgs;
}

describe("repairRyoToolCall", () => {
  test("strips markdown code fences around JSON input", async () => {
    const repaired = await repairRyoToolCall(
      makeRepairArgs('```json\n{"theme":"macosx"}\n```')
    );
    expect(repaired).not.toBeNull();
    expect(repaired!.input).toBe('{"theme":"macosx"}');
  });

  test("unwraps double-encoded JSON strings", async () => {
    const repaired = await repairRyoToolCall(
      makeRepairArgs(JSON.stringify('{"theme":"macosx"}'))
    );
    expect(repaired).not.toBeNull();
    expect(repaired!.input).toBe('{"theme":"macosx"}');
  });

  test("returns null when input is already clean (no repair possible)", async () => {
    const repaired = await repairRyoToolCall(
      makeRepairArgs('{"theme":"macosx"}')
    );
    expect(repaired).toBeNull();
  });

  test("returns null for unparseable input", async () => {
    const repaired = await repairRyoToolCall(makeRepairArgs("not json at all"));
    expect(repaired).toBeNull();
  });

  test("returns null for non-string input", async () => {
    const repaired = await repairRyoToolCall(
      makeRepairArgs({ theme: "macosx" })
    );
    expect(repaired).toBeNull();
  });
});

// ============================================================================
// Per-tool rate limiting
// ============================================================================

describe("checkToolRateLimit", () => {
  test("anonymous users are always allowed (chat budget already caps them)", async () => {
    const result = await checkToolRateLimit("webFetch", {
      username: null,
      logError: () => {},
    });
    expect(result.allowed).toBe(true);
    const result2 = await checkToolRateLimit("searchSongs", {
      logError: () => {},
    });
    expect(result2.allowed).toBe(true);
  });

  test("uses the context redis client and enforces the hourly limit", async () => {
    const redis = new FakeRedis() as unknown as Redis;
    const context = { username: "alice", redis, logError: () => {} };

    // searchSongs allows 30 calls per hour
    for (let i = 0; i < 30; i++) {
      const result = await checkToolRateLimit("searchSongs", context);
      expect(result.allowed).toBe(true);
    }
    const blocked = await checkToolRateLimit("searchSongs", context);
    expect(blocked.allowed).toBe(false);
    expect(blocked.message).toContain("Rate limit reached for searchSongs");
  });

  test("fails open when the redis client errors", async () => {
    const throwingRedis = {
      incr: () => Promise.reject(new Error("redis down")),
    } as unknown as Redis;
    const logError = mock(() => {});
    const result = await checkToolRateLimit("webFetch", {
      username: "alice",
      redis: throwingRedis,
      logError,
    });
    expect(result.allowed).toBe(true);
    expect(logError).toHaveBeenCalled();
  });
});
