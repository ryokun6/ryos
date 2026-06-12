/**
 * Cloud Sync v2 server core.
 *
 * Per-user state in Redis:
 * - `sync2:seq:{user}`   STRING  monotonically increasing op counter
 * - `sync2:kv:{user}`    HASH    key → JSON SyncKvEntry (latest doc per key)
 * - `sync2:log:{user}`   LIST    accepted ops (ascending seq), bounded
 * - `sync2:blobs:{user}` HASH    sha256 → JSON { url, size } dedupe registry
 * - `sync2:lock:{user}`  STRING  short-TTL write lock
 *
 * Writes are ops resolved per key with last-writer-wins on the HLC
 * timestamp. There are no conflicts surfaced to clients: losing ops return
 * the winning entry inline so the writer converges in the same round trip.
 */

import type { Redis } from "../../_utils/redis.js";
import { USER_TTL_SECONDS } from "../../_utils/auth/index.js";
import { triggerRealtimeEvent } from "../../_utils/realtime.js";
import { getSyncChannelName } from "../../../src/shared/constants/realtime.js";
import {
  clampHlc,
  compareHlc,
  isValidHlc,
} from "../../../src/shared/sync2/hlc.js";
import { isValidSyncKey } from "../../../src/shared/sync2/namespaces.js";
import {
  getSyncBlobRef,
  isSyncKvEntry,
  SYNC_OPS_REALTIME_EVENT,
  type SyncKvEntry,
  type SyncOp,
  type SyncOpResult,
  type SyncOpsRealtimeEvent,
} from "../../../src/shared/sync2/types.js";
import { importV1SyncState } from "./_import.js";

export const MAX_OPS_PER_REQUEST = 1000;
export const MAX_OP_VALUE_BYTES = 512 * 1024;
const JOURNAL_MAX_LENGTH = 4096;
const LOCK_TTL_SECONDS = 10;
const LOCK_RETRY_DELAYS_MS = [150, 300, 600, 1200, 2400];
/** Inline ops in the realtime event only below this JSON size. */
const REALTIME_INLINE_LIMIT_BYTES = 8 * 1024;

export function sync2SeqKey(username: string): string {
  return `sync2:seq:${username.toLowerCase()}`;
}

export function sync2KvKey(username: string): string {
  return `sync2:kv:${username.toLowerCase()}`;
}

export function sync2LogKey(username: string): string {
  return `sync2:log:${username.toLowerCase()}`;
}

export function sync2BlobsKey(username: string): string {
  return `sync2:blobs:${username.toLowerCase()}`;
}

function sync2LockKey(username: string): string {
  return `sync2:lock:${username.toLowerCase()}`;
}

export function parseRedisJson<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

/** Normalize hmget across backends (ioredis: array, Upstash REST: object). */
async function hmgetValues<T>(
  redis: Redis,
  key: string,
  fields: string[]
): Promise<(T | null)[]> {
  if (fields.length === 0) return [];
  const raw = (await (
    redis as unknown as {
      hmget: (key: string, ...fields: string[]) => Promise<unknown>;
    }
  ).hmget(key, ...fields)) as unknown;

  if (Array.isArray(raw)) {
    return raw.map((value) => parseRedisJson<T>(value));
  }
  if (raw && typeof raw === "object") {
    const map = raw as Record<string, unknown>;
    return fields.map((field) => parseRedisJson<T>(map[field]));
  }
  return fields.map(() => null);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireUserLock(redis: Redis, username: string): Promise<boolean> {
  const key = sync2LockKey(username);
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  for (let attempt = 0; attempt <= LOCK_RETRY_DELAYS_MS.length; attempt += 1) {
    const result = await redis.set(key, token, {
      nx: true,
      ex: LOCK_TTL_SECONDS,
    });
    if (result === "OK" || result === 1) {
      return true;
    }
    if (attempt < LOCK_RETRY_DELAYS_MS.length) {
      await sleep(LOCK_RETRY_DELAYS_MS[attempt]);
    }
  }
  return false;
}

async function releaseUserLock(redis: Redis, username: string): Promise<void> {
  try {
    await redis.del(sync2LockKey(username));
  } catch (error) {
    console.warn("[sync2] Failed to release user lock:", error);
  }
}

async function readSeq(redis: Redis, username: string): Promise<number | null> {
  const raw = await redis.get<string | number>(sync2SeqKey(username));
  if (raw === null || raw === undefined) return null;
  const parsed = typeof raw === "number" ? raw : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function touchTtls(redis: Redis, username: string): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.expire(sync2SeqKey(username), USER_TTL_SECONDS);
  pipeline.expire(sync2KvKey(username), USER_TTL_SECONDS);
  pipeline.expire(sync2LogKey(username), USER_TTL_SECONDS);
  pipeline.expire(sync2BlobsKey(username), USER_TTL_SECONDS);
  await pipeline.exec();
}

const TTL_TOUCH_THROTTLE_SECONDS = 24 * 60 * 60;

/**
 * Refresh sync data TTLs on reads too (throttled to once per day per user
 * via an NX marker), so any device that merely checks for changes keeps the
 * user's cloud data alive — writes are not required for retention.
 */
async function touchTtlsThrottled(redis: Redis, username: string): Promise<void> {
  try {
    const marker = await redis.set(
      `sync2:ttl-touched:${username.toLowerCase()}`,
      "1",
      { nx: true, ex: TTL_TOUCH_THROTTLE_SECONDS }
    );
    if (marker === "OK" || marker === 1) {
      await touchTtls(redis, username);
    }
  } catch (error) {
    console.warn("[sync2] Failed to refresh TTLs on read:", error);
  }
}

/**
 * Initialize the user's v2 state, importing v1 sync data on first access.
 * Existence of the seq key marks an initialized user.
 */
export async function ensureSync2Initialized(
  redis: Redis,
  username: string
): Promise<void> {
  if ((await readSeq(redis, username)) !== null) {
    return;
  }

  const locked = await acquireUserLock(redis, username);
  try {
    if ((await readSeq(redis, username)) !== null) {
      return;
    }
    if (!locked) {
      throw new Error("Could not acquire sync lock for initialization");
    }

    const entries = await importV1SyncState(redis, username);
    const blobRegistry: Record<string, string> = {};
    const kvFields: Record<string, string> = {};
    for (const [key, entry] of Object.entries(entries)) {
      kvFields[key] = JSON.stringify(entry);
      const blobRef = entry.del ? null : getSyncBlobRef(entry.v);
      // Legacy v1 signatures are SHA-256 over the same serialization, so
      // imported refs participate in dedupe and GC like native ones.
      const digest = blobRef?.sha256 || blobRef?.sig;
      if (digest) {
        blobRegistry[digest] = JSON.stringify({
          url: blobRef!.url,
          size: blobRef!.size,
        });
      }
    }

    if (Object.keys(kvFields).length > 0) {
      await redis.hset(sync2KvKey(username), kvFields);
    }
    if (Object.keys(blobRegistry).length > 0) {
      await redis.hset(sync2BlobsKey(username), blobRegistry);
    }
    // The import is a baseline snapshot, not journal history: clients that
    // have never synced v2 bootstrap from the snapshot anyway.
    await redis.set(sync2SeqKey(username), "0", { ex: USER_TTL_SECONDS });
    await touchTtls(redis, username);
    console.log(
      `[sync2] Initialized ${username} (${Object.keys(kvFields).length} keys imported from v1)`
    );
  } finally {
    if (locked) {
      await releaseUserLock(redis, username);
    }
  }
}

export interface ApplySyncOpsResult {
  seq: number;
  results: SyncOpResult[];
  accepted: SyncOp[];
}

export interface ApplySyncOpsOptions {
  /** Skip per-op HLC clamping (trusted server-side writers). */
  trusted?: boolean;
}

export function validateSyncOps(ops: unknown): string | null {
  if (!Array.isArray(ops) || ops.length === 0) {
    return "ops must be a non-empty array";
  }
  if (ops.length > MAX_OPS_PER_REQUEST) {
    return `Too many ops in one request (max ${MAX_OPS_PER_REQUEST})`;
  }
  for (const op of ops) {
    if (!op || typeof op !== "object") {
      return "Invalid op";
    }
    const candidate = op as Partial<SyncOp>;
    if (!isValidSyncKey(candidate.k)) {
      return `Invalid sync key: ${String(candidate.k).slice(0, 64)}`;
    }
    if (!isValidHlc(candidate.t)) {
      return `Invalid op timestamp for ${candidate.k}`;
    }
    if (candidate.del !== true && candidate.v === undefined) {
      return `Op for ${candidate.k} has neither value nor del`;
    }
    if (candidate.v !== undefined) {
      const size = JSON.stringify(candidate.v)?.length ?? 0;
      if (size > MAX_OP_VALUE_BYTES) {
        return `Document too large for ${candidate.k} (${size} bytes, max ${MAX_OP_VALUE_BYTES})`;
      }
    }
  }
  return null;
}

/** Pure LWW resolution used by {@link applySyncOps}; exported for tests. */
export function resolveSyncOp(
  existing: SyncKvEntry | null,
  op: SyncOp
): "accept" | "reject" {
  if (!existing) return "accept";
  return compareHlc(op.t, existing.t) > 0 ? "accept" : "reject";
}

export async function applySyncOps(
  redis: Redis,
  username: string,
  ops: SyncOp[],
  clientId: string,
  options: ApplySyncOpsOptions = {}
): Promise<ApplySyncOpsResult> {
  await ensureSync2Initialized(redis, username);

  const locked = await acquireUserLock(redis, username);
  if (!locked) {
    throw new Error("Sync is busy, please retry");
  }

  try {
    // Deduplicate by key within the batch (last op per key wins the batch).
    const opsByKey = new Map<string, SyncOp>();
    for (const op of ops) {
      const previous = opsByKey.get(op.k);
      if (!previous || compareHlc(op.t, previous.t) >= 0) {
        opsByKey.set(op.k, op);
      }
    }

    const keys = Array.from(opsByKey.keys());
    const existingEntries = await hmgetValues<SyncKvEntry>(
      redis,
      sync2KvKey(username),
      keys
    );

    const currentSeq = (await readSeq(redis, username)) ?? 0;
    let nextSeq = currentSeq;
    const results: SyncOpResult[] = [];
    const accepted: SyncOp[] = [];
    const kvWrites: Record<string, string> = {};
    const logEntries: string[] = [];
    const blobRegistry: Record<string, string> = {};
    const nowMs = Date.now();

    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const op = opsByKey.get(key)!;
      const rawExisting = existingEntries[index];
      const existing = isSyncKvEntry(rawExisting) ? rawExisting : null;
      const t = options.trusted ? op.t : clampHlc(op.t, clientId, nowMs);

      if (resolveSyncOp(existing, { ...op, t }) === "reject") {
        results.push({
          k: key,
          accepted: false,
          ...(existing ? { winner: existing } : {}),
        });
        continue;
      }

      nextSeq += 1;
      const entry: SyncKvEntry = {
        ...(op.del ? { del: true } : { v: op.v }),
        t,
        seq: nextSeq,
      };
      const acceptedOp: SyncOp = {
        k: key,
        ...(op.del ? { del: true } : { v: op.v }),
        t,
        seq: nextSeq,
        c: clientId,
      };

      kvWrites[key] = JSON.stringify(entry);
      logEntries.push(JSON.stringify(acceptedOp));
      accepted.push(acceptedOp);
      results.push({ k: key, accepted: true, seq: nextSeq });

      const blobRef = op.del ? null : getSyncBlobRef(op.v);
      if (blobRef?.sha256) {
        blobRegistry[blobRef.sha256] = JSON.stringify({
          url: blobRef.url,
          size: blobRef.size,
        });
      }
    }

    if (accepted.length > 0) {
      await redis.hset(sync2KvKey(username), kvWrites);
      await redis.rpush(sync2LogKey(username), ...logEntries);
      const pipeline = redis.pipeline();
      pipeline.set(sync2SeqKey(username), String(nextSeq), {
        ex: USER_TTL_SECONDS,
      });
      await pipeline.exec();
      await redis.ltrim(sync2LogKey(username), -JOURNAL_MAX_LENGTH, -1);
      if (Object.keys(blobRegistry).length > 0) {
        await redis.hset(sync2BlobsKey(username), blobRegistry);
      }
      await touchTtls(redis, username);
    }

    return { seq: nextSeq, results, accepted };
  } finally {
    await releaseUserLock(redis, username);
  }
}

/** Broadcast accepted ops; inline them when the payload is small. */
export async function broadcastSyncOps(
  username: string,
  seq: number,
  accepted: SyncOp[],
  clientId: string
): Promise<void> {
  if (accepted.length === 0) return;
  try {
    let event: SyncOpsRealtimeEvent = { seq, ops: accepted, c: clientId };
    if (JSON.stringify(event).length > REALTIME_INLINE_LIMIT_BYTES) {
      event = { seq, c: clientId };
    }
    await triggerRealtimeEvent(
      getSyncChannelName(username),
      SYNC_OPS_REALTIME_EVENT,
      event
    );
  } catch (error) {
    console.warn("[sync2] Failed to broadcast ops:", error);
  }
}

export interface SyncChangesResult {
  seq: number;
  ops?: SyncOp[];
  snapshotRequired?: boolean;
}

export async function readSyncChanges(
  redis: Redis,
  username: string,
  since: number
): Promise<SyncChangesResult> {
  await ensureSync2Initialized(redis, username);
  await touchTtlsThrottled(redis, username);

  const seq = (await readSeq(redis, username)) ?? 0;
  if (since >= seq) {
    return { seq, ops: [] };
  }

  const logKey = sync2LogKey(username);
  const length = await redis.llen(logKey);
  const missing = seq - since;
  if (missing > length) {
    return { seq, snapshotRequired: true };
  }

  // Fetch a small safety margin to absorb writes between the seq and llen
  // reads, then filter precisely by each op's embedded seq.
  const fetchCount = Math.min(length, missing + 16);
  const raw = await redis.lrange<string | SyncOp>(logKey, -fetchCount, -1);
  const ops: SyncOp[] = [];
  for (const value of raw) {
    const op = parseRedisJson<SyncOp>(value);
    if (op && typeof op.seq === "number" && op.seq > since) {
      ops.push(op);
    }
  }
  ops.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

  // Verify contiguity: the journal must contain since+1 onwards.
  if (ops.length === 0 || (ops[0].seq ?? 0) > since + 1) {
    return { seq, snapshotRequired: true };
  }

  return { seq: Math.max(seq, ops[ops.length - 1].seq ?? seq), ops };
}

export interface SyncSnapshotResult {
  seq: number;
  entries: Record<string, SyncKvEntry>;
}

export async function readSyncSnapshot(
  redis: Redis,
  username: string,
  prefix?: string
): Promise<SyncSnapshotResult> {
  await ensureSync2Initialized(redis, username);
  await touchTtlsThrottled(redis, username);

  // Read seq AFTER the KV hash so the cursor can only undercount (clients
  // re-fetch ops they already have, which LWW makes harmless), never skip.
  const raw = await redis.hgetall<Record<string, unknown>>(sync2KvKey(username));
  const seq = (await readSeq(redis, username)) ?? 0;

  const entries: Record<string, SyncKvEntry> = {};
  if (raw) {
    for (const [key, value] of Object.entries(raw)) {
      if (prefix && !key.startsWith(prefix)) continue;
      const entry = parseRedisJson<SyncKvEntry>(value);
      if (entry && isSyncKvEntry(entry)) {
        entries[key] = entry;
      }
    }
  }

  return { seq, entries };
}

/**
 * Read current docs under a key prefix (server-side feature readers, e.g.
 * AI tools). Tombstoned keys are skipped.
 */
export async function readSyncDocsByPrefix(
  redis: Redis,
  username: string,
  prefix: string
): Promise<Record<string, unknown>> {
  const { entries } = await readSyncSnapshot(redis, username, prefix);
  const docs: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(entries)) {
    if (!entry.del && entry.v !== undefined) {
      docs[key] = entry.v;
    }
  }
  return docs;
}

export const SERVER_SYNC_CLIENT_ID = "server";

/**
 * Apply ops on behalf of server-side tools (AI chat tools, Telegram) and
 * broadcast to connected clients.
 */
export async function writeSyncOpsFromServer(
  redis: Redis,
  username: string,
  ops: SyncOp[]
): Promise<ApplySyncOpsResult> {
  const result = await applySyncOps(redis, username, ops, SERVER_SYNC_CLIENT_ID, {
    trusted: true,
  });
  await broadcastSyncOps(username, result.seq, result.accepted, SERVER_SYNC_CLIENT_ID);
  return result;
}

export interface SyncBlobRegistryEntry {
  url: string;
  size: number;
}

export async function lookupSyncBlobs(
  redis: Redis,
  username: string,
  digests: string[]
): Promise<(SyncBlobRegistryEntry | null)[]> {
  if (digests.length === 0) return [];
  const values = await hmgetValues<SyncBlobRegistryEntry>(
    redis,
    sync2BlobsKey(username),
    digests
  );
  return values.map((value) =>
    value && typeof value.url === "string" && typeof value.size === "number"
      ? value
      : null
  );
}
