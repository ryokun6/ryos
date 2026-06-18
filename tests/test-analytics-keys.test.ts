import { describe, expect, test } from "bun:test";
import type { Redis } from "../api/_utils/redis";
import { recordAnalyticsEvent } from "../api/_utils/_analytics";
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
    expect(await redis.hgetall(`analytics:daily:${today}`)).toBeNull();
    expect(fake.allKeys().some((key) => key.startsWith("analytics:daily:"))).toBe(false);
  });
});
