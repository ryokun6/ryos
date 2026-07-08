/**
 * Unit/wiring coverage for the Redis hot-path optimizations:
 * - Upstash client caching + auto-pipelining
 * - validateAuth single-hash + pipelined TTL refresh
 * - chat burst Lua incr+expire
 * - checkCounterLimit TTL only on deny
 * - O(1) songs version probe
 * - addMessage lpush+ltrim pipeline
 * - listen sync skips SADD
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Redis } from "../../../api/_utils/redis";
import { validateAuth } from "../../../api/_utils/auth/_validate";
import { storeToken } from "../../../api/_utils/auth/_tokens";
import {
  checkCounterLimit,
  INCREMENT_WITH_TTL_SCRIPT,
} from "../../../api/_utils/_rate-limit";
import {
  getSongsVersionInfo,
  saveSong,
} from "../../../api/_utils/_song-service";
import { addMessage } from "../../../api/rooms/_helpers/_redis";
import { setSession } from "../../../api/listen/_helpers/_redis";
import { redisKeys, sha256RedisIdentifier } from "../../../src/shared/redisKeys";
import { FakeRedis } from "../../helpers/fake-redis";
import type { ListenSession } from "../../../api/listen/_helpers/_types";
import type { Message } from "../../../api/rooms/_helpers/_types";

const readSource = (relPath: string): string =>
  readFileSync(resolve(process.cwd(), relPath), "utf-8");

describe("API hot-path wiring", () => {
  test("Upstash client is process-cached with auto-pipelining", () => {
    const source = readSource("api/_utils/redis.ts");
    expect(source).toContain("__ryosUpstashRedis");
    expect(source).toContain("enableAutoPipelining: true");
  });

  test("validateAuth hashes once and pipelines TTL refreshes", () => {
    const source = readSource("api/_utils/auth/_validate.ts");
    expect(source).toContain("getCanonicalSessionKeyFromHash");
    expect(source).toContain("sha256RedisIdentifier(token)");
    expect(source).not.toContain("getCanonicalSessionKey(token)");
    expect(source).toContain("expirePipeline");
    expect(source).toContain("Promise.all");
  });

  test("chat burst limiter uses INCREMENT_WITH_TTL_SCRIPT", () => {
    const source = readSource("api/rooms/[id]/messages.ts");
    expect(source).toContain("INCREMENT_WITH_TTL_SCRIPT");
    expect(source).not.toMatch(/await redis\.incr\(shortKey\)/);
    expect(source).not.toMatch(/await redis\.incr\(longKey\)/);
    expect(source).toContain("void broadcastNewMessage");
  });

  test("checkCounterLimit skips TTL on allowed path", () => {
    const source = readSource("api/_utils/_rate-limit.ts");
    expect(source).toContain("INCREMENT_WITH_TTL_SCRIPT");
    expect(source).toMatch(/if \(newCount > limit\)[\s\S]*client\.ttl\(key\)/);
    expect(source).toContain("resetSeconds: windowSeconds");
  });

  test("apiHandler does not await timezone updates", () => {
    const source = readSource("api/_utils/api-handler.ts");
    expect(source).toContain("void updateStoredUserTimeZone");
    expect(source).not.toMatch(/await updateStoredUserTimeZone/);
  });

  test("presence heartbeat and typing do not await broadcasts", () => {
    const heartbeat = readSource("api/presence/heartbeat.ts");
    expect(heartbeat).toContain("void triggerRealtimeEvent");
    expect(heartbeat).not.toMatch(/await triggerRealtimeEvent/);

    const typing = readSource("api/rooms/[id]/typing.ts");
    expect(typing).toContain("void broadcastTypingIndicator");
    expect(typing).not.toMatch(/await broadcastTypingIndicator/);
  });

  test("listen sync skips SADD on setSession", () => {
    const sync = readSource("api/listen/sessions/[id]/sync.ts");
    expect(sync).toContain("registerInIndex: false");
    const helper = readSource("api/listen/_helpers/_redis.ts");
    expect(helper).toContain("registerInIndex");
  });
});

describe("API hot-path behavior", () => {
  test("validateAuth accepts a stored token and refreshes TTLs", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    const username = "hotpathuser";
    const token = "a".repeat(64);

    await storeToken(redis, username, token);
    const result = await validateAuth(redis, username, token);
    expect(result).toEqual({ valid: true, expired: false });

    const tokenHash = await sha256RedisIdentifier(token);
    expect(fake.ttls.get(redisKeys.auth.session(tokenHash))).toBeGreaterThan(0);
    expect(
      fake.ttls.get(redisKeys.auth.userSessions(username))
    ).toBeGreaterThan(0);
  });

  test("validateAuth rejects unknown tokens", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    const result = await validateAuth(redis, "nobody", "b".repeat(64));
    expect(result.valid).toBe(false);
  });

  test("checkCounterLimit allows under limit without TTL read", async () => {
    class TtlCountingRedis extends FakeRedis {
      ttlCalls = 0;
      override async ttl(key: string): Promise<number> {
        this.ttlCalls += 1;
        return super.ttl(key);
      }
    }
    const fake = new TtlCountingRedis();
    const redis = fake as unknown as Redis;

    const result = await checkCounterLimit({
      key: "rl:test:allowed",
      windowSeconds: 60,
      limit: 5,
      redis,
    });
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(1);
    expect(result.resetSeconds).toBe(60);
    expect(fake.ttlCalls).toBe(0);
  });

  test("checkCounterLimit denies over limit and returns TTL", async () => {
    class TtlCountingRedis extends FakeRedis {
      ttlCalls = 0;
      override async ttl(key: string): Promise<number> {
        this.ttlCalls += 1;
        return super.ttl(key);
      }
    }
    const fake = new TtlCountingRedis();
    const redis = fake as unknown as Redis;
    const key = "rl:test:denied";

    for (let i = 0; i < 3; i++) {
      await checkCounterLimit({ key, windowSeconds: 30, limit: 2, redis });
    }
    const denied = await checkCounterLimit({
      key,
      windowSeconds: 30,
      limit: 2,
      redis,
    });
    expect(denied.allowed).toBe(false);
    expect(denied.count).toBe(4);
    expect(fake.ttlCalls).toBeGreaterThan(0);
  });

  test("INCREMENT_WITH_TTL_SCRIPT is exported for chat burst reuse", () => {
    expect(INCREMENT_WITH_TTL_SCRIPT).toContain("INCR");
    expect(INCREMENT_WITH_TTL_SCRIPT).toContain("EXPIRE");
  });

  test("addMessage pipelines lpush+ltrim", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    const message: Message = {
      id: "m1",
      roomId: "public",
      username: "alice",
      content: "hello",
      timestamp: Date.now(),
    };
    await addMessage("public", message, redis);
    const list = await redis.lrange(redisKeys.chat.roomMessages("public"), 0, -1);
    expect(list).toHaveLength(1);
    expect(JSON.parse(list[0] as string).id).toBe("m1");
  });

  test("getSongsVersionInfo unfiltered path is O(1) after saveSong", async () => {
    class CountingRedis extends FakeRedis {
      getCalls = 0;
      mgetCalls = 0;
      override async get<T = unknown>(key: string): Promise<T | null> {
        this.getCalls += 1;
        return super.get<T>(key);
      }
      override async mget<T = unknown>(...keys: string[]): Promise<(T | null)[]> {
        this.mgetCalls += 1;
        return super.mget<T>(...keys);
      }
    }
    const fake = new CountingRedis();
    const redis = fake as unknown as Redis;

    const savedA = await saveSong(redis, {
      id: "am:1",
      title: "A",
      createdAt: 1_700_000_000_001,
    });
    const savedB = await saveSong(redis, {
      id: "am:2",
      title: "B",
      createdAt: 1_700_000_000_002,
    });

    fake.getCalls = 0;
    fake.mgetCalls = 0;
    const info = await getSongsVersionInfo(redis);
    expect(info.count).toBe(2);
    // saveSong stamps updatedAt with Date.now(); version is the max stamp.
    expect(info.version).toBe(Math.max(savedA.updatedAt, savedB.updatedAt));
    expect(fake.mgetCalls).toBe(0);
    // One GET for the version stamp (+ SCARD which is not a get/mget).
    expect(fake.getCalls).toBe(1);
  });

  test("setSession can skip index SADD", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    const session: ListenSession = {
      id: "sess1",
      host: "alice",
      dj: "alice",
      users: ["alice"],
      createdAt: Date.now(),
      lastSyncAt: Date.now(),
      mediaType: "ipod",
      mediaId: "track-1",
      positionMs: 0,
      isPlaying: false,
    };

    await setSession("sess1", session, redis, { registerInIndex: false });
    expect(await redis.scard(redisKeys.session.listenIds())).toBe(0);

    await setSession("sess1", session, redis, { registerInIndex: true });
    expect(await redis.scard(redisKeys.session.listenIds())).toBe(1);
  });
});
