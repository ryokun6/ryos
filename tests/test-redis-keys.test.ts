#!/usr/bin/env bun
/**
 * Unit tests for the canonical Redis key registry. These tests do not touch a
 * Redis server; they lock down key shapes for the staged migration.
 */

import { describe, expect, test } from "bun:test";
import {
  CANONICAL_REDIS_PREFIXES,
  LEGACY_REDIS_SCAN_PATTERNS,
  redisKey,
  redisKeys,
  redisKeysForHashedIdentifiers,
  sha256RedisIdentifier,
} from "../src/shared/redisKeys";

describe("canonical Redis key registry", () => {
  test("uses the approved top-level prefixes without an app or env wrapper", () => {
    expect(CANONICAL_REDIS_PREFIXES).toEqual([
      "agent",
      "analytics",
      "auth",
      "cache",
      "chat",
      "integration",
      "media",
      "memory",
      "presence",
      "rate",
      "realtime",
      "session",
      "sync",
      "system",
    ]);
    expect(CANONICAL_REDIS_PREFIXES).not.toContain("ryos");
    expect(CANONICAL_REDIS_PREFIXES).not.toContain("prod");
  });

  test("keeps precise legacy scan patterns for final cleanup", () => {
    expect(LEGACY_REDIS_SCAN_PATTERNS).toContain("chat:users:*");
    expect(LEGACY_REDIS_SCAN_PATTERNS).toContain("chat:token:*");
    expect(LEGACY_REDIS_SCAN_PATTERNS).toContain("analytics:daily:*");
    expect(LEGACY_REDIS_SCAN_PATTERNS).toContain("memory:user:*:processing_lock");
    expect(LEGACY_REDIS_SCAN_PATTERNS).toContain("sync2:*");
    expect(LEGACY_REDIS_SCAN_PATTERNS).toContain("rl:*");
    expect(LEGACY_REDIS_SCAN_PATTERNS).toContain("cursor-sdk-run:*");
    expect(LEGACY_REDIS_SCAN_PATTERNS).not.toContain("chat:*");
    expect(LEGACY_REDIS_SCAN_PATTERNS).not.toContain("sync:*");
    expect(redisKeys.chat.roomMeta("abc").startsWith("chat:room:")).toBe(false);
    expect(redisKeys.integration.ircServer("libera").startsWith("chat:irc:")).toBe(
      false
    );
  });

  test("normalizes dynamic segments consistently", () => {
    expect(redisKey("Auth", "User", "Ryo Lu", "Profile")).toBe(
      "auth:user:ryo%20lu:profile"
    );
    expect(redisKeys.auth.userProfile("Alice")).toBe("auth:user:alice:profile");
    expect(redisKeys.auth.userSessions("Alice")).toBe("auth:user:alice:sessions");
    expect(redisKeys.rate.counter("AI Chat", "5h", "user", "Alice")).toBe(
      "rate:ai%20chat:5h:user:alice"
    );
  });

  test("preserves case-sensitive IDs where existing IDs may be mixed-case", () => {
    expect(redisKeys.chat.roomMeta("RoomABC")).toBe("chat:rooms:RoomABC:meta");
    expect(redisKeys.media.songMeta("am:12345")).toBe("media:song:am:12345:meta");
    expect(redisKeys.media.songContent("am:12345")).toBe(
      "media:song:am:12345:content"
    );
    expect(redisKeys.agent.cursorRunMeta("bc_AbC")).toBe(
      "agent:cursor:run:bc_AbC:meta"
    );
  });

  test("builds representative migration target keys", () => {
    expect(redisKeys.sync.v2Kv("Ryo")).toBe("sync:v2:user:ryo:kv");
    expect(redisKeys.sync.v2Journal("Ryo")).toBe("sync:v2:user:ryo:journal");
    expect(redisKeys.cache.ieVersions("urlhash", 1999)).toBe(
      "cache:ie:urlhash:1999:versions"
    );
    expect(redisKeys.integration.telegramPendingLink("Ryo")).toBe(
      "integration:telegram:link:user:ryo"
    );
    expect(redisKeys.integration.ircServer("libera")).toBe(
      "integration:irc:server:libera"
    );
    expect(redisKeys.realtime.ticket("tickethash")).toBe("realtime:ticket:tickethash");
    expect(redisKeys.presence.globalOnline()).toBe("presence:global:online");
  });

  test("hashes sensitive identifiers before they become key segments", async () => {
    const hash = await sha256RedisIdentifier("secret-token");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("secret-token");
    expect(redisKeys.auth.session(hash)).toBe(`auth:session:${hash}`);

    const helpers = redisKeysForHashedIdentifiers();
    await expect(helpers.token("secret-token")).resolves.toBe(hash);
    await expect(helpers.ip("203.0.113.10")).resolves.toHaveLength(64);
    await expect(helpers.url("https://example.com/path")).resolves.toHaveLength(64);
  });
});
