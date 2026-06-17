import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import redisBackupHandler from "../api/cron/redis-backup";
import { runRedisBackup } from "../api/cron/_redis-backup";
import type { Redis } from "../api/_utils/redis";
import { FakeRedis } from "./fake-redis";

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

function parseGzipJsonLines(body: Buffer): Array<Record<string, unknown>> {
  return gunzipSync(body)
    .toString("utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function createResponse(): VercelResponse & {
  statusCode: number;
  body: unknown;
} {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader() {
      return response;
    },
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(payload: unknown) {
      response.body = payload;
      return response;
    },
    end() {
      return response;
    },
  };
  return response as unknown as VercelResponse & {
    statusCode: number;
    body: unknown;
  };
}

describe("redis backup cron", () => {
  test("creates a gzipped JSONL backup and uploads it through storage", async () => {
    const fake = new FakeRedis();
    fake.setSync("app:string", "hello", { ex: 60 });
    await fake.sadd("app:set", "a", "b");
    await fake.rpush("app:list", "first", "second");
    await fake.hset("app:hash", { one: "1", two: "2" });
    await fake.zadd("app:zset", { member: "low", score: 1.5 });
    await fake.zadd("app:zset", { member: "high", score: 9 });

    let uploadedBody: Buffer | null = null;
    const stats = await runRedisBackup(fake as unknown as Redis, {
      now: new Date("2026-06-17T03:42:00.000Z"),
      scanCount: 2,
      prefix: "ops/redis",
      uploadObject: async (options) => {
        uploadedBody =
          typeof options.body === "string"
            ? Buffer.from(options.body)
            : Buffer.from(options.body);
        return {
          provider: "s3",
          pathname: options.pathname,
          storageUrl: `s3://bucket/${options.pathname}`,
          size: uploadedBody.byteLength,
        };
      },
    });

    expect(stats.scanComplete).toBe(true);
    expect(stats.keysBackedUp).toBe(5);
    expect(stats.byType).toEqual({
      hash: 1,
      list: 1,
      set: 1,
      string: 1,
      zset: 1,
    });
    expect(stats.pathname).toBe("ops/redis/2026-06-17/2026-06-17T03-42-00-000Z.jsonl.gz");
    expect(stats.storageUrl).toBe(`s3://bucket/${stats.pathname}`);
    expect(uploadedBody).toBeTruthy();

    const lines = parseGzipJsonLines(uploadedBody!);
    expect(lines[0]).toMatchObject({
      kind: "metadata",
      version: 1,
      generatedAt: "2026-06-17T03:42:00.000Z",
      format: "ryos-redis-jsonl",
    });

    const byKey = new Map(lines.slice(1).map((line) => [line.key, line]));
    expect(byKey.get("app:string")).toMatchObject({
      redisType: "string",
      ttlSeconds: 60,
      value: "hello",
    });
    expect(byKey.get("app:list")?.value).toEqual(["first", "second"]);
    expect(byKey.get("app:set")?.value).toEqual(["a", "b"]);
    expect(byKey.get("app:hash")?.value).toEqual({ one: "1", two: "2" });
    expect(byKey.get("app:zset")?.value).toEqual([
      { member: "low", score: 1.5 },
      { member: "high", score: 9 },
    ]);
  });

  test("rejects missing and invalid cron secrets before touching Redis", async () => {
    delete process.env.CRON_SECRET;
    const missingSecretRes = createResponse();
    await redisBackupHandler(
      {
        method: "GET",
        url: "/api/cron/redis-backup",
        headers: {},
        query: {},
      } as unknown as VercelRequest,
      missingSecretRes
    );
    expect(missingSecretRes.statusCode).toBe(503);
    expect(missingSecretRes.body).toEqual({
      error: "CRON_SECRET is not configured",
    });

    process.env.CRON_SECRET = "cron-secret";
    const unauthorizedRes = createResponse();
    await redisBackupHandler(
      {
        method: "GET",
        url: "/api/cron/redis-backup",
        headers: { authorization: "Bearer wrong" },
        query: {},
      } as unknown as VercelRequest,
      unauthorizedRes
    );
    expect(unauthorizedRes.statusCode).toBe(401);
    expect(unauthorizedRes.body).toEqual({ error: "Unauthorized" });
  });

  test("is registered in vercel cron config", () => {
    const config = JSON.parse(
      readFileSync(new URL("../vercel.json", import.meta.url), "utf8")
    ) as { crons?: Array<{ path: string; schedule: string }> };

    expect(config.crons).toContainEqual({
      path: "/api/cron/redis-backup",
      schedule: "42 3 * * *",
    });
  });
});
