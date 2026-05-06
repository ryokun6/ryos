#!/usr/bin/env bun

import { describe, expect, test } from "bun:test";
import {
  getProductAnalyticsDetail,
  recordProductAnalyticsEvents,
  sanitizeProductAnalyticsEvent,
} from "../api/_utils/_analytics";
import type { Redis } from "../api/_utils/redis";

class FakePipeline {
  private readonly ops: Array<() => unknown> = [];

  constructor(private readonly redis: FakeRedis) {}

  hincrby(key: string, field: string, increment: number): this {
    this.ops.push(() => {
      const hash = this.redis.hashes.get(key) ?? {};
      hash[field] = String((parseInt(hash[field] || "0", 10) || 0) + increment);
      this.redis.hashes.set(key, hash);
      return Number(hash[field]);
    });
    return this;
  }

  hgetall(key: string): this {
    this.ops.push(() => this.redis.hashes.get(key) ?? null);
    return this;
  }

  pfadd(key: string, ...elements: string[]): this {
    this.ops.push(() => {
      const set = this.redis.hll.get(key) ?? new Set<string>();
      for (const element of elements) set.add(element);
      this.redis.hll.set(key, set);
      return 1;
    });
    return this;
  }

  pfcount(...keys: string[]): this {
    this.ops.push(() => {
      const union = new Set<string>();
      for (const key of keys) {
        for (const value of this.redis.hll.get(key) ?? []) union.add(value);
      }
      return union.size;
    });
    return this;
  }

  expire(key: string, seconds: number): this {
    this.ops.push(() => {
      this.redis.expirations.set(key, seconds);
      return 1;
    });
    return this;
  }

  get(key: string): this {
    this.ops.push(() => this.redis.values.get(key) ?? null);
    return this;
  }

  set(): this { return this; }
  del(): this { return this; }
  sadd(): this { return this; }
  srem(): this { return this; }
  zremrangebyscore(): this { return this; }
  zcard(): this { return this; }

  async exec(): Promise<unknown[]> {
    return this.ops.map((op) => op());
  }
}

class FakeRedis {
  readonly hashes = new Map<string, Record<string, string>>();
  readonly hll = new Map<string, Set<string>>();
  readonly expirations = new Map<string, number>();
  readonly values = new Map<string, unknown>();

  pipeline(): FakePipeline {
    return new FakePipeline(this);
  }
}

describe("product analytics aggregation", () => {
  test("sanitizes sensitive properties and invalid dimensions", () => {
    const sanitized = sanitizeProductAnalyticsEvent({
      name: "chats:text",
      appId: "chats",
      category: "events",
      properties: {
        message: "secret raw text",
        prompt: "secret prompt",
        textLength: 42,
        hasUrl: true,
      },
    });

    expect(sanitized?.properties.message).toBeUndefined();
    expect(sanitized?.properties.prompt).toBeUndefined();
    expect(sanitized?.properties.textLength).toBe(42);
    expect(sanitized?.properties.hasUrl).toBe(true);
    expect(sanitizeProductAnalyticsEvent({ name: "<script>" })).toBeNull();
    expect(sanitizeProductAnalyticsEvent({ name: "app:launch", appId: "evil-app" })?.appId).toBeUndefined();
  });

  test("records product events into daily breakdowns", async () => {
    const redis = new FakeRedis();
    recordProductAnalyticsEvents(
      redis as unknown as Redis,
      {
        events: [
          { name: "session:start", clientId: "client-a", source: "web" },
          { name: "page:view", path: "/chats?x=1", clientId: "client-a", source: "web" },
          { name: "app:launch", appId: "chats", clientId: "client-a", source: "web" },
          { name: "maps:search", appId: "maps", clientId: "client-b", source: "tauri" },
        ],
      },
      { ip: "127.0.0.1" }
    );

    await Promise.resolve();

    const detail = await getProductAnalyticsDetail(redis as unknown as Redis, 1);
    expect(detail.summary.totals.events).toBe(4);
    expect(detail.summary.totals.sessions).toBe(1);
    expect(detail.summary.totals.pageViews).toBe(1);
    expect(detail.summary.totals.appLifecycle).toBe(1);
    expect(detail.summary.totals.uniqueVisitors).toBe(2);
    expect(detail.topEvents.find((e) => e.name === "app:launch")?.count).toBe(1);
    expect(detail.topApps.find((e) => e.name === "chats")?.count).toBe(1);
    expect(detail.topApps.find((e) => e.name === "maps")?.count).toBe(1);
    expect(detail.sources.find((e) => e.name === "web")?.count).toBe(3);
    expect(detail.topPaths.find((e) => e.name === "/chats")?.count).toBe(1);
  });

  test("aggregates top songs, sites and countries", async () => {
    const redis = new FakeRedis();
    recordProductAnalyticsEvents(
      redis as unknown as Redis,
      {
        events: [
          {
            name: "ipod:song_play",
            appId: "ipod",
            properties: { title: "Yesterday", artist: "The Beatles" },
          },
          {
            name: "ipod:song_play",
            appId: "ipod",
            properties: { title: "Yesterday", artist: "The Beatles" },
          },
          {
            name: "media:song_play",
            appId: "karaoke",
            properties: { title: "Imagine", artist: "John Lennon" },
          },
          {
            name: "internet-explorer:navigation_success",
            appId: "internet-explorer",
            properties: { host: "example.com", protocol: "https" },
          },
          {
            name: "internet-explorer:navigation_success",
            appId: "internet-explorer",
            properties: { host: "example.com", protocol: "https" },
          },
          {
            name: "internet-explorer:navigation_success",
            appId: "internet-explorer",
            properties: { host: "wikipedia.org", protocol: "https" },
          },
        ],
      },
      { ip: "8.8.8.8", country: "us" }
    );

    await Promise.resolve();

    const detail = await getProductAnalyticsDetail(redis as unknown as Redis, 1);
    expect(detail.topSongs.find((e) => e.name === "The Beatles — Yesterday")?.count).toBe(2);
    expect(detail.topSongs.find((e) => e.name === "John Lennon — Imagine")?.count).toBe(1);
    expect(detail.topSites.find((e) => e.name === "example.com")?.count).toBe(2);
    expect(detail.topSites.find((e) => e.name === "wikipedia.org")?.count).toBe(1);
    // 6 events × 1 country bump each = 6 (we count one country bucket per event,
    // not per session, so high-volume countries dominate naturally).
    expect(detail.topCountries.find((e) => e.name === "US")?.count).toBe(6);
  });

  test("ignores client-supplied country and skips when geo unresolved", async () => {
    const redis = new FakeRedis();
    recordProductAnalyticsEvents(
      redis as unknown as Redis,
      {
        events: [
          {
            name: "ipod:song_play",
            appId: "ipod",
            // Even if a malicious client sets a `country` property here, it
            // must NOT influence the top-countries breakdown.
            properties: { title: "Spoofed", artist: "Bad Actor", country: "ZZ" },
          },
        ],
      },
      { ip: "8.8.8.8" }
    );

    await Promise.resolve();

    const detail = await getProductAnalyticsDetail(redis as unknown as Redis, 1);
    expect(detail.topCountries).toEqual([]);
  });
});
