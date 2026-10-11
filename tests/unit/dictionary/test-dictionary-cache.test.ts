#!/usr/bin/env bun
import { afterEach, describe, expect, test } from "bun:test";
import {
  DICTIONARY_AI_CACHE_TTL_SECONDS,
  LOOKUP_CACHE_TTL_SECONDS,
  LOOKUP_NOT_FOUND_TTL_SECONDS,
  REMOTE_CACHE_TTL_SECONDS,
  REMOTE_MISS_TTL_SECONDS,
  REMOTE_TIMEOUT_TTL_SECONDS,
  dictionaryHttpCacheControl,
  fetchFreeDictionary,
  remoteCacheTtlFor,
  selectLookupCacheTtl,
  selectRemoteCacheTtl,
  writeLookupCache,
  type RemoteCacheOutcome,
} from "../../../api/dictionary/_helpers/_remote";
import type { DictionaryLookupResponse } from "../../../src/shared/dictionary";
import type { RedisLike } from "../../../api/_utils/redis";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function memoryRedis() {
  const rows = new Map<string, { value: string; ex?: number }>();
  const redis = {
    rows,
    async get<T>(key: string): Promise<T | null> {
      const row = rows.get(key);
      return row ? (JSON.parse(row.value) as T) : null;
    },
    async set(key: string, value: unknown, options?: { ex?: number }) {
      rows.set(key, {
        value: typeof value === "string" ? value : JSON.stringify(value),
        ex: options?.ex,
      });
      return "OK";
    },
  };
  return redis as typeof redis & RedisLike;
}

function response(notFound: boolean): DictionaryLookupResponse {
  return {
    query: "run",
    lang: "en",
    entries: [],
    phrases: [],
    similar: [],
    suggestions: [],
    sources: [],
    notFound,
  };
}

describe("dictionary cache TTLs", () => {
  test("hits last longer than misses, and timeouts are only minutes", () => {
    const outcomes: RemoteCacheOutcome[] = ["hit", "miss", "timeout"];
    expect(outcomes.map(selectRemoteCacheTtl)).toEqual([
      REMOTE_CACHE_TTL_SECONDS,
      REMOTE_MISS_TTL_SECONDS,
      REMOTE_TIMEOUT_TTL_SECONDS,
    ]);
    expect(selectRemoteCacheTtl("hit")).toBe(60 * 60 * 24 * 30);
    expect(selectRemoteCacheTtl("miss")).toBe(60 * 60 * 24);
    expect(selectRemoteCacheTtl("timeout")).toBe(60 * 5);
    expect(selectRemoteCacheTtl("timeout")).toBeLessThan(selectRemoteCacheTtl("miss"));
    expect(selectRemoteCacheTtl("miss")).toBeLessThan(selectRemoteCacheTtl("hit"));
  });

  test("timeouts and 5xx are short-cached; unexpected errors are not cached", () => {
    expect(remoteCacheTtlFor({ word: "run" }, null)).toBe(REMOTE_CACHE_TTL_SECONDS);
    expect(remoteCacheTtlFor(null, null)).toBe(REMOTE_MISS_TTL_SECONDS);
    expect(remoteCacheTtlFor(null, Object.assign(new Error("timed out"), { name: "TimeoutError" }))).toBe(
      REMOTE_TIMEOUT_TTL_SECONDS
    );
    expect(remoteCacheTtlFor(null, new Error("Remote dictionary 503"))).toBe(REMOTE_TIMEOUT_TTL_SECONDS);
    expect(remoteCacheTtlFor(null, new Error("Remote dictionary 400"))).toBeNull();
  });

  test("lookup responses and AI notes keep a long hit TTL", () => {
    expect(selectLookupCacheTtl(false)).toBe(LOOKUP_CACHE_TTL_SECONDS);
    expect(selectLookupCacheTtl(true)).toBe(LOOKUP_NOT_FOUND_TTL_SECONDS);
    expect(selectLookupCacheTtl(true)).toBeLessThan(selectLookupCacheTtl(false));
    expect(DICTIONARY_AI_CACHE_TTL_SECONDS).toBe(60 * 60 * 24 * 30);
    expect(dictionaryHttpCacheControl(false)).toBe(
      "public, max-age=86400, stale-while-revalidate=604800"
    );
    expect(dictionaryHttpCacheControl(true)).toBe("public, max-age=300, stale-while-revalidate=3600");
  });

  test("a timeout is stored briefly and not fetched again until it expires", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    }) as typeof fetch;
    const redis = memoryRedis();
    expect(await fetchFreeDictionary("run", redis)).toBeNull();
    expect(await fetchFreeDictionary("run", redis)).toBeNull();
    expect(calls).toBe(1);
    expect([...redis.rows.values()][0]?.ex).toBe(REMOTE_TIMEOUT_TTL_SECONDS);
  });

  test("a 404 miss is stored for a day and a real entry for 30 days", async () => {
    const redis = memoryRedis();
    globalThis.fetch = (async () => new Response("missing", { status: 404 })) as typeof fetch;
    expect(await fetchFreeDictionary("nope", redis)).toBeNull();
    expect([...redis.rows.values()][0]?.ex).toBe(REMOTE_MISS_TTL_SECONDS);

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify([
          {
            word: "run",
            meanings: [{ partOfSpeech: "verb", definitions: [{ definition: "move fast" }] }],
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof fetch;
    const hit = await fetchFreeDictionary("run", redis);
    expect(hit?.senses[0]?.glosses[0]).toBe("move fast");
    const stored = [...redis.rows.values()].find((row) => row.ex === REMOTE_CACHE_TTL_SECONDS);
    expect(stored?.ex).toBe(60 * 60 * 24 * 30);
  });

  test("final lookup cache TTL follows not-found", async () => {
    const redis = memoryRedis();
    await writeLookupCache(redis, "lookup:run", response(false));
    await writeLookupCache(redis, "lookup:missing", response(true));
    expect(redis.rows.get("lookup:run")?.ex).toBe(60 * 60 * 24 * 30);
    expect(redis.rows.get("lookup:missing")?.ex).toBe(60 * 60 * 6);
  });
});
