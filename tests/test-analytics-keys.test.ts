import { describe, expect, test } from "bun:test";
import type { Redis } from "../api/_utils/redis";
import {
  getAnalyticsDetail,
  getAnalyticsSummary,
  recordAnalyticsEvent,
} from "../api/_utils/_analytics";
import { getAIRateLimitKey } from "../api/_utils/_rate-limit";
import { FakeRedis } from "./fake-redis";

describe("analytics Redis keys", () => {
  test("records API analytics into canonical keys only", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    const today = new Date().toISOString().slice(0, 10);

    recordAnalyticsEvent(redis, {
      path: "/api/chat",
      method: "POST",
      status: 200,
      latencyMs: 42,
      ip: "203.0.113.10",
      username: "ryo",
    });

    expect(await redis.hgetall(`analytics:api:daily:${today}`)).toMatchObject({
      calls: "1",
      ai: "1",
      latsum: "42",
      latcnt: "1",
    });
    const summary = await getAnalyticsSummary(redis, 1);
    expect(summary.totals.uniqueVisitors).toBe(1);
    expect(await redis.hgetall(`analytics:daily:${today}`)).toBeNull();
    expect(fake.allKeys().some((key) => key.startsWith("analytics:daily:"))).toBe(false);
  });

  test("ignores legacy API analytics keys", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    const today = new Date().toISOString().slice(0, 10);

    // Seed ONLY legacy keys — they must no longer be read.
    await redis.hset(`analytics:daily:${today}`, {
      calls: "3",
      ai: "2",
      errors: "1",
      latsum: "90",
      latcnt: "3",
    });
    await redis.pfadd(`analytics:uv:${today}`, "ip:203.0.113.10");
    await redis.hset(`analytics:ep:${today}`, { "/api/chat": "2" });
    await redis.hset(`analytics:st:${today}`, { "200": "2", "500": "1" });
    await redis.hset(`analytics:aiu:${today}`, { ryo: "2" });

    const summary = await getAnalyticsSummary(redis, 1);
    expect(summary.totals).toMatchObject({
      calls: 0,
      ai: 0,
      errors: 0,
      uniqueVisitors: 0,
      avgLatencyMs: 0,
    });

    const detail = await getAnalyticsDetail(redis, 1);
    expect(detail.topEndpoints).toEqual([]);
    expect(detail.statusCodes).toEqual([]);
    expect(detail.aiByUser).toEqual([]);
  });

  test("reads canonical API analytics only, ignoring stray legacy hashes", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    const today = new Date().toISOString().slice(0, 10);

    // Stray legacy values that must be ignored.
    await redis.hset(`analytics:daily:${today}`, {
      calls: "3",
      ai: "2",
      errors: "1",
      latsum: "100",
      latcnt: "1",
    });
    await redis.pfadd(`analytics:uv:${today}`, "ip:203.0.113.10");
    await redis.hset(`analytics:ep:${today}`, { "/api/chat": "2" });
    await redis.hset(`analytics:st:${today}`, { "200": "2" });
    await redis.hset(`analytics:aiu:${today}`, { ryo: "2" });

    // Canonical values that should be the only ones returned.
    await redis.hset(`analytics:api:daily:${today}`, {
      calls: "4",
      ai: "1",
      errors: "0",
      latsum: "80",
      latcnt: "4",
    });
    await redis.pfadd(`analytics:api:uv:${today}`, "ip:203.0.113.11");
    await redis.hset(`analytics:api:ep:${today}`, { "/api/chat": "1", "/api/admin": "1" });
    await redis.hset(`analytics:api:st:${today}`, { "200": "1", "500": "1" });
    await redis.hset(`analytics:api:aiu:${today}`, { ryo: "1", anonymous: "1" });

    const summary = await getAnalyticsSummary(redis, 1);
    expect(summary.totals).toMatchObject({
      calls: 4,
      ai: 1,
      errors: 0,
      uniqueVisitors: 1,
      avgLatencyMs: 20,
    });

    const detail = await getAnalyticsDetail(redis, 1);
    expect(detail.topEndpoints).toEqual([
      { endpoint: "/api/chat", count: 1 },
      { endpoint: "/api/admin", count: 1 },
    ]);
    expect(detail.statusCodes).toEqual([
      { status: "200", count: 1 },
      { status: "500", count: 1 },
    ]);
    expect(detail.aiByUser).toEqual([
      { username: "ryo", count: 1 },
      { username: "anonymous", count: 1 },
    ]);
  });

  test("reads AI rate-limit counts from the canonical key the writer uses", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    const today = new Date().toISOString().slice(0, 10);

    // Activity attributed to "alice" in the AI-by-user breakdown.
    await redis.hset(`analytics:api:aiu:${today}`, { alice: "4" });
    // The runtime counter lives under the canonical `rate:` key, NOT `rl:ai:*`.
    const counterKey = getAIRateLimitKey("alice");
    expect(counterKey.startsWith("rate:")).toBe(true);
    await redis.set(counterKey, "9");
    // A stale legacy key must NOT be what the reader picks up.
    await redis.set("rl:ai:alice", "999");

    const detail = await getAnalyticsDetail(redis, 1);
    const alice = detail.aiRateLimits.find((r) => r.identifier === "alice");
    expect(alice).toMatchObject({ currentCount: 9, limit: 15, windowLabel: "5h" });
  });
});
