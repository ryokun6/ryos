import { describe, expect, test } from "bun:test";
import {
  authorizeRealtimeChannel,
  consumeRealtimeTicket,
  issueRealtimeTicket,
} from "../../../api/_utils/realtime-auth";
import type { Redis } from "../../../api/_utils/redis";

/**
 * In-memory Redis stub covering only the surface used by the realtime-auth
 * helpers (set with `ex`, get, del). Room-membership authorization is exercised
 * against the real server in the API integration tests.
 */
function createFakeRedis(): Redis {
  const store = new Map<string, unknown>();
  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      return (store.has(key) ? (store.get(key) as T) : null) ?? null;
    },
    async set(key: string, value: unknown): Promise<unknown> {
      store.set(key, value);
      return "OK";
    },
    async del(...keys: string[]): Promise<number> {
      let count = 0;
      for (const key of keys) {
        if (store.delete(key)) count += 1;
      }
      return count;
    },
  } as unknown as Redis;
}

describe("authorizeRealtimeChannel", () => {
  test("allows public channels for anyone", async () => {
    expect(await authorizeRealtimeChannel("chats-public", null)).toBe(true);
    expect(await authorizeRealtimeChannel("room-123", null)).toBe(true);
    expect(await authorizeRealtimeChannel("listen-abc", "ryo")).toBe(true);
    expect(await authorizeRealtimeChannel("airdrop-ryo", null)).toBe(true);
  });

  test("denies unknown authorization-requiring channels", async () => {
    expect(await authorizeRealtimeChannel("private-unknown", "ryo")).toBe(
      false
    );
    expect(await authorizeRealtimeChannel("presence-other", "ryo")).toBe(
      false
    );
  });

  test("per-user channels require a matching authenticated user", async () => {
    expect(
      await authorizeRealtimeChannel("private-chats-ryo", "ryo")
    ).toBe(true);
    expect(
      await authorizeRealtimeChannel("private-chats-ryo", "RYO")
    ).toBe(true);
    expect(
      await authorizeRealtimeChannel("private-sync-ryo", "ryo")
    ).toBe(true);

    expect(
      await authorizeRealtimeChannel("private-chats-ryo", "mallory")
    ).toBe(false);
    expect(
      await authorizeRealtimeChannel("private-sync-ryo", "mallory")
    ).toBe(false);
    expect(await authorizeRealtimeChannel("private-chats-ryo", null)).toBe(
      false
    );
  });

  test("global presence requires authentication", async () => {
    expect(await authorizeRealtimeChannel("presence-global", "ryo")).toBe(
      true
    );
    expect(await authorizeRealtimeChannel("presence-global", null)).toBe(
      false
    );
    expect(await authorizeRealtimeChannel("presence-global", "")).toBe(
      false
    );
  });
});

describe("realtime tickets", () => {
  test("issues and consumes a single-use ticket bound to the user", async () => {
    const redis = createFakeRedis();
    const ticket = await issueRealtimeTicket(redis, "Ryo");
    expect(typeof ticket).toBe("string");
    expect(ticket.length).toBeGreaterThan(16);

    // Bound username is normalized to lowercase.
    expect(await consumeRealtimeTicket(redis, ticket)).toBe("ryo");
    // Single-use: a second consume returns null.
    expect(await consumeRealtimeTicket(redis, ticket)).toBeNull();
  });

  test("rejects missing/invalid tickets", async () => {
    const redis = createFakeRedis();
    expect(await consumeRealtimeTicket(redis, null)).toBeNull();
    expect(await consumeRealtimeTicket(redis, "nope")).toBeNull();
  });
});
