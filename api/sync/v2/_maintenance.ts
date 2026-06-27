/**
 * Cloud Sync v2 maintenance (cron):
 *
 * 1. **Blob garbage collection** — content-addressed blobs whose digest is
 *    no longer referenced by any KV document are deleted with a
 *    mark-and-sweep grace period (a blob must be unreferenced across two
 *    runs spaced beyond the grace window before its object is removed).
 * 2. **User record healing** — `chat:users:*` records are meant to persist
 *    forever, but an old room-message code path attached a TTL on each
 *    send; any such stale TTL is removed (PERSIST).
 *
 * Work is bounded per invocation: users are discovered by scanning
 * `sync:v2:user:*:kv` with a cursor persisted in Redis, so successive cron
 * runs walk the whole user base in batches. Pre-canonical `sync2:*` keys are
 * no longer read (runtime is canonical-only since #1536).
 */

import type { Redis } from "../../_utils/redis.js";
import { deleteStoredObject } from "../../_utils/storage.js";
import { getSyncBlobRef } from "../../../src/shared/sync2/types.js";
import {
  parseRedisJson,
  sync2BlobsKey,
  sync2KvKey,
} from "./_core.js";
import { redisKeys } from "../../../src/shared/redisKeys.js";

/** Unreferenced blobs must stay marked this long before deletion. */
export const BLOB_GC_GRACE_MS = 24 * 60 * 60 * 1000;

const USER_KV_SCAN_PATTERN = "sync:v2:user:*:kv";

export interface SyncMaintenanceOptions {
  /** Stop discovering users once at least this many are collected. */
  maxUsers?: number;
  /** Storage object deletions per invocation (shared budget). */
  maxStorageDeletes?: number;
  /** Grace period before an unreferenced blob is deleted. */
  graceMs?: number;
  now?: number;
  /** SCAN count hint per iteration. */
  scanCount?: number;
  /** Injectable for tests. */
  deleteObject?: (storageUrl: string) => Promise<void>;
}

export interface SyncMaintenanceStats {
  usersProcessed: number;
  /** True when the scan wrapped — the whole user base has been visited. */
  scanComplete: boolean;
  blobsMarked: number;
  blobsUnmarked: number;
  blobsDeleted: number;
  userRecordsPersisted: number;
  errors: number;
}

interface BlobRegistryEntry {
  url: string;
  size?: number;
  /** Mark timestamp (ms) set when the blob was first seen unreferenced. */
  gc?: number;
}

function getUsernameFromKvKey(key: string): string | null {
  const canonicalMatch = /^sync:v2:user:([^:]+):kv$/.exec(key);
  return canonicalMatch?.[1] ? decodeURIComponent(canonicalMatch[1]) : null;
}

/** Normalize persisted scan cursors (plain string, JSON blob, or parsed object). */
function parseMaintenanceCursor(raw: unknown): { cursor: string } {
  let parsed: { cursor?: unknown } | null = null;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    parsed = raw as { cursor?: unknown };
  } else if (typeof raw === "string" && raw.trim().startsWith("{")) {
    parsed = parseRedisJson<{ cursor?: unknown }>(raw);
  }

  if (parsed) {
    const cursor =
      typeof parsed.cursor === "number" || typeof parsed.cursor === "string"
        ? String(parsed.cursor)
        : "0";
    return { cursor };
  }

  if (typeof raw === "number" || typeof raw === "string") {
    return { cursor: String(raw) };
  }
  return { cursor: "0" };
}

/**
 * Discover the next batch of v2 users by scanning their KV hash keys.
 * Every user returned by a consumed scan iteration is processed (never
 * sliced away), so the persisted cursor cannot skip anyone; `maxUsers` only
 * decides when to stop consuming further iterations.
 */
async function scanUserBatch(
  redis: Redis,
  maxUsers: number,
  scanCount: number
): Promise<{ usernames: string[]; scanComplete: boolean }> {
  // `get` may return a string, number, or — when Upstash auto-deserializes the
  // persisted JSON cursor — an object. parseMaintenanceCursor handles all three.
  const startCursor =
    (await redis.get<unknown>(redisKeys.sync.maintenanceCursor())) ??
    "0";
  const startState = parseMaintenanceCursor(startCursor);
  let cursor: string | number = startState.cursor;
  const usernames: string[] = [];
  let scanComplete = false;

  for (let iterations = 0; iterations < 50; iterations += 1) {
    const [nextCursor, keys] = await redis.scan(cursor, {
      match: USER_KV_SCAN_PATTERN,
      count: scanCount,
    });
    for (const key of keys) {
      const username = getUsernameFromKvKey(key);
      if (username && !usernames.includes(username)) {
        usernames.push(username);
      }
    }
    cursor = String(nextCursor);
    if (cursor === "0" || usernames.length >= maxUsers) {
      break;
    }
  }
  scanComplete = cursor === "0";

  if (scanComplete) {
    await redis.del(redisKeys.sync.maintenanceCursor());
  } else {
    await redis.set(redisKeys.sync.maintenanceCursor(), cursor, {
      ex: 7 * 24 * 60 * 60,
    });
  }

  return { usernames, scanComplete };
}

/** Collect every blob digest and storage URL referenced by live KV docs. */
async function collectReferencedBlobs(
  redis: Redis,
  username: string
): Promise<{ hashes: Set<string>; urls: Set<string> }> {
  const hashes = new Set<string>();
  const urls = new Set<string>();
  const raw = await redis.hgetall<Record<string, unknown>>(sync2KvKey(username));
  if (!raw) return { hashes, urls };

  for (const value of Object.values(raw)) {
    const entry = parseRedisJson<{ v?: unknown; del?: boolean }>(value);
    if (!entry || entry.del) continue;
    const ref = getSyncBlobRef(entry.v);
    if (!ref) continue;
    const digest = ref.sha256 || ref.sig;
    if (digest) hashes.add(digest);
    urls.add(ref.url);
  }
  return { hashes, urls };
}

/**
 * User records are meant to persist forever; remove TTLs left behind by the
 * removed expire-on-room-message code path.
 */
async function healUserRecord(
  redis: Redis,
  username: string,
  stats: SyncMaintenanceStats
): Promise<void> {
  const keys = [redisKeys.auth.userProfile(username)];
  for (const key of keys) {
    try {
      if ((await redis.ttl(key)) > 0) {
        await redis.persist(key);
        stats.userRecordsPersisted += 1;
      }
    } catch (error) {
      stats.errors += 1;
      console.warn(`[sync2:maint] Failed to persist user record ${key}:`, error);
    }
  }
}

interface DeleteBudget {
  remaining: number;
}

async function sweepBlobRegistry(
  redis: Redis,
  username: string,
  referenced: { hashes: Set<string>; urls: Set<string> },
  budget: DeleteBudget,
  stats: SyncMaintenanceStats,
  options: Required<Pick<SyncMaintenanceOptions, "graceMs" | "now" | "deleteObject">>
): Promise<void> {
  const registryKey = sync2BlobsKey(username);
  const raw = await redis.hgetall<Record<string, unknown>>(registryKey);
  if (!raw || Object.keys(raw).length === 0) return;

  for (const [digest, value] of Object.entries(raw)) {
    const entry = parseRedisJson<BlobRegistryEntry>(value);
    if (!entry || typeof entry.url !== "string") continue;

    const isReferenced =
      referenced.hashes.has(digest) || referenced.urls.has(entry.url);

    if (isReferenced) {
      if (entry.gc) {
        // Re-referenced while marked: clear the mark.
        const { gc: _gc, ...unmarked } = entry;
        await redis.hset(registryKey, { [digest]: JSON.stringify(unmarked) });
        stats.blobsUnmarked += 1;
      }
      continue;
    }

    if (!entry.gc) {
      await redis.hset(registryKey, {
        [digest]: JSON.stringify({ ...entry, gc: options.now }),
      });
      stats.blobsMarked += 1;
      continue;
    }

    if (options.now - entry.gc < options.graceMs) continue;
    if (budget.remaining <= 0) continue;

    try {
      budget.remaining -= 1;
      await options.deleteObject(entry.url);
      await redis.hdel(registryKey, digest);
      stats.blobsDeleted += 1;
    } catch (error) {
      stats.errors += 1;
      console.warn(`[sync2:maint] Failed to delete blob ${digest}:`, error);
    }
  }
}

export async function runSyncMaintenance(
  redis: Redis,
  options: SyncMaintenanceOptions = {}
): Promise<SyncMaintenanceStats> {
  const maxUsers = options.maxUsers ?? 25;
  const scanCount = options.scanCount ?? 100;
  const graceMs = options.graceMs ?? BLOB_GC_GRACE_MS;
  const now = options.now ?? Date.now();
  const deleteObject = options.deleteObject ?? deleteStoredObject;
  const budget: DeleteBudget = {
    remaining: options.maxStorageDeletes ?? 200,
  };

  const stats: SyncMaintenanceStats = {
    usersProcessed: 0,
    scanComplete: false,
    blobsMarked: 0,
    blobsUnmarked: 0,
    blobsDeleted: 0,
    userRecordsPersisted: 0,
    errors: 0,
  };

  const { usernames, scanComplete } = await scanUserBatch(
    redis,
    maxUsers,
    scanCount
  );
  stats.scanComplete = scanComplete;

  for (const username of usernames) {
    try {
      const referenced = await collectReferencedBlobs(redis, username);
      await healUserRecord(redis, username, stats);
      await sweepBlobRegistry(redis, username, referenced, budget, stats, {
        graceMs,
        now,
        deleteObject,
      });
      stats.usersProcessed += 1;
    } catch (error) {
      stats.errors += 1;
      console.error(`[sync2:maint] Maintenance failed for ${username}:`, error);
    }
  }

  return stats;
}
