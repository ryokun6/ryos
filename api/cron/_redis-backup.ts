import { gzipSync } from "node:zlib";
import {
  uploadStoredObject,
  type StoragePutOptions,
  type StoragePutResult,
} from "../_utils/storage.js";

export const REDIS_BACKUP_CRON_PATH = "/api/cron/redis-backup";
export const REDIS_BACKUP_CRON_SCHEDULE = "42 3 * * *";

const BACKUP_FORMAT_VERSION = 1;
const DEFAULT_SCAN_COUNT = 100;
const MAX_SCAN_ITERATIONS = 10_000;
const DEFAULT_BACKUP_PREFIX = "redis-backups";

type RedisKeyType = "string" | "list" | "set" | "hash" | "zset" | string;

interface RedisBackupRedis {
  scan(
    cursor: number | string,
    options?: { match?: string; count?: number }
  ): Promise<[string | number, string[]]>;
  type(key: string): Promise<RedisKeyType>;
  ttl(key: string): Promise<number>;
  get<T = unknown>(key: string): Promise<T | null>;
  smembers<T = unknown[]>(key: string): Promise<T>;
  lrange<T = unknown>(key: string, start: number, stop: number): Promise<T[]>;
  hgetall<T = Record<string, unknown>>(key: string): Promise<T | null>;
  zrange<T = unknown[]>(
    key: string,
    start: number,
    stop: number,
    options?: { withScores?: boolean }
  ): Promise<T>;
}

export interface RedisBackupOptions {
  now?: Date;
  scanCount?: number;
  prefix?: string;
  uploadObject?: (options: StoragePutOptions) => Promise<StoragePutResult>;
}

export interface RedisBackupStats {
  generatedAt: string;
  pathname: string;
  storageUrl: string;
  provider: string;
  keysScanned: number;
  keysBackedUp: number;
  unsupportedKeys: number;
  scanIterations: number;
  scanComplete: boolean;
  uncompressedBytes: number;
  compressedBytes: number;
  byType: Record<string, number>;
}

interface RedisBackupHeader {
  kind: "metadata";
  version: number;
  generatedAt: string;
  format: "ryos-redis-jsonl";
  scanCount: number;
}

interface RedisBackupRecord {
  kind: "key";
  key: string;
  redisType: RedisKeyType;
  ttlSeconds: number;
  value: unknown;
  unsupported?: boolean;
}

interface SortedSetEntry {
  member: unknown;
  score: number;
}

export function getRedisBackupAuthSecret(): string | null {
  return process.env.CRON_SECRET?.trim() || null;
}

function normalizeBackupPrefix(prefix: string | undefined): string {
  const normalized = (prefix || DEFAULT_BACKUP_PREFIX)
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  return normalized || DEFAULT_BACKUP_PREFIX;
}

function buildBackupPathname(now: Date, prefix: string | undefined): string {
  const generatedAt = now.toISOString();
  const day = generatedAt.slice(0, 10);
  const timestamp = generatedAt.replace(/[:.]/g, "-");
  return `${normalizeBackupPrefix(prefix)}/${day}/${timestamp}.jsonl.gz`;
}

function incrementTypeCount(stats: Pick<RedisBackupStats, "byType">, type: string) {
  stats.byType[type] = (stats.byType[type] || 0) + 1;
}

function normalizeSortedSetEntries(raw: unknown): SortedSetEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  if (raw.every((entry) => Array.isArray(entry) && entry.length >= 2)) {
    return raw.map((entry) => {
      const [member, rawScore] = entry as [unknown, unknown];
      const score = Number(rawScore);
      if (!Number.isFinite(score)) {
        throw new Error(`Invalid sorted-set score for member ${String(member)}`);
      }
      return { member, score };
    });
  }

  const entries: SortedSetEntry[] = [];
  for (let index = 0; index < raw.length; index += 2) {
    const member = raw[index];
    const score = Number(raw[index + 1]);
    if (!Number.isFinite(score)) {
      throw new Error(`Invalid sorted-set score for member ${String(member)}`);
    }
    entries.push({ member, score });
  }
  return entries;
}

async function readRedisBackupRecord(
  redis: RedisBackupRedis,
  key: string
): Promise<RedisBackupRecord | null> {
  const [redisType, ttlSeconds] = await Promise.all([
    redis.type(key),
    redis.ttl(key),
  ]);

  if (redisType === "none") {
    return null;
  }

  switch (redisType) {
    case "string":
      return {
        kind: "key",
        key,
        redisType,
        ttlSeconds,
        value: await redis.get(key),
      };
    case "list":
      return {
        kind: "key",
        key,
        redisType,
        ttlSeconds,
        value: await redis.lrange(key, 0, -1),
      };
    case "set":
      return {
        kind: "key",
        key,
        redisType,
        ttlSeconds,
        value: await redis.smembers(key),
      };
    case "hash":
      return {
        kind: "key",
        key,
        redisType,
        ttlSeconds,
        value: (await redis.hgetall(key)) ?? {},
      };
    case "zset":
      return {
        kind: "key",
        key,
        redisType,
        ttlSeconds,
        value: normalizeSortedSetEntries(
          await redis.zrange(key, 0, -1, { withScores: true })
        ),
      };
    default:
      return {
        kind: "key",
        key,
        redisType,
        ttlSeconds,
        value: null,
        unsupported: true,
      };
  }
}

export async function runRedisBackup(
  redis: RedisBackupRedis,
  options: RedisBackupOptions = {}
): Promise<RedisBackupStats> {
  const now = options.now || new Date();
  const generatedAt = now.toISOString();
  const scanCount = Math.max(1, Math.floor(options.scanCount || DEFAULT_SCAN_COUNT));
  const pathname = buildBackupPathname(
    now,
    options.prefix || process.env.REDIS_BACKUP_S3_PREFIX
  );
  const uploadObject = options.uploadObject || uploadStoredObject;

  const stats: Omit<
    RedisBackupStats,
    "storageUrl" | "provider" | "uncompressedBytes" | "compressedBytes"
  > = {
    generatedAt,
    pathname,
    keysScanned: 0,
    keysBackedUp: 0,
    unsupportedKeys: 0,
    scanIterations: 0,
    scanComplete: false,
    byType: {},
  };

  const lines: string[] = [
    JSON.stringify({
      kind: "metadata",
      version: BACKUP_FORMAT_VERSION,
      generatedAt,
      format: "ryos-redis-jsonl",
      scanCount,
    } satisfies RedisBackupHeader),
  ];

  let cursor: string | number = "0";
  do {
    const [nextCursor, keys] = await redis.scan(cursor, { count: scanCount });
    stats.scanIterations += 1;
    stats.keysScanned += keys.length;

    for (const key of keys) {
      const record = await readRedisBackupRecord(redis, key);
      if (!record) continue;
      stats.keysBackedUp += 1;
      if (record.unsupported) {
        stats.unsupportedKeys += 1;
      }
      incrementTypeCount(stats, record.redisType);
      lines.push(JSON.stringify(record));
    }

    cursor = String(nextCursor);
    if (cursor === "0") {
      stats.scanComplete = true;
      break;
    }
  } while (stats.scanIterations < MAX_SCAN_ITERATIONS);

  if (!stats.scanComplete) {
    throw new Error(
      `Redis backup did not finish after ${MAX_SCAN_ITERATIONS} SCAN iterations.`
    );
  }

  const payload = new TextEncoder().encode(`${lines.join("\n")}\n`);
  const compressed = gzipSync(payload, { level: 9 });
  const uploaded = await uploadObject({
    pathname,
    contentType: "application/gzip",
    body: compressed,
    allowOverwrite: true,
  });

  return {
    ...stats,
    storageUrl: uploaded.storageUrl,
    provider: uploaded.provider,
    uncompressedBytes: payload.byteLength,
    compressedBytes: compressed.byteLength,
  };
}
