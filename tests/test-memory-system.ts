#!/usr/bin/env bun
/**
 * Focused tests for memory timestamps/timezones and temporary-memory cleanup.
 */

import type { Redis } from "@upstash/redis";
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
} from "../_api/_utils/_memory.js";
import {
  header,
  section,
  runTest,
  printSummary,
  clearResults,
  assert,
  assertEq,
} from "./test-utils";

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

export async function runMemorySystemTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Memory System Timestamp Tests"));

  console.log(section("timestamp metadata"));
  await runTest("buildTimestampMetadata keeps ISO + local timezone fields", async () => {
    const timestamp = Date.UTC(2026, 0, 15, 6, 30, 45); // Jan 15 2026 06:30:45 UTC
    const tokyo = buildTimestampMetadata(timestamp, "Asia/Tokyo");
    const newYork = buildTimestampMetadata(timestamp, "America/New_York");

    assertEq(tokyo.isoTimestamp, "2026-01-15T06:30:45.000Z");
    assertEq(tokyo.localDate, "2026-01-15");
    assertEq(tokyo.localTime, "15:30:45");
    assertEq(tokyo.timeZone, "Asia/Tokyo");

    assertEq(newYork.localDate, "2026-01-15");
    assertEq(newYork.localTime, "01:30:45");
    assertEq(newYork.timeZone, "America/New_York");
  });

  console.log(section("daily-note timezone bucketing"));
  await runTest("appendDailyNote stores explicit timezone + local timestamp fields", async () => {
    const redis = makeRedis();
    const username = "timezone_test_user";
    const tz = "Asia/Tokyo";

    const result = await appendDailyNote(redis, username, "Booked a train ticket", {
      timeZone: tz,
    });
    assert(result.success, "Expected appendDailyNote success");

    const todayInTz = getTodayDateString(tz);
    const note = await getDailyNote(redis, username, todayInTz);
    assert(note !== null, `Expected daily note for ${todayInTz}`);
    assertEq(note?.timeZone, tz);
    assertEq(note?.entries.length, 1);

    const [entry] = note?.entries || [];
    assertEq(entry.timeZone, tz);
    assertEq(entry.localDate, todayInTz);
    assert(typeof entry.localTime === "string" && entry.localTime.length > 0, "Expected localTime");
    assert(typeof entry.isoTimestamp === "string" && entry.isoTimestamp.endsWith("Z"), "Expected ISO timestamp");
  });

  await runTest("getRecentDateStrings returns unique descending dates", async () => {
    const tz = "America/Los_Angeles";
    const dates = getRecentDateStrings(5, tz);
    assertEq(dates.length, 5);
    assertEq(new Set(dates).size, 5);
    assertEq(dates[0], getTodayDateString(tz));
    assert(dates[0] > dates[1], "Expected descending date order");
  });

  console.log(section("temporary memory cleanup"));
  await runTest("cleanupStaleTemporaryMemories removes stale temporary context only", async () => {
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
    assert(index !== null, "Expected memory index");
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
    assertEq(cleanup.removed, 1);
    assertEq(cleanup.removedKeys[0], "context");

    const afterIndex = await getMemoryIndex(redis, username);
    assert(afterIndex?.memories.some((m) => m.key === "work"), "Expected stable work memory to remain");
    assert(!afterIndex?.memories.some((m) => m.key === "context"), "Expected stale context memory removed");

    const removedDetail = await getMemoryDetail(redis, username, "context");
    assertEq(removedDetail, null, "Expected deleted detail for removed temporary memory");
  });

  return printSummary();
}

if (import.meta.main) {
  runMemorySystemTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
