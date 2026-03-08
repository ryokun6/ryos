import { afterEach, describe, expect, test } from "bun:test";
import { getRedisBackend } from "../api/_utils/redis";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
});

describe("self-host redis backend selection", () => {
  test("prefers REDIS_URL when both backends are present", () => {
    process.env.REDIS_URL = "redis://127.0.0.1:6379/0";
    process.env.REDIS_KV_REST_API_URL = "https://example.upstash.io";
    process.env.REDIS_KV_REST_API_TOKEN = "token";
    delete process.env.REDIS_PROVIDER;

    expect(getRedisBackend()).toBe("redis-url");
  });

  test("respects explicit upstash selection", () => {
    delete process.env.REDIS_URL;
    process.env.REDIS_PROVIDER = "upstash-rest";
    process.env.REDIS_KV_REST_API_URL = "https://example.upstash.io";
    process.env.REDIS_KV_REST_API_TOKEN = "token";

    expect(getRedisBackend()).toBe("upstash-rest");
  });

  test("throws when explicit provider configuration is incomplete", () => {
    process.env.REDIS_PROVIDER = "redis-url";
    delete process.env.REDIS_URL;

    expect(() => getRedisBackend()).toThrow(
      "REDIS_PROVIDER requests standard Redis"
    );
  });
});
