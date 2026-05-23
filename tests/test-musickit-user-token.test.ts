import { describe, expect, test } from "bun:test";

import {
  deleteMusicKitUserToken,
  getMusicKitUserToken,
  getMusicKitUserTokenKey,
  markMusicKitUserTokenValidated,
  normalizeMusicUserToken,
  storeMusicKitUserToken,
} from "../api/_utils/_musickit-user-token";
import type { Redis } from "../api/_utils/redis";

function createRedisMock(): Redis {
  const values = new Map<string, unknown>();
  return {
    get: async <T = unknown>(key: string) => (values.get(key) as T | undefined) ?? null,
    set: async (key: string, value: unknown) => {
      values.set(key, value);
      return "OK";
    },
    del: async (...keys: string[]) => {
      let deleted = 0;
      for (const key of keys) {
        if (values.delete(key)) deleted++;
      }
      return deleted;
    },
  } as Redis;
}

describe("MusicKit user token storage", () => {
  test("validates opaque Music User Tokens without accepting whitespace", () => {
    expect(normalizeMusicUserToken("  abcdefghijklmnop  ")).toBe(
      "abcdefghijklmnop"
    );
    expect(normalizeMusicUserToken("too-short")).toBeNull();
    expect(normalizeMusicUserToken("token with spaces")).toBeNull();
  });

  test("stores, validates, and deletes a token per encoded username", async () => {
    const redis = createRedisMock();
    const username = "music:user@example";
    const token = "music-user-token-1234567890";

    expect(getMusicKitUserTokenKey(username)).toBe(
      "musickit:user-token:music%3Auser%40example"
    );

    const stored = await storeMusicKitUserToken(redis, username, token);
    expect(stored.token).toBe(token);
    expect(stored.lastValidatedAt).toBeUndefined();

    const fetched = await getMusicKitUserToken(redis, username);
    expect(fetched?.token).toBe(token);

    const validated = await markMusicKitUserTokenValidated(redis, username);
    expect(validated?.token).toBe(token);
    expect(validated?.lastValidatedAt).toBeDefined();

    await deleteMusicKitUserToken(redis, username);
    expect(await getMusicKitUserToken(redis, username)).toBeNull();
  });
});
