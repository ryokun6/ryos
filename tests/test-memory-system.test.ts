#!/usr/bin/env bun
/**
 * Focused tests for memory timestamps/timezones and temporary-memory cleanup.
 */

import type { Redis } from "../api/_utils/redis.js";
import {
  appendDailyNote,
  getDailyNote,
  getTodayDateString,
  getRecentDateStrings,
  buildTimestampMetadata,
  addMemory,
  getMemoryIndex,
  getMemoryDetail,
  saveMemoryIndex,
  cleanupStaleTemporaryMemories,
} from "../api/_utils/_memory.js";
import { describe, test, expect } from "bun:test";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

class FakeRedis {
  private readonly store = new Map<string, unknown>();

  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.store.has(key) ? this.store.get(key) : null) as T | null;
  }

  async set(
    key: string,
    value: unknown,
    options?: { nx?: boolean }
  ): Promise<"OK" | null> {
    if (options?.nx && this.store.has(key)) {
      return null;
    }
    this.store.set(key, value);
    return "OK";
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}

function makeRedis(): Redis {
  return new FakeRedis() as unknown as Redis;
}

describe("Memory System Timestamp Tests", () => {
  describe("timestamp metadata", () => {
    test("buildTimestampMetadata keeps ISO + local timezone fields", async () => {
      const timestamp = Date.UTC(2026, 0, 15, 6, 30, 45); // Jan 15 2026 06:30:45 UTC
      const tokyo = buildTimestampMetadata(timestamp, "Asia/Tokyo");
      const newYork = buildTimestampMetadata(timestamp, "America/New_York");

      expect(tokyo.isoTimestamp).toBe("2026-01-15T06:30:45.000Z");
      expect(tokyo.localDate).toBe("2026-01-15");
      expect(tokyo.localTime).toBe("15:30:45");
      expect(tokyo.timeZone).toBe("Asia/Tokyo");

      expect(newYork.localDate).toBe("2026-01-15");
      expect(newYork.localTime).toBe("01:30:45");
      expect(newYork.timeZone).toBe("America/New_York");
    });
  });

  describe("daily-note timezone bucketing", () => {
    test("appendDailyNote stores explicit timezone + local timestamp fields", async () => {
      const redis = makeRedis();
      const username = "timezone_test_user";
      const tz = "Asia/Tokyo";

      const result = await appendDailyNote(redis, username, "Booked a train ticket", {
        timeZone: tz,
      });
      expect(result.success).toBe(true);

      const todayInTz = getTodayDateString(tz);
      const note = await getDailyNote(redis, username, todayInTz);
      expect(note).not.toBeNull();
      expect(note?.timeZone).toBe(tz);
      expect(note?.entries.length).toBe(1);

      const [entry] = note?.entries || [];
      expect(entry.timeZone).toBe(tz);
      expect(entry.localDate).toBe(todayInTz);
      expect(typeof entry.localTime === "string" && entry.localTime.length > 0).toBe(true);
      expect(typeof entry.isoTimestamp === "string" && entry.isoTimestamp.endsWith("Z")).toBe(true);
    });

    test("appendDailyNote can bucket by a source event timestamp", async () => {
      const redis = makeRedis();
      const username = "source_timestamp_user";
      const tz = "Asia/Tokyo";
      const sourceTimestamp = Date.UTC(2026, 0, 15, 15, 30, 45); // Jan 16 00:30:45 in Tokyo

      const result = await appendDailyNote(redis, username, "Booked a midnight train", {
        timeZone: tz,
        timestamp: sourceTimestamp,
      });
      expect(result.success).toBe(true);
      expect(result.date).toBe("2026-01-16");

      const note = await getDailyNote(redis, username, "2026-01-16");
      expect(note).not.toBeNull();
      expect(note?.entries).toHaveLength(1);

      const [entry] = note?.entries || [];
      expect(entry.timestamp).toBe(sourceTimestamp);
      expect(entry.isoTimestamp).toBe("2026-01-15T15:30:45.000Z");
      expect(entry.localDate).toBe("2026-01-16");
      expect(entry.localTime).toBe("00:30:45");
      expect(entry.timeZone).toBe(tz);
    });

    test("getRecentDateStrings returns unique descending dates", async () => {
      const tz = "America/Los_Angeles";
      const dates = getRecentDateStrings(5, tz);
      expect(dates.length).toBe(5);
      expect(new Set(dates).size).toBe(5);
      expect(dates[0]).toBe(getTodayDateString(tz));
      expect(dates[0] > dates[1]).toBe(true);
    });
  });

  describe("temporary memory cleanup", () => {
    test("cleanupStaleTemporaryMemories removes stale temporary context only", async () => {
      const redis = makeRedis();
      const username = "cleanup_test_user";
      const now = Date.now();

      await addMemory(
        redis,
        username,
        "context",
        "User is traveling this week",
        "User is on a work trip and has meetings tomorrow in Berlin.",
      );
      await addMemory(
        redis,
        username,
        "work",
        "User works as a platform engineer",
        "They are a platform engineer focused on reliability.",
      );

      const index = await getMemoryIndex(redis, username);
      expect(index).not.toBeNull();
      index!.memories = index!.memories.map((entry) =>
        entry.key === "context"
          ? { ...entry, updatedAt: now - 9 * DAY_IN_MS }
          : { ...entry, updatedAt: now - 20 * DAY_IN_MS }
      );
      await saveMemoryIndex(redis, username, index!);

      const cleanup = await cleanupStaleTemporaryMemories(redis, username, {
        now,
        retentionDays: 7,
      });
      expect(cleanup.removed).toBe(1);
      expect(cleanup.removedKeys[0]).toBe("context");

      const afterIndex = await getMemoryIndex(redis, username);
      expect(afterIndex?.memories.some((m) => m.key === "work")).toBe(true);
      expect(afterIndex?.memories.some((m) => m.key === "context")).toBe(false);

      const removedDetail = await getMemoryDetail(redis, username, "context");
      expect(removedDetail).toBe(null);
    });
  });
});
