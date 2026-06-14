#!/usr/bin/env bun
/**
 * Unit tests for the Redis browser key-tree helpers (prefix grouping,
 * breadcrumbs, and the client-side flat filter). No server required.
 */

import { describe, test, expect } from "bun:test";
import {
  buildRedisBreadcrumbs,
  buildRedisKeyTree,
  filterRedisKeys,
  type RedisKeyNode,
} from "../src/apps/admin/utils/redisKeyTree";

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

describe("filterRedisKeys", () => {
  test("returns empty for a blank query", () => {
    expect(filterRedisKeys(KEYS, "   ")).toEqual([]);
  });

  test("matches case-insensitively across the full key and sorts results", () => {
    const results = filterRedisKeys(KEYS, "ROOM");
    expect(results.map((r) => r.key)).toEqual(["chat:room:abc", "chat:room:def"]);
    expect(results[0].label).toBe("chat:room:abc");
  });

  test("matches substrings anywhere in the key", () => {
    const results = filterRedisKeys(KEYS, "ryo");
    expect(results.map((r) => r.key)).toEqual(["chat:users:ryo"]);
  });
});
