/**
 * Cloud Sync v2 maintenance (cron):
 *
 * 1. **Legacy v1 key retirement** — v1 sync snapshots were written without
 *    TTLs. Once a user is on v2 (imported), their v1 keys are frozen
 *    leftovers; this puts a retirement TTL on them so they expire.
 * 2. **Blob garbage collection** — content-addressed blobs whose digest is
 *    no longer referenced by any KV document are deleted with a
 *    mark-and-sweep grace period (a blob must be unreferenced across two
 *    runs spaced beyond the grace window before its object is removed).
 * 3. **Legacy blob sweep** — v1 per-item/monolithic objects listed in the
 *    frozen `sync:auto:meta` manifests are deleted once no current KV doc
 *    references them (v1 has no writers anymore, so this cannot race).
 *
 * Work is bounded per invocation: users are discovered by scanning
 * `sync2:kv:*` with a cursor persisted in Redis, so successive cron runs
 * walk the whole user base in batches.
 */

import type { Redis } from "../../_utils/redis.js";
import { USER_TTL_SECONDS } from "../../_utils/auth/index.js";
import { deleteStoredObject } from "../../_utils/storage.js";
import { getSyncBlobRef } from "../../../src/shared/sync2/types.js";
import {
  parseRedisJson,
  sync2BlobsKey,
  sync2KvKey,
} from "./_core.js";

/** Retirement TTL for frozen v1 keys (matches the user-record TTL). */
export const V1_RETIREMENT_TTL_SECONDS = USER_TTL_SECONDS;

/** Unreferenced blobs must stay marked this long before deletion. */
export const BLOB_GC_GRACE_MS = 24 * 60 * 60 * 1000;

const MAINTENANCE_CURSOR_KEY = "sync2:maint:cursor";

const V1_REDIS_DOMAINS = [
  "settings",
  "files-metadata",
  "songs",
  "videos",
  "tv",
  "stickies",
  "calendar",
  "contacts",
  "maps",
] as const;

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
  v1KeysExpired: number;
  blobsMarked: number;
  blobsUnmarked: number;
  blobsDeleted: number;
  legacyObjectsDeleted: number;
  errors: number;
}

interface BlobRegistryEntry {
  url: string;
  size?: number;
  /** Mark timestamp (ms) set when the blob was first seen unreferenced. */
  gc?: number;
}

interface V1ManifestItem {
  storageUrl?: string;
  blobUrl?: string;
  [key: string]: unknown;
}

interface V1ManifestEntry {
  storageUrl?: string;
  blobUrl?: string;
  items?: Record<string, V1ManifestItem>;
  [key: string]: unknown;
}

function getUsernameFromKvKey(key: string): string | null {
  const prefix = "sync2:kv:";
  return key.startsWith(prefix) && key.length > prefix.length
    ? key.slice(prefix.length)
    : null;
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
  const startCursor =
    (await redis.get<string | number>(MAINTENANCE_CURSOR_KEY)) ?? "0";
  let cursor: string | number = String(startCursor);
  const usernames: string[] = [];
  let scanComplete = false;

  // SCAN counts are hints; loop until the batch is full or the scan wraps.
  for (let iterations = 0; iterations < 50; iterations += 1) {
    const [nextCursor, keys] = await redis.scan(cursor, {
      match: "sync2:kv:*",
      count: scanCount,
    });
    for (const key of keys) {
      const username = getUsernameFromKvKey(key);
      if (username && !usernames.includes(username)) {
        usernames.push(username);
      }
    }
    cursor = String(nextCursor);
    if (cursor === "0") {
      scanComplete = true;
      break;
    }
    if (usernames.length >= maxUsers) {
      break;
    }
  }

  if (scanComplete) {
    await redis.del(MAINTENANCE_CURSOR_KEY);
  } else {
    await redis.set(MAINTENANCE_CURSOR_KEY, String(cursor), {
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

async function expireV1Keys(
  redis: Redis,
  username: string,
  stats: SyncMaintenanceStats
): Promise<void> {
  const keys: string[] = [
    ...V1_REDIS_DOMAINS.map((domain) => `sync:state:${username}:${domain}`),
    `sync:state:meta:${username}`,
    `sync:auto:meta:${username}`,
    `sync:songs:${username}:meta`,
  ];

  // Per-track song keys are listed in the v1 songs meta document.
  const songsMeta = parseRedisJson<{ trackOrder?: unknown }>(
    await redis.get(`sync:songs:${username}:meta`)
  );
  if (Array.isArray(songsMeta?.trackOrder)) {
    for (const id of songsMeta.trackOrder) {
      if (typeof id === "string" && id.length > 0) {
        keys.push(`sync:songs:${username}:track:${id}`);
      }
    }
  }

  for (const key of keys) {
    try {
      // ttl: -2 = missing, -1 = persistent, >= 0 = already expiring.
      if ((await redis.ttl(key)) === -1) {
        await redis.expire(key, V1_RETIREMENT_TTL_SECONDS);
        stats.v1KeysExpired += 1;
      }
    } catch (error) {
      stats.errors += 1;
      console.warn(`[sync2:maint] Failed to expire ${key}:`, error);
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
  if (!raw) return;

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

/**
 * Delete v1 storage objects no longer referenced by any KV doc, pruning
 * swept items out of the frozen manifest so they are not retried. The
 * manifest key's retirement TTL is preserved across the rewrite.
 */
async function sweepLegacyManifest(
  redis: Redis,
  username: string,
  referencedUrls: Set<string>,
  budget: DeleteBudget,
  stats: SyncMaintenanceStats,
  options: Required<Pick<SyncMaintenanceOptions, "deleteObject">>
): Promise<void> {
  const manifestKey = `sync:auto:meta:${username}`;
  const manifests = parseRedisJson<Record<string, V1ManifestEntry | null>>(
    await redis.get(manifestKey)
  );
  if (!manifests || typeof manifests !== "object") return;

  let changed = false;
  let remainingEntries = 0;

  for (const [domain, manifest] of Object.entries(manifests)) {
    if (!manifest || typeof manifest !== "object") continue;

    // v1 monolithic snapshot object (never referenced by v2 docs).
    const monolithicUrl = manifest.storageUrl || manifest.blobUrl;
    if (monolithicUrl && !referencedUrls.has(monolithicUrl)) {
      if (budget.remaining <= 0) {
        remainingEntries += 1;
      } else {
        try {
          budget.remaining -= 1;
          await options.deleteObject(monolithicUrl);
          delete manifest.storageUrl;
          delete manifest.blobUrl;
          stats.legacyObjectsDeleted += 1;
          changed = true;
        } catch (error) {
          stats.errors += 1;
          remainingEntries += 1;
          console.warn(
            `[sync2:maint] Failed to delete legacy ${domain} snapshot:`,
            error
          );
        }
      }
    }

    const items = manifest.items;
    if (items && typeof items === "object") {
      for (const [itemKey, item] of Object.entries(items)) {
        const url = item?.storageUrl || item?.blobUrl;
        if (!url) {
          delete items[itemKey];
          changed = true;
          continue;
        }
        if (referencedUrls.has(url)) {
          remainingEntries += 1;
          continue;
        }
        if (budget.remaining <= 0) {
          remainingEntries += 1;
          continue;
        }
        try {
          budget.remaining -= 1;
          await options.deleteObject(url);
          delete items[itemKey];
          stats.legacyObjectsDeleted += 1;
          changed = true;
        } catch (error) {
          stats.errors += 1;
          remainingEntries += 1;
          console.warn(
            `[sync2:maint] Failed to delete legacy item ${domain}/${itemKey}:`,
            error
          );
        }
      }
    }
  }

  if (!changed) return;

  if (remainingEntries === 0) {
    await redis.del(manifestKey);
    return;
  }

  const previousTtl = await redis.ttl(manifestKey);
  await redis.set(manifestKey, JSON.stringify(manifests));
  await redis.expire(
    manifestKey,
    previousTtl > 0 ? previousTtl : V1_RETIREMENT_TTL_SECONDS
  );
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
    v1KeysExpired: 0,
    blobsMarked: 0,
    blobsUnmarked: 0,
    blobsDeleted: 0,
    legacyObjectsDeleted: 0,
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
      await expireV1Keys(redis, username, stats);
      await sweepBlobRegistry(redis, username, referenced, budget, stats, {
        graceMs,
        now,
        deleteObject,
      });
      await sweepLegacyManifest(redis, username, referenced.urls, budget, stats, {
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
