#!/usr/bin/env bun
/**
 * Unit tests for the Redis browser key-tree helpers (prefix grouping,
 * breadcrumbs, and the client-side flat filter). No server required.
 */

import { describe, test, expect } from "bun:test";
import {
  buildRedisBreadcrumbs,
  buildRedisKeyTree,
  deriveRedisPrefix,
  mergeFoldersWithKnownPrefixes,
  KNOWN_REDIS_PREFIXES,
  type RedisKeyNode,
  type RedisTreeFolder,
} from "../../../src/apps/admin/utils/redisKeyTree";

const KEYS: RedisKeyNode[] = [
  { key: "chat:room:abc", type: "hash", ttl: -1 },
  { key: "chat:room:def", type: "hash", ttl: 120 },
  { key: "chat:users:ryo", type: "string", ttl: -1 },
  { key: "chat:messages", type: "list", ttl: -1 },
  { key: "sync:token:1", type: "string", ttl: 60 },
  { key: "standalone", type: "string", ttl: -1 },
];

describe("buildRedisKeyTree", () => {
  test("groups top-level namespaces into folders and keeps bare keys as leaves", () => {
    const level = buildRedisKeyTree(KEYS, "");

    expect(level.folders.map((f) => f.segment)).toEqual(["chat", "sync"]);
    expect(level.folders[0]).toMatchObject({ segment: "chat", prefix: "chat:", count: 4 });
    expect(level.folders[1]).toMatchObject({ segment: "sync", prefix: "sync:", count: 1 });

    expect(level.leaves.map((l) => l.key)).toEqual(["standalone"]);
    expect(level.leaves[0].label).toBe("standalone");
  });

  test("drills into a prefix and splits folders vs leaves at that level", () => {
    const level = buildRedisKeyTree(KEYS, "chat:");

    expect(level.folders.map((f) => f.segment)).toEqual(["room", "users"]);
    expect(level.folders.find((f) => f.segment === "room")).toMatchObject({
      prefix: "chat:room:",
      count: 2,
    });

    expect(level.leaves.map((l) => l.label)).toEqual(["messages"]);
    expect(level.leaves[0].key).toBe("chat:messages");
  });

  test("returns only leaves at the deepest level", () => {
    const level = buildRedisKeyTree(KEYS, "chat:room:");
    expect(level.folders).toHaveLength(0);
    expect(level.leaves.map((l) => l.label)).toEqual(["abc", "def"]);
  });

  test("ignores keys outside the active prefix", () => {
    const level = buildRedisKeyTree(KEYS, "sync:");
    expect(level.folders.map((f) => f.segment)).toEqual(["token"]);
    expect(level.leaves).toHaveLength(0);
  });

  test("supports a custom separator", () => {
    const slashKeys: RedisKeyNode[] = [
      { key: "a/b/c", type: "string", ttl: -1 },
      { key: "a/b", type: "string", ttl: -1 },
    ];
    const level = buildRedisKeyTree(slashKeys, "a/", "/");
    expect(level.folders.map((f) => f.segment)).toEqual(["b"]);
    expect(level.leaves.map((l) => l.label)).toEqual(["b"]);
  });
});

describe("buildRedisBreadcrumbs", () => {
  test("always starts with a root crumb", () => {
    expect(buildRedisBreadcrumbs("")).toEqual([{ label: "", prefix: "" }]);
  });

  test("expands a nested prefix into cumulative crumbs", () => {
    expect(buildRedisBreadcrumbs("chat:room:")).toEqual([
      { label: "", prefix: "" },
      { label: "chat", prefix: "chat:" },
      { label: "room", prefix: "chat:room:" },
    ]);
  });
});

describe("deriveRedisPrefix", () => {
  test("lands inside the namespace folder for a scoped glob", () => {
    expect(deriveRedisPrefix("chat:users:*")).toBe("chat:users:");
    expect(deriveRedisPrefix("chat:*")).toBe("chat:");
  });

  test("treats a partial trailing segment as a leaf within its parent", () => {
    expect(deriveRedisPrefix("chat:users:ry*")).toBe("chat:users:");
    expect(deriveRedisPrefix("chat:users:ryo")).toBe("chat:users:");
  });

  test("stops at the first glob segment", () => {
    expect(deriveRedisPrefix("chat:*:meta")).toBe("chat:");
  });

  test("returns root for top-level or globless single segments", () => {
    expect(deriveRedisPrefix("*")).toBe("");
    expect(deriveRedisPrefix("chat")).toBe("");
    expect(deriveRedisPrefix("chat*")).toBe("");
    expect(deriveRedisPrefix("")).toBe("");
  });

  test("round-trips a folder prefix through its glob form", () => {
    for (const folder of ["chat:", "chat:users:", "sync2:kv:"]) {
      expect(deriveRedisPrefix(`${folder}*`)).toBe(folder);
    }
  });
});

describe("mergeFoldersWithKnownPrefixes", () => {
  test("keeps discovered folders (with counts) and adds missing known prefixes without a count", () => {
    const discovered: RedisTreeFolder[] = [
      { segment: "chat", prefix: "chat:", count: 12 },
    ];
    const merged = mergeFoldersWithKnownPrefixes(discovered, ["chat", "sync", "memory"]);

    const chat = merged.find((f) => f.segment === "chat");
    const sync = merged.find((f) => f.segment === "sync");
    expect(chat).toMatchObject({ prefix: "chat:", count: 12 });
    expect(sync).toMatchObject({ prefix: "sync:" });
    expect(sync?.count).toBeUndefined();
    // Alphabetically sorted, deduped.
    expect(merged.map((f) => f.segment)).toEqual(["chat", "memory", "sync"]);
  });

  test("does not override a discovered count with a known-prefix placeholder", () => {
    const discovered: RedisTreeFolder[] = [
      { segment: "sync", prefix: "sync:", count: 3 },
    ];
    const merged = mergeFoldersWithKnownPrefixes(discovered, ["sync"]);
    expect(merged).toHaveLength(1);
    expect(merged[0].count).toBe(3);
  });

  test("defaults to the curated known prefix list", () => {
    const merged = mergeFoldersWithKnownPrefixes([]);
    expect(merged.length).toBe(KNOWN_REDIS_PREFIXES.length);
    expect(merged.every((f) => f.count === undefined)).toBe(true);
    expect(merged.map((f) => f.prefix)).toContain("chat:");
  });
});
