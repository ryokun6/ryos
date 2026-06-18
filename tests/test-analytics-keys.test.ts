import { describe, expect, test } from "bun:test";
import type { Redis } from "../api/_utils/redis";
import {
  getAnalyticsDetail,
  getAnalyticsSummary,
  recordAnalyticsEvent,
} from "../api/_utils/_analytics";
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

  test("reads legacy API analytics when canonical counters are absent", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    const today = new Date().toISOString().slice(0, 10);

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
      calls: 3,
      ai: 2,
      errors: 1,
      uniqueVisitors: 1,
      avgLatencyMs: 30,
    });

    const detail = await getAnalyticsDetail(redis, 1);
    expect(detail.topEndpoints).toEqual([{ endpoint: "/api/chat", count: 2 }]);
    expect(detail.statusCodes).toEqual([
      { status: "200", count: 2 },
      { status: "500", count: 1 },
    ]);
    expect(detail.aiByUser).toEqual([{ username: "ryo", count: 2 }]);
  });

  test("merges canonical and legacy analytics hashes during cutover", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    const today = new Date().toISOString().slice(0, 10);

    await redis.hset(`analytics:daily:${today}`, {
      calls: "3",
      ai: "2",
      errors: "1",
      latsum: "100",
      latcnt: "1",
    });
    await redis.pfadd(`analytics:uv:${today}`, "ip:203.0.113.10");
    await redis.hset(`analytics:api:daily:${today}`, {
      calls: "4",
      ai: "1",
      errors: "0",
      latsum: "80",
      latcnt: "4",
    });
    await redis.pfadd(`analytics:api:uv:${today}`, "ip:203.0.113.11");
    await redis.hset(`analytics:ep:${today}`, { "/api/chat": "2" });
    await redis.hset(`analytics:api:ep:${today}`, { "/api/chat": "1", "/api/admin": "1" });
    await redis.hset(`analytics:st:${today}`, { "200": "2" });
    await redis.hset(`analytics:api:st:${today}`, { "200": "1", "500": "1" });
    await redis.hset(`analytics:aiu:${today}`, { ryo: "2" });
    await redis.hset(`analytics:api:aiu:${today}`, { ryo: "1", anonymous: "1" });

    const summary = await getAnalyticsSummary(redis, 1);
    expect(summary.totals).toMatchObject({
      calls: 7,
      ai: 3,
      errors: 1,
      uniqueVisitors: 2,
      avgLatencyMs: 36,
    });

    const detail = await getAnalyticsDetail(redis, 1);
    expect(detail.topEndpoints).toEqual([
      { endpoint: "/api/chat", count: 3 },
      { endpoint: "/api/admin", count: 1 },
    ]);
    expect(detail.statusCodes).toEqual([
      { status: "200", count: 3 },
      { status: "500", count: 1 },
    ]);
    expect(detail.aiByUser).toEqual([
      { username: "ryo", count: 3 },
      { username: "anonymous", count: 1 },
    ]);
  });
});
