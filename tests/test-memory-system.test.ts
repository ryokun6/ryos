#!/usr/bin/env bun
/**
 * Focused tests for memory timestamps/timezones and temporary-memory cleanup.
 */

import type { Redis } from "../api/_utils/redis.js";
import {
  appendDailyNote,
  deleteAllUserMemories,
  getDailyNoteDatesIndexKey,
  getDailyNoteKey,
  getDailyNote,
  getTodayDateString,
  getRecentDateStrings,
  buildTimestampMetadata,
  addMemory,
  getMemoryIndex,
  getMemoryDetail,
  saveMemoryIndex,
  cleanupStaleTemporaryMemories,
  upsertMemory,
  DAILY_NOTES_TTL_SECONDS,
} from "../api/_utils/_memory.js";
import { executeMemoryRead } from "../api/chat/tools/executors.js";
import { describe, test, expect } from "bun:test";
import { redisKeys } from "../src/shared/redisKeys.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

class FakeRedis {
  private readonly store = new Map<string, unknown>();
  private readonly expirations = new Map<string, number>();
  readonly scanPatterns: string[] = [];
  onBlockedSet: ((key: string) => void) | null = null;

  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.store.has(key) ? this.store.get(key) : null) as T | null;
  }

  async set(
    key: string,
    value: unknown,
    options?: { nx?: boolean; ex?: number }
  ): Promise<"OK" | null> {
    if (options?.nx && this.store.has(key)) {
      this.onBlockedSet?.(key);
      return null;
    }
    this.store.set(key, value);
    if (options?.ex !== undefined) {
      this.expirations.set(key, options.ex);
    }
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.store.delete(key)) deleted += 1;
      this.expirations.delete(key);
    }
    return deleted;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    const existing = this.store.get(key);
    const values =
      existing instanceof Set ? existing : new Set<string>();
    const sizeBefore = values.size;
    for (const member of members) values.add(member);
    this.store.set(key, values);
    return values.size - sizeBefore;
  }

  async smembers<T = string[]>(key: string): Promise<T> {
    const existing = this.store.get(key);
    return (
      existing instanceof Set ? [...existing] : []
    ) as T;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (!this.store.has(key)) return 0;
    this.expirations.set(key, seconds);
    return 1;
  }

  async scan(
    cursor: number | string,
    options?: { match?: string; count?: number }
  ): Promise<[string | number, string[]]> {
    const pattern = options?.match ?? "*";
    this.scanPatterns.push(pattern);
    const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
    const matches = [...this.store.keys()]
      .filter((key) => key.startsWith(prefix))
      .sort();
    const offset = Number(cursor);
    const keys = matches.slice(offset, offset + 1);
    const nextCursor = offset + keys.length < matches.length
      ? offset + keys.length
      : 0;
    return [nextCursor, keys];
  }

  async eval<T = unknown>(
    script: string,
    keys: string[],
    args: Array<string | number>
  ): Promise<T> {
    if (script.includes("local deletedCount = 0")) {
      this.store.set(keys[0] ?? "", String(args[0]));
      let deletedCount = 0;
      for (const key of keys.slice(1)) {
        deletedCount += await this.del(key);
      }
      return deletedCount as T;
    }
    if (script.includes('redis.call("SET", KEYS[2], ARGV[2])')) {
      this.store.set(keys[0] ?? "", String(args[0]));
      this.store.set(keys[1] ?? "", String(args[1]));
      return 1 as T;
    }
    if (script.includes('redis.call("SADD"')) {
      const noteKey = keys[0] ?? "";
      const indexKey = keys[1] ?? "";
      const ttl = Number(args[1]);
      this.store.set(noteKey, String(args[0]));
      this.expirations.set(noteKey, ttl);
      await this.sadd(indexKey, String(args[2]));
      this.expirations.set(indexKey, ttl);
      return 1 as T;
    }
    if (
      script.includes('redis.call("GET", KEYS[1]) == ARGV[1]') &&
      this.store.get(keys[0] ?? "") === args[0]
    ) {
      return (await this.del(keys[0] ?? "")) as T;
    }
    return 0 as T;
  }

  getExpiration(key: string): number | null {
    return this.expirations.get(key) ?? null;
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
      expect(typeof entry.localTime).toBe("string");
      expect(entry.localTime.length).toBeGreaterThan(0);
      expect(typeof entry.isoTimestamp).toBe("string");
      expect(entry.isoTimestamp.endsWith("Z")).toBe(true);
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

    test("purge deletes indexed notes written today for old source dates", async () => {
      const fakeRedis = new FakeRedis();
      const redis = fakeRedis as unknown as Redis;
      const username = "old_source_purge_user";
      const now = Date.UTC(2026, 6, 6, 12);
      const oldSourceTimestamp = now - 90 * DAY_IN_MS;
      const oldDate = new Date(oldSourceTimestamp).toISOString().slice(0, 10);
      const recentDate = new Date(now).toISOString().slice(0, 10);

      const result = await appendDailyNote(
        redis,
        username,
        "Remember this old event",
        { timeZone: "UTC", timestamp: oldSourceTimestamp }
      );
      expect(result.date).toBe(oldDate);
      expect(
        await fakeRedis.smembers(getDailyNoteDatesIndexKey(username))
      ).toEqual([oldDate]);
      expect(
        fakeRedis.getExpiration(getDailyNoteDatesIndexKey(username))
      ).toBe(DAILY_NOTES_TTL_SECONDS);

      await fakeRedis.set(
        getDailyNoteKey(username, recentDate),
        JSON.stringify({
          date: recentDate,
          timeZone: "UTC",
          entries: [],
          processedForMemories: false,
          updatedAt: now,
        })
      );

      await deleteAllUserMemories(redis, username, now);

      expect(await getDailyNote(redis, username, oldDate)).toBeNull();
      expect(await getDailyNote(redis, username, recentDate)).toBeNull();
      expect(
        await fakeRedis.smembers(getDailyNoteDatesIndexKey(username))
      ).toEqual([]);
    });

    test("purge scans and deletes unindexed historical daily-note keys", async () => {
      const fakeRedis = new FakeRedis();
      const redis = fakeRedis as unknown as Redis;
      const username = "scan_purge_user";
      const dates = ["1998-04-03", "2001-09-12"];

      for (const date of dates) {
        await fakeRedis.set(
          getDailyNoteKey(username, date),
          JSON.stringify({
            date,
            timeZone: "UTC",
            entries: [],
            processedForMemories: false,
            updatedAt: Date.now(),
          }),
          { ex: DAILY_NOTES_TTL_SECONDS }
        );
      }
      await fakeRedis.set(
        getDailyNoteKey("other_scan_user", dates[0]),
        JSON.stringify({
          date: dates[0],
          timeZone: "UTC",
          entries: [],
          processedForMemories: false,
          updatedAt: Date.now(),
        }),
        { ex: DAILY_NOTES_TTL_SECONDS }
      );
      expect(
        await fakeRedis.smembers(getDailyNoteDatesIndexKey(username))
      ).toEqual([]);

      await deleteAllUserMemories(redis, username);

      for (const date of dates) {
        expect(await getDailyNote(redis, username, date)).toBeNull();
      }
      expect(
        await getDailyNote(redis, "other_scan_user", dates[0])
      ).not.toBeNull();
      expect(
        fakeRedis.scanPatterns.filter(
          (pattern) => pattern === "memory:user:scan_purge_user:daily:*"
        )
      ).toHaveLength(2);
      expect(fakeRedis.scanPatterns).toContain(
        "memory:user:scan_purge_user:detail:*"
      );
    });

    test("purge scans and deletes orphaned long-term memory details", async () => {
      const fakeRedis = new FakeRedis();
      const redis = fakeRedis as unknown as Redis;
      const username = "orphan_detail_purge_user";
      const orphanKey = redisKeys.memory.detail(username, "private_history");
      const otherKey = redisKeys.memory.detail(
        "other_orphan_detail_user",
        "private_history"
      );

      await fakeRedis.set(
        orphanKey,
        JSON.stringify({
          key: "private_history",
          content: "private old-account data",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      );
      await fakeRedis.set(otherKey, "other-user-data");

      const orphanRead = await executeMemoryRead(
        { type: "long_term", key: "private_history" },
        {
          redis,
          username,
          env: {},
          log: () => {},
          logError: () => {},
        }
      );
      expect(orphanRead.success).toBe(false);

      await deleteAllUserMemories(redis, username);

      expect(await fakeRedis.get(orphanKey)).toBeNull();
      expect(await fakeRedis.get(otherKey)).toBe("other-user-data");
      expect(fakeRedis.scanPatterns).toContain(
        "memory:user:orphan_detail_purge_user:detail:*"
      );
    });

    test("purge does not delete a processing lock owned by another job", async () => {
      const fakeRedis = new FakeRedis();
      const redis = fakeRedis as unknown as Redis;
      const username = "active_processor_user";
      const lockKey = redisKeys.memory.processingLock(username);
      await fakeRedis.set(lockKey, "active-processor-token", { ex: 120 });

      await deleteAllUserMemories(redis, username);

      expect(await fakeRedis.get(lockKey)).toBe("active-processor-token");
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

  describe("reset-memory operation idempotency", () => {
    test("a partial reset snapshot retry does not duplicate daily or long-term writes", async () => {
      const redis = makeRedis();
      const username = "reset_retry_user";
      const snapshotId = "11111111-1111-4111-8111-111111111111";
      const timestamp = Date.UTC(2026, 6, 6, 12);
      const dailyOperationId = `${snapshotId}:daily:0`;
      const longTermOperationId = `${snapshotId}:long_term:0`;

      const firstDaily = await appendDailyNote(
        redis,
        username,
        "User is moving to Lisbon.",
        {
          timeZone: "UTC",
          timestamp,
          operationId: dailyOperationId,
        }
      );
      const firstLongTerm = await upsertMemory(
        redis,
        username,
        "location",
        "User is moving to Lisbon",
        "The user plans to move to Lisbon.",
        "add",
        { operationId: longTermOperationId }
      );
      expect(firstDaily.applied).not.toBe(false);
      expect(firstLongTerm.applied).not.toBe(false);

      // Simulate retrying the still-pending snapshot after a later write failed.
      const retryDaily = await appendDailyNote(
        redis,
        username,
        "User is moving to Lisbon.",
        {
          timeZone: "UTC",
          timestamp,
          operationId: dailyOperationId,
        }
      );
      const retryLongTerm = await upsertMemory(
        redis,
        username,
        "location",
        "Retry output must not overwrite the first result",
        "Duplicate retry content",
        "update",
        { operationId: longTermOperationId }
      );

      expect(retryDaily.applied).toBe(false);
      expect(retryLongTerm.applied).toBe(false);
      const dailyNote = await getDailyNote(redis, username, firstDaily.date!);
      expect(dailyNote?.entries).toHaveLength(1);
      expect(dailyNote?.entries[0]?.operationId).toBe(dailyOperationId);
      const detail = await getMemoryDetail(redis, username, "location");
      expect(detail?.content).toBe("The user plans to move to Lisbon.");
      expect(detail?.recentOperationIds).toContain(longTermOperationId);
      expect(
        detail?.content.match(/Lisbon/g)?.length
      ).toBe(1);
    });
  });
});
