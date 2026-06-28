/**
 * Cloud Sync v2 server core.
 *
 * Per-user state in Redis:
 * - `sync:v2:user:{user}:seq`    STRING  monotonically increasing op counter
 * - `sync:v2:user:{user}:kv`     HASH    key → JSON SyncKvEntry (latest doc per key)
 * - `sync:v2:user:{user}:jrnl`   ZSET    score = seq, member = JSON op (ascending), bounded
 * - `sync:v2:user:{user}:blobs`  HASH    sha256 → JSON { url, size } dedupe registry
 * - `sync:v2:user:{user}:lock`   STRING  short-TTL write lock
 *
 * The journal is a sorted set keyed by `seq` so catch-up reads an exact
 * range by rank and trimming drops the lowest scores — no list-tail
 * heuristics. (Pre-v2.1 deployments kept it as a LIST; that key is abandoned
 * and expires via its TTL. Clients mid-catch-up fall back to a snapshot once,
 * then resume on the sorted-set journal.)
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
import { redisKeys } from "../../../src/shared/redisKeys.js";

export const MAX_OPS_PER_REQUEST = 1000;
export const MAX_OP_VALUE_BYTES = 512 * 1024;
const JOURNAL_MAX_LENGTH = 4096;
const LOCK_TTL_SECONDS = 30;
const LOCK_RETRY_DELAYS_MS = [150, 300, 600, 1200, 2400];
/** Inline ops in the realtime event only below this JSON size. */
const REALTIME_INLINE_LIMIT_BYTES = 8 * 1024;
const COMPARE_AND_DELETE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;
const COMPARE_AND_EXPIRE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("expire", KEYS[1], ARGV[2])
end
return 0
`;
const INITIALIZE_WITH_LOCK_SCRIPT = `
-- sync-v2-initialize-with-lock
if redis.call("get", KEYS[1]) ~= ARGV[1] then
  return 0
end
if redis.call("exists", KEYS[2]) == 0 then
  redis.call("set", KEYS[2], "0", "EX", ARGV[2])
end
return 1
`;
const COMMIT_WITH_LOCK_SCRIPT = `
-- sync-v2-commit-with-lock
if redis.call("get", KEYS[1]) ~= ARGV[1] then
  return 0
end

local current_seq = redis.call("get", KEYS[2])
if (current_seq or "0") ~= ARGV[2] then
  return -1
end

local ttl = tonumber(ARGV[4])
local trim_before = tonumber(ARGV[5])
local cursor = 6
local kv_count = tonumber(ARGV[cursor])
cursor = cursor + 1
for _ = 1, kv_count do
  redis.call("hset", KEYS[3], ARGV[cursor], ARGV[cursor + 1])
  cursor = cursor + 2
end

local journal_count = tonumber(ARGV[cursor])
cursor = cursor + 1
for _ = 1, journal_count do
  redis.call("zadd", KEYS[4], ARGV[cursor], ARGV[cursor + 1])
  cursor = cursor + 2
end

redis.call("set", KEYS[2], ARGV[3], "EX", ttl)
redis.call("zremrangebyscore", KEYS[4], "-inf", trim_before)

local blob_count = tonumber(ARGV[cursor])
cursor = cursor + 1
for _ = 1, blob_count do
  redis.call("hset", KEYS[5], ARGV[cursor], ARGV[cursor + 1])
  cursor = cursor + 2
end

redis.call("expire", KEYS[3], ttl)
redis.call("expire", KEYS[4], ttl)
redis.call("expire", KEYS[5], ttl)
return 1
`;

export interface UserLockHandle {
  readonly key: string;
  readonly token: string;
}

export function sync2SeqKey(username: string): string {
  return redisKeys.sync.v2Seq(username);
}

export function sync2KvKey(username: string): string {
  return redisKeys.sync.v2Kv(username);
}

export function sync2JournalKey(username: string): string {
  return redisKeys.sync.v2Journal(username);
}

export function sync2BlobsKey(username: string): string {
  return redisKeys.sync.v2Blobs(username);
}

function sync2LockKey(username: string): string {
  return redisKeys.sync.v2Lock(username);
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

async function evalRedisScript(
  redis: Redis,
  script: string,
  keys: string[],
  args: Array<string | number>
): Promise<unknown> {
  if (typeof redis.eval === "function") {
    return redis.eval(script, keys, args);
  }

  // StandardRedisAdapter wraps ioredis, whose EVAL signature differs from
  // Upstash's. Access its client only as a compatibility fallback.
  const adapter = redis as unknown as {
    client?: {
      eval?: (
        script: string,
        keyCount: number,
        ...keysAndArgs: string[]
      ) => Promise<unknown>;
    };
  };
  if (typeof adapter.client?.eval === "function") {
    return adapter.client.eval(script, keys.length, ...keys, ...args.map(String));
  }
  throw new Error("Redis backend does not support atomic scripts");
}

export async function acquireUserLock(
  redis: Redis,
  username: string
): Promise<UserLockHandle | null> {
  const key = sync2LockKey(username);
  const token = crypto.randomUUID();
  for (let attempt = 0; attempt <= LOCK_RETRY_DELAYS_MS.length; attempt += 1) {
    const result = await redis.set(key, token, {
      nx: true,
      ex: LOCK_TTL_SECONDS,
    });
    if (result === "OK" || result === 1) {
      return { key, token };
    }
    if (attempt < LOCK_RETRY_DELAYS_MS.length) {
      await sleep(LOCK_RETRY_DELAYS_MS[attempt]);
    }
  }
  return null;
}

export async function renewUserLock(
  redis: Redis,
  handle: UserLockHandle
): Promise<boolean> {
  const result = await evalRedisScript(
    redis,
    COMPARE_AND_EXPIRE_SCRIPT,
    [handle.key],
    [handle.token, String(LOCK_TTL_SECONDS)]
  );
  return result === 1 || result === "1";
}

export async function releaseUserLock(
  redis: Redis,
  handle: UserLockHandle
): Promise<void> {
  try {
    await evalRedisScript(
      redis,
      COMPARE_AND_DELETE_SCRIPT,
      [handle.key],
      [handle.token]
    );
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
  pipeline.expire(sync2JournalKey(username), USER_TTL_SECONDS);
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
      redisKeys.sync.v2TtlTouched(username),
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
 * Initialize the user's v2 state on first access. The seq key marks an
 * initialized user.
 */
export async function ensureSync2Initialized(
  redis: Redis,
  username: string
): Promise<void> {
  if ((await readSeq(redis, username)) !== null) {
    return;
  }

  const lock = await acquireUserLock(redis, username);
  try {
    if ((await readSeq(redis, username)) !== null) {
      return;
    }
    if (!lock) {
      throw new Error("Could not acquire sync lock for initialization");
    }
    if (!(await renewUserLock(redis, lock))) {
      throw new Error("Lost sync lock during initialization");
    }

    const initialized = await evalRedisScript(
      redis,
      INITIALIZE_WITH_LOCK_SCRIPT,
      [lock.key, sync2SeqKey(username)],
      [lock.token, USER_TTL_SECONDS]
    );
    if (initialized !== 1 && initialized !== "1") {
      throw new Error("Lost sync lock during initialization");
    }
    await touchTtls(redis, username);
    console.log(`[sync2] Initialized ${username}`);
  } finally {
    if (lock) {
      await releaseUserLock(redis, lock);
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

async function commitSyncOps(
  redis: Redis,
  username: string,
  lock: UserLockHandle,
  expectedSeq: number,
  nextSeq: number,
  kvWrites: Record<string, string>,
  journalEntries: Array<{ seq: number; member: string }>,
  blobRegistry: Record<string, string>
): Promise<boolean> {
  const kvEntries = Object.entries(kvWrites);
  const blobEntries = Object.entries(blobRegistry);
  const args: Array<string | number> = [
    lock.token,
    expectedSeq,
    nextSeq,
    USER_TTL_SECONDS,
    nextSeq - JOURNAL_MAX_LENGTH,
    kvEntries.length,
  ];
  for (const [key, value] of kvEntries) {
    args.push(key, value);
  }
  args.push(journalEntries.length);
  for (const { seq, member } of journalEntries) {
    args.push(seq, member);
  }
  args.push(blobEntries.length);
  for (const [digest, value] of blobEntries) {
    args.push(digest, value);
  }

  const result = await evalRedisScript(
    redis,
    COMMIT_WITH_LOCK_SCRIPT,
    [
      lock.key,
      sync2SeqKey(username),
      sync2KvKey(username),
      sync2JournalKey(username),
      sync2BlobsKey(username),
    ],
    args
  );
  return result === 1 || result === "1";
}

export async function applySyncOps(
  redis: Redis,
  username: string,
  ops: SyncOp[],
  clientId: string,
  options: ApplySyncOpsOptions = {}
): Promise<ApplySyncOpsResult> {
  await ensureSync2Initialized(redis, username);

  const lock = await acquireUserLock(redis, username);
  if (!lock) {
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
    const journalEntries: Array<{ seq: number; member: string }> = [];
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
      journalEntries.push({ seq: nextSeq, member: JSON.stringify(acceptedOp) });
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
      const committed = await commitSyncOps(
        redis,
        username,
        lock,
        currentSeq,
        nextSeq,
        kvWrites,
        journalEntries,
        blobRegistry
      );
      if (!committed) {
        throw new Error("Sync lock ownership was lost, please retry");
      }
    } else if (!(await renewUserLock(redis, lock))) {
      // Rejections include the current winner and sequence. Do not return a
      // stale view if another owner took over while this batch was resolving.
      throw new Error("Sync lock ownership was lost, please retry");
    }

    return { seq: nextSeq, results, accepted };
  } finally {
    await releaseUserLock(redis, lock);
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

/**
 * Collapse a seq-ordered op list to the newest op per key. Catch-up only
 * needs each key's latest value to converge under LWW, so replaying a key's
 * intermediate states is wasted bandwidth — and on bootstrap they're already
 * compacted in the KV state. Input must be ascending by seq; the returned
 * list preserves that order. The cursor still advances to the server seq, so
 * dropping superseded ops never desyncs the client.
 */
function coalesceSyncOpsByKey(ops: SyncOp[]): SyncOp[] {
  const latest = new Map<string, SyncOp>();
  for (const op of ops) {
    latest.set(op.k, op); // ascending seq → last write per key wins
  }
  return Array.from(latest.values()).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
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

  const journalKey = sync2JournalKey(username);
  const count = await redis.zcard(journalKey);
  const missing = seq - since;
  if (missing > count) {
    return { seq, snapshotRequired: true };
  }

  // The journal is contiguous in seq (each accept increments by one; trimming
  // only removes a low-seq prefix), so the op with seq = since+1 sits at rank
  // `count - missing`. Read from a small margin before it to absorb writes
  // racing between the zcard and zrange, then filter precisely by seq.
  const startIndex = Math.max(0, count - missing - 16);
  const raw = await redis.zrange(journalKey, startIndex, -1);
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

  const maxSeq = Math.max(seq, ops[ops.length - 1].seq ?? seq);
  return { seq: maxSeq, ops: coalesceSyncOpsByKey(ops) };
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
