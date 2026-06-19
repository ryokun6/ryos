/**
 * Admin API endpoints
 * Only accessible by the admin user (ryo)
 * 
 * Node.js runtime with terminal logging
 */

import type { Redis } from "./_utils/redis.js";
import { deleteAllUserTokens } from "./_utils/auth/index.js";
import {
  getStoredUserRecord,
  setStoredUserRecord,
} from "./_utils/auth/_user-record.js";
import { apiHandler } from "./_utils/api-handler.js";
import { getMemoryIndex, getMemoryDetail, getRecentDailyNotes, clearAllMemories, resetDailyNotesProcessedFlag, type MemoryEntry, type DailyNote } from "./_utils/_memory.js";
import { getRecentHeartbeatRecords, type HeartbeatRecord } from "./_utils/heartbeats.js";
import { processDailyNotesForUser } from "./ai/process-daily-notes.js";
import {
  getRedisBackend,
} from "./_utils/redis.js";
import { getRealtimeProvider } from "./_utils/runtime-config.js";
import { getAnalyticsSummary, getAnalyticsDetail, type AnalyticsSummary, type AnalyticsDetail } from "./_utils/_analytics.js";
import {
  CURSOR_REPO_AGENT_OWNER,
  executeCursorCloudAgent,
  listCursorSdkRunsFromRedis,
} from "./chat/tools/cursor-repo-agent.js";
import { redisKeys } from "../src/shared/redisKeys.js";

export const runtime = "nodejs";
export const maxDuration = 30;

interface AdminRequest {
  action: string;
  targetUsername?: string;
  reason?: string;
  prompt?: string;
  modelId?: string;
  key?: string;
  confirmKey?: string;
  pattern?: string;
  confirmPattern?: string;
  limit?: number;
  dryRun?: boolean;
  cursor?: string;
}

interface UserProfile {
  username: string;
  lastActive: number;
  banned?: boolean;
  banReason?: string;
  bannedAt?: number;
  messageCount?: number;
  rooms?: { id: string; name: string }[];
}

async function deleteUser(redis: Redis, targetUsername: string): Promise<{ success: boolean; error?: string }> {
  const normalizedUsername = targetUsername.toLowerCase();
  if (normalizedUsername === "ryo") return { success: false, error: "Cannot delete admin user" };

  try {
    await redis.del(
      redisKeys.auth.userProfile(normalizedUsername),
      redisKeys.auth.userPassword(normalizedUsername)
    );
    await deleteAllUserTokens(redis, normalizedUsername);
    return { success: true };
  } catch (error) {
    console.error(`Error deleting user ${normalizedUsername}:`, error);
    return { success: false, error: "Failed to delete user" };
  }
}

async function scanRedisKeys(redis: Redis, pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | number = 0;
  let iterations = 0;
  do {
    const [newCursor, foundKeys] = await redis.scan(cursor, { match: pattern, count: 1000 });
    cursor = newCursor;
    iterations++;
    keys.push(...foundKeys);
  } while (cursor !== 0 && cursor !== "0" && iterations < 100);
  return keys;
}

async function getAdminRoomIds(redis: Redis): Promise<string[]> {
  const canonicalIds = await redis.smembers<string[]>(redisKeys.chat.roomIds());
  return [...new Set(canonicalIds || [])];
}

async function getAdminRoomData(redis: Redis, roomId: string): Promise<{ name?: string } | null> {
  const roomData = await redis.get<{ name: string } | string>(
    redisKeys.chat.roomMeta(roomId)
  );
  if (!roomData) return null;
  return typeof roomData === "string" ? JSON.parse(roomData) : roomData;
}

async function getAdminRoomMessages(redis: Redis, roomId: string): Promise<unknown[]> {
  return await redis.lrange<unknown>(redisKeys.chat.roomMessages(roomId), 0, -1);
}

async function getAllUsers(redis: Redis): Promise<{ username: string; lastActive: number; banned?: boolean }[]> {
  try {
    const keys = await scanRedisKeys(redis, "auth:user:*:profile");
    const byUsername = new Map<string, { username: string; lastActive: number; banned?: boolean }>();
    if (keys.length > 0) {
      const userData = await redis.mget<(string | { username: string; lastActive: number; banned?: boolean } | null)[]>(...keys);
      for (const data of userData) {
        if (!data) continue;
        const parsed = typeof data === "string" ? JSON.parse(data) : data;
        if (parsed?.username) {
          byUsername.set(parsed.username.toLowerCase(), {
            username: parsed.username,
            lastActive: parsed.lastActive || 0,
            banned: parsed.banned || false,
          });
        }
      }
    }

    return [...byUsername.values()];
  } catch (error) {
    console.error("Error fetching all users:", error);
    return [];
  }
}

async function getUserProfile(redis: Redis, targetUsername: string): Promise<UserProfile | null> {
  const normalizedUsername = targetUsername.toLowerCase();

  try {
    const userData = await getStoredUserRecord(redis, normalizedUsername);
    if (!userData) return null;

    const parsed = userData;
    let messageCount = 0;
    const userRooms: { id: string; name: string }[] = [];
    
    const roomIds = await getAdminRoomIds(redis);
    const roomNameMap: Record<string, string> = {};
    
    for (const roomId of roomIds || []) {
      try {
        const roomData = await getAdminRoomData(redis, roomId);
        if (roomData) {
          roomNameMap[roomId] = roomData.name || roomId;
        } else {
          roomNameMap[roomId] = roomId;
        }
      } catch {
        roomNameMap[roomId] = roomId;
      }
    }
    
    for (const roomId of roomIds || []) {
      const messages = await getAdminRoomMessages(redis, roomId);
      let roomMessageCount = 0;
      
      for (const msg of messages || []) {
        const msgData = typeof msg === "string" ? JSON.parse(msg) : msg;
        if (msgData?.username?.toLowerCase() === normalizedUsername) {
          roomMessageCount++;
          messageCount++;
        }
      }
      
      if (roomMessageCount > 0) {
        userRooms.push({ id: roomId, name: roomNameMap[roomId] || roomId });
      }
    }

    return {
      username: parsed.username,
      lastActive: parsed.lastActive || 0,
      banned: parsed.banned || false,
      banReason: parsed.banReason,
      bannedAt: parsed.bannedAt,
      messageCount,
      rooms: userRooms,
    };
  } catch (error) {
    console.error(`Error fetching user profile for ${normalizedUsername}:`, error);
    return null;
  }
}

async function getUserMessages(redis: Redis, targetUsername: string, limit = 50): Promise<{ id: string; roomId: string; roomName: string; content: string; timestamp: number }[]> {
  const normalizedUsername = targetUsername.toLowerCase();
  const messages: { id: string; roomId: string; roomName: string; content: string; timestamp: number }[] = [];

  try {
    const roomIds = await getAdminRoomIds(redis);
    const roomNameMap: Record<string, string> = {};
    
    for (const roomId of roomIds || []) {
      try {
        const roomData = await getAdminRoomData(redis, roomId);
        if (roomData) {
          roomNameMap[roomId] = roomData.name || roomId;
        } else {
          roomNameMap[roomId] = roomId;
        }
      } catch {
        roomNameMap[roomId] = roomId;
      }
    }
    
    for (const roomId of roomIds || []) {
      const roomMessages = await getAdminRoomMessages(redis, roomId);
      for (const msg of roomMessages || []) {
        const msgData = typeof msg === "string" ? JSON.parse(msg) : msg;
        if (msgData?.username?.toLowerCase() === normalizedUsername) {
          messages.push({ id: msgData.id, roomId, roomName: roomNameMap[roomId] || roomId, content: msgData.content, timestamp: msgData.timestamp });
        }
      }
    }

    messages.sort((a, b) => b.timestamp - a.timestamp);
    return messages.slice(0, limit);
  } catch (error) {
    console.error(`Error fetching messages for ${normalizedUsername}:`, error);
    return [];
  }
}

async function banUser(redis: Redis, targetUsername: string, reason?: string): Promise<{ success: boolean; error?: string }> {
  const normalizedUsername = targetUsername.toLowerCase();
  if (normalizedUsername === "ryo") return { success: false, error: "Cannot ban admin user" };

  try {
    const userData = await getStoredUserRecord(redis, normalizedUsername);
    if (!userData) return { success: false, error: "User not found" };

    const updatedUser = { ...userData, banned: true, banReason: reason || "No reason provided", bannedAt: Date.now() };
    await setStoredUserRecord(redis, normalizedUsername, updatedUser);
    await deleteAllUserTokens(redis, normalizedUsername);
    return { success: true };
  } catch (error) {
    console.error(`Error banning user ${normalizedUsername}:`, error);
    return { success: false, error: "Failed to ban user" };
  }
}

async function unbanUser(redis: Redis, targetUsername: string): Promise<{ success: boolean; error?: string }> {
  const normalizedUsername = targetUsername.toLowerCase();

  try {
    const userData = await getStoredUserRecord(redis, normalizedUsername);
    if (!userData) return { success: false, error: "User not found" };

    const updatedUser = { ...userData, banned: false, banReason: undefined, bannedAt: undefined };
    await setStoredUserRecord(redis, normalizedUsername, updatedUser);
    return { success: true };
  } catch (error) {
    console.error(`Error unbanning user ${normalizedUsername}:`, error);
    return { success: false, error: "Failed to unban user" };
  }
}

function getDeployment(): "dev" | "vercel" | "coolify" {
  if (process.env.VERCEL === "1" || process.env.VERCEL_ENV) {
    return "vercel";
  }
  if (
    process.env.COOLIFY_SERVICE_ID ||
    process.env.COOLIFY_APP_ID ||
    process.env.COOLIFY_FQDN ||
    process.env.COOLIFY_URL ||
    process.env.COOLIFY_RESOURCE_UUID ||
    process.env.COOLIFY_CONTAINER_NAME ||
    process.env.COOLIFY_BRANCH ||
    /coolify/i.test(process.env.DEPLOYMENT_TARGET || "")
  ) {
    return "coolify";
  }
  return "dev";
}

async function getServerInfo(redis: Redis): Promise<{
  deployment: "dev" | "vercel" | "coolify";
  redis: { backend: string; healthy: boolean };
  websocket: { provider: "local" | "pusher"; configured: boolean };
}> {
  const deployment = getDeployment();
  let redisBackend = "unknown";
  let redisHealthy = false;
  try {
    redisBackend = getRedisBackend();
    await redis.get("admin:health:ping");
    redisHealthy = true;
  } catch {
    redisHealthy = false;
  }

  const realtimeProvider = getRealtimeProvider();
  const pusherConfigured = !!(
    process.env.PUSHER_APP_ID?.trim() &&
    process.env.PUSHER_KEY?.trim() &&
    process.env.PUSHER_SECRET?.trim() &&
    process.env.PUSHER_CLUSTER?.trim()
  );
  const localConfigured = realtimeProvider === "local";
  const websocketConfigured =
    realtimeProvider === "pusher" ? pusherConfigured : localConfigured;

  return {
    deployment,
    redis: { backend: redisBackend, healthy: redisHealthy },
    websocket: {
      provider: realtimeProvider,
      configured: websocketConfigured,
    },
  };
}

export interface AdminCursorAgentRunRow {
  runId: string;
  agentId: string;
  /** Derived: running until terminal metadata is written */
  status: string;
  createdAt: number | null;
  updatedAt: number | null;
  promptPreview?: string;
  agentTitle?: string;
  modelId?: string;
  prUrl?: string;
  terminalStatus?: string;
  summaryPreview?: string;
  errorPreview?: string;
  isFollowup?: boolean;
  previousRunId?: string;
  nextRunId?: string;
  agentDashboardUrl?: string;
}

async function listCursorSdkRunsForAdmin(
  redis: Redis,
  limit: number
): Promise<{
  runs: AdminCursorAgentRunRow[];
  totalCount: number;
  scanIncomplete: boolean;
}> {
  const { runs, totalCount, scanIncomplete } = await listCursorSdkRunsFromRedis(
    redis,
    limit
  );
  return {
    runs: runs as AdminCursorAgentRunRow[],
    totalCount,
    scanIncomplete,
  };
}

async function getStats(redis: Redis): Promise<{ totalUsers: number; totalRooms: number; totalMessages: number }> {
  try {
    const userCount = (await getAllUsers(redis)).length;
    const roomIds = await getAdminRoomIds(redis);
    const roomCount = roomIds?.length || 0;

    let messageCount = 0;
    for (const roomId of roomIds) {
      messageCount += (await getAdminRoomMessages(redis, roomId)).length;
    }

    return { totalUsers: userCount, totalRooms: roomCount, totalMessages: messageCount };
  } catch (error) {
    console.error("Error fetching stats:", error);
    return { totalUsers: 0, totalRooms: 0, totalMessages: 0 };
  }
}

type RedisKeyType = "string" | "list" | "set" | "hash" | "zset" | "none" | "stream" | "unknown";

interface RedisKeySummary {
  key: string;
  type: RedisKeyType;
  ttl: number | null;
}

interface RedisKeyDocument extends RedisKeySummary {
  value: unknown;
  length: number | null;
  truncated: boolean;
}

const REDIS_BROWSER_SCAN_COUNT_DEFAULT = 100;
const REDIS_BROWSER_SCAN_COUNT_MAX = 1000;
// SCAN MATCH filters server-side but still walks the entire keyspace, so a
// single SCAN call returns few/zero matches for a sparse prefix while leaving a
// non-zero cursor. We loop internally (bounded by this cap) to gather a useful
// page per request instead of forcing many client round-trips. If the cap is
// hit before the page fills, we hand the cursor back so "Load more" continues.
const REDIS_BROWSER_SCAN_MAX_ITERATIONS = 50;
const REDIS_BROWSER_VALUE_PREVIEW_LIMIT = 200;
const REDIS_BROWSER_BACKUP_KEY_LIMIT_DEFAULT = 500;
const REDIS_BROWSER_BACKUP_KEY_LIMIT_MAX = 1000;

function normalizeRedisPattern(pattern: unknown): string {
  if (typeof pattern !== "string") return "*";
  const trimmed = pattern.trim();
  return trimmed.length > 0 ? trimmed : "*";
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function normalizeRedisCursor(cursor: unknown): string | number {
  if (typeof cursor === "number") return cursor;
  if (typeof cursor === "string" && cursor.trim()) return cursor.trim();
  return 0;
}

function coerceRedisType(rawType: unknown): RedisKeyType {
  if (typeof rawType !== "string" || rawType.length === 0) return "unknown";
  if (
    rawType === "string" ||
    rawType === "list" ||
    rawType === "set" ||
    rawType === "hash" ||
    rawType === "zset" ||
    rawType === "none" ||
    rawType === "stream"
  ) {
    return rawType;
  }
  return "unknown";
}

function coerceRedisTtl(rawTtl: unknown): number | null {
  if (typeof rawTtl === "number" && Number.isFinite(rawTtl)) return rawTtl;
  if (typeof rawTtl === "string") {
    const parsed = Number.parseInt(rawTtl, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function getRedisKeyType(redis: Redis, key: string): Promise<RedisKeyType> {
  try {
    const typedRedis = redis as Redis & { type?: (key: string) => Promise<string> };
    const rawType = await typedRedis.type?.(key);
    return coerceRedisType(rawType);
  } catch (error) {
    console.error("Error reading Redis type", { key, error });
    return "unknown";
  }
}

async function getRedisTtl(redis: Redis, key: string): Promise<number | null> {
  try {
    return await redis.ttl(key);
  } catch {
    return null;
  }
}

async function getRedisKeySummary(redis: Redis, key: string): Promise<RedisKeySummary> {
  const [type, ttl] = await Promise.all([
    getRedisKeyType(redis, key),
    getRedisTtl(redis, key),
  ]);
  return { key, type, ttl };
}

/**
 * Fetch type + TTL for many keys in a single pipelined round-trip instead of
 * 2 round-trips per key. Falls back to the per-key path if the pipeline fails.
 */
async function getRedisKeySummaries(
  redis: Redis,
  keys: string[]
): Promise<RedisKeySummary[]> {
  if (keys.length === 0) return [];
  try {
    const pipeline = redis.pipeline();
    for (const key of keys) {
      pipeline.type(key);
    }
    for (const key of keys) {
      pipeline.ttl(key);
    }
    const results = (await pipeline.exec()) as unknown[];
    return keys.map((key, index) => ({
      key,
      type: coerceRedisType(results[index]),
      ttl: coerceRedisTtl(results[keys.length + index]),
    }));
  } catch (error) {
    console.error("Error pipelining Redis key summaries; falling back to per-key reads", {
      error,
    });
    return Promise.all(keys.map((key) => getRedisKeySummary(redis, key)));
  }
}

function truncateObjectEntries(
  value: Record<string, unknown>,
  limit: number
): { value: Record<string, unknown>; truncated: boolean; length: number } {
  const entries = Object.entries(value);
  if (entries.length <= limit) {
    return { value, truncated: false, length: entries.length };
  }
  return {
    value: Object.fromEntries(entries.slice(0, limit)),
    truncated: true,
    length: entries.length,
  };
}

async function getRedisKeyDocument(
  redis: Redis,
  key: string,
  options: { full?: boolean } = {}
): Promise<RedisKeyDocument | null> {
  const exists = await redis.exists(key);
  if (exists === 0) return null;

  const summary = await getRedisKeySummary(redis, key);
  const previewLimit = options.full ? Number.POSITIVE_INFINITY : REDIS_BROWSER_VALUE_PREVIEW_LIMIT;

  try {
    switch (summary.type) {
      case "string": {
        const value = await redis.get(key);
        const stringValue =
          typeof value === "string" ? value : JSON.stringify(value ?? null);
        return {
          ...summary,
          value,
          length: stringValue.length,
          truncated: false,
        };
      }
      case "list": {
        const length = await redis.llen(key);
        const value = await redis.lrange(
          key,
          0,
          options.full ? -1 : REDIS_BROWSER_VALUE_PREVIEW_LIMIT - 1
        );
        return {
          ...summary,
          value,
          length,
          truncated: !options.full && length > previewLimit,
        };
      }
      case "set": {
        const members = await redis.smembers<string[]>(key);
        return {
          ...summary,
          value: options.full ? members : members.slice(0, REDIS_BROWSER_VALUE_PREVIEW_LIMIT),
          length: members.length,
          truncated: !options.full && members.length > previewLimit,
        };
      }
      case "hash": {
        const hash = (await redis.hgetall<Record<string, unknown>>(key)) ?? {};
        const limited = options.full
          ? { value: hash, truncated: false, length: Object.keys(hash).length }
          : truncateObjectEntries(hash, REDIS_BROWSER_VALUE_PREVIEW_LIMIT);
        return {
          ...summary,
          value: limited.value,
          length: limited.length,
          truncated: limited.truncated,
        };
      }
      case "zset": {
        const length = await redis.zcard(key);
        const value = await redis.zrange(
          key,
          0,
          options.full ? -1 : REDIS_BROWSER_VALUE_PREVIEW_LIMIT - 1
        );
        return {
          ...summary,
          value,
          length,
          truncated: !options.full && length > previewLimit,
        };
      }
      case "none":
        return null;
      default: {
        const value = await redis.get(key).catch(() => null);
        return {
          ...summary,
          value,
          length: null,
          truncated: false,
        };
      }
    }
  } catch (error) {
    console.error("Error reading Redis key", { key, error });
    return {
      ...summary,
      value: null,
      length: null,
      truncated: false,
    };
  }
}

async function listRedisKeys(
  redis: Redis,
  input: { pattern: string; cursor: string | number; count: number }
): Promise<{ keys: RedisKeySummary[]; cursor: string; pattern: string; count: number }> {
  const targetCount = input.count;
  // SCAN COUNT is only a hint; use a generous per-iteration hint so we walk the
  // keyspace quickly when matches are sparse, but never below the requested page.
  const perIterationCount = Math.min(
    Math.max(targetCount, REDIS_BROWSER_SCAN_COUNT_DEFAULT),
    REDIS_BROWSER_SCAN_COUNT_MAX
  );

  const collected: string[] = [];
  const seen = new Set<string>();
  let cursor: string | number = input.cursor;
  let iterations = 0;

  do {
    const [nextCursor, batch] = await redis.scan(cursor, {
      match: input.pattern,
      count: perIterationCount,
    });
    cursor = nextCursor;
    for (const key of batch) {
      if (!seen.has(key)) {
        seen.add(key);
        collected.push(key);
      }
    }
    iterations++;
  } while (
    cursor !== 0 &&
    cursor !== "0" &&
    collected.length < targetCount &&
    iterations < REDIS_BROWSER_SCAN_MAX_ITERATIONS
  );

  const summaries = await getRedisKeySummaries(redis, collected.sort());
  return {
    keys: summaries,
    cursor: String(cursor),
    pattern: input.pattern,
    count: summaries.length,
  };
}

async function backupRedisKeys(
  redis: Redis,
  input: { pattern: string; limit: number }
): Promise<{
  exportedAt: string;
  pattern: string;
  keyCount: number;
  truncated: boolean;
  keys: RedisKeyDocument[];
}> {
  const keys: string[] = [];
  let cursor: string | number = 0;
  let iterations = 0;

  do {
    const [nextCursor, batch] = await redis.scan(cursor, {
      match: input.pattern,
      count: REDIS_BROWSER_SCAN_COUNT_MAX,
    });
    cursor = nextCursor;
    keys.push(...batch);
    iterations++;
  } while (
    cursor !== 0 &&
    cursor !== "0" &&
    keys.length < input.limit &&
    iterations < 200
  );

  const limitedKeys = Array.from(new Set(keys)).sort().slice(0, input.limit);
  const documents = (
    await Promise.all(
      limitedKeys.map((key) => getRedisKeyDocument(redis, key, { full: true }))
    )
  ).filter((document): document is RedisKeyDocument => document !== null);

  return {
    exportedAt: new Date().toISOString(),
    pattern: input.pattern,
    keyCount: documents.length,
    truncated: keys.length > input.limit || (cursor !== 0 && cursor !== "0"),
    keys: documents,
  };
}

interface UserMemory {
  key: string;
  summary: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

async function getUserMemories(redis: Redis, targetUsername: string): Promise<UserMemory[]> {
  const normalizedUsername = targetUsername.toLowerCase();

  try {
    const index = await getMemoryIndex(redis, normalizedUsername);
    if (!index || index.memories.length === 0) {
      return [];
    }

    // Fetch all memory details in parallel
    const memoriesWithDetails = await Promise.all(
      index.memories.map(async (entry: MemoryEntry) => {
        const detail = await getMemoryDetail(redis, normalizedUsername, entry.key);
        return {
          key: entry.key,
          summary: entry.summary,
          content: detail?.content || "",
          createdAt: detail?.createdAt || entry.updatedAt,
          updatedAt: entry.updatedAt,
        };
      })
    );

    // Sort by most recently updated
    memoriesWithDetails.sort((a, b) => b.updatedAt - a.updatedAt);

    return memoriesWithDetails;
  } catch (error) {
    console.error(`Error fetching memories for ${normalizedUsername}:`, error);
    return [];
  }
}

export default apiHandler<AdminRequest>(
  {
    methods: ["GET", "POST"],
    auth: "admin",
    parseJsonBody: true,
  },
  async ({ req, res, redis, logger, startTime, body, user }): Promise<void> => {
    logger.info("Processing admin request", { username: user?.username, hasToken: !!user?.token });
    // No /api/admin rate limit: only `ryo` passes the check above.

    const action = req.query.action as string | undefined;

    if (req.method === "GET") {
      logger.info("GET request", { action });

      switch (action) {
        case "getStats": {
          const stats = await getStats(redis);
          logger.info("Stats retrieved", stats);
          logger.response(200, Date.now() - startTime);
          res.status(200).json(stats);
          return;
        }
        case "getAllUsers": {
          const users = await getAllUsers(redis);
          logger.info("Users retrieved", { count: users.length });
          logger.response(200, Date.now() - startTime);
          res.status(200).json({ users });
          return;
        }
        case "getUserProfile": {
          const targetUsername = req.query.username as string | undefined;
          if (!targetUsername) {
            logger.response(400, Date.now() - startTime);
            res.status(400).json({ error: "Username is required" });
            return;
          }
          const profile = await getUserProfile(redis, targetUsername);
          if (!profile) {
            logger.response(404, Date.now() - startTime);
            res.status(404).json({ error: "User not found" });
            return;
          }
          logger.info("Profile retrieved", { targetUsername });
          logger.response(200, Date.now() - startTime);
          res.status(200).json(profile);
          return;
        }
        case "getUserMessages": {
          const targetUsername = req.query.username as string | undefined;
          const limit = parseInt((req.query.limit as string) || "50");
          if (!targetUsername) {
            logger.response(400, Date.now() - startTime);
            res.status(400).json({ error: "Username is required" });
            return;
          }
          const messages = await getUserMessages(redis, targetUsername, limit);
          logger.info("Messages retrieved", { targetUsername, count: messages.length });
          logger.response(200, Date.now() - startTime);
          res.status(200).json({ messages });
          return;
        }
        case "getUserMemories": {
          const targetUsername = req.query.username as string | undefined;
          if (!targetUsername) {
            logger.response(400, Date.now() - startTime);
            res.status(400).json({ error: "Username is required" });
            return;
          }
          const [memories, dailyNotes] = await Promise.all([
            getUserMemories(redis, targetUsername),
            getRecentDailyNotes(redis, targetUsername.toLowerCase(), 7) as Promise<DailyNote[]>,
          ]);
          logger.info("Memories retrieved", {
            targetUsername,
            memoryCount: memories.length,
            dailyNoteCount: dailyNotes.length,
          });
          logger.response(200, Date.now() - startTime);
          res.status(200).json({ memories, dailyNotes });
          return;
        }
        case "getUserHeartbeats": {
          const targetUsername = req.query.username as string | undefined;
          const days = Math.min(parseInt((req.query.days as string) || "7"), 30);
          if (!targetUsername) {
            logger.response(400, Date.now() - startTime);
            res.status(400).json({ error: "Username is required" });
            return;
          }
          const heartbeats = await getRecentHeartbeatRecords(
            redis,
            targetUsername.toLowerCase(),
            days,
          ) as HeartbeatRecord[];
          logger.info("Heartbeats retrieved", {
            targetUsername,
            days,
            count: heartbeats.length,
          });
          logger.response(200, Date.now() - startTime);
          res.status(200).json({ heartbeats });
          return;
        }
        case "getServerInfo": {
          const serverInfo = await getServerInfo(redis);
          logger.info("Server info retrieved", serverInfo);
          logger.response(200, Date.now() - startTime);
          res.status(200).json(serverInfo);
          return;
        }
        case "getAnalytics": {
          const days = Math.min(Math.max(parseInt((req.query.days as string) || "7"), 1), 90);
          const detail = req.query.detail === "true";
          if (detail) {
            const data: AnalyticsDetail = await getAnalyticsDetail(redis, days);
            logger.info("Analytics detail retrieved", { days });
            logger.response(200, Date.now() - startTime);
            res.status(200).json(data);
          } else {
            const data: AnalyticsSummary = await getAnalyticsSummary(redis, days);
            logger.info("Analytics summary retrieved", { days });
            logger.response(200, Date.now() - startTime);
            res.status(200).json(data);
          }
          return;
        }
        case "getCursorAgentRuns": {
          const limit = Math.min(
            Math.max(parseInt((req.query.limit as string) || "50", 10) || 50, 1),
            100
          );
          const { runs, totalCount, scanIncomplete } =
            await listCursorSdkRunsForAdmin(redis, limit);
          const sliceTruncated = totalCount > limit;
          logger.info("Cursor agent runs listed", {
            count: runs.length,
            totalCount,
            limit,
            scanIncomplete,
            sliceTruncated,
          });
          logger.response(200, Date.now() - startTime);
          res.status(200).json({
            runs,
            totalCount,
            truncated: sliceTruncated || scanIncomplete,
            scanIncomplete,
          });
          return;
        }
        case "listRedisKeys": {
          const pattern = normalizeRedisPattern(req.query.pattern);
          const cursor = normalizeRedisCursor(req.query.cursor);
          const count = clampInteger(
            req.query.count,
            REDIS_BROWSER_SCAN_COUNT_DEFAULT,
            1,
            REDIS_BROWSER_SCAN_COUNT_MAX
          );
          const data = await listRedisKeys(redis, { pattern, cursor, count });
          logger.info("Redis keys listed", {
            pattern,
            cursor: data.cursor,
            count: data.count,
          });
          logger.response(200, Date.now() - startTime);
          res.status(200).json(data);
          return;
        }
        case "getRedisKey": {
          const key = typeof req.query.key === "string" ? req.query.key : "";
          if (!key) {
            logger.response(400, Date.now() - startTime);
            res.status(400).json({ error: "Redis key is required" });
            return;
          }
          const data = await getRedisKeyDocument(redis, key);
          if (!data) {
            logger.response(404, Date.now() - startTime);
            res.status(404).json({ error: "Redis key not found" });
            return;
          }
          logger.info("Redis key retrieved", { key, type: data.type });
          logger.response(200, Date.now() - startTime);
          res.status(200).json(data);
          return;
        }
        case "backupRedisKeys": {
          const pattern = normalizeRedisPattern(req.query.pattern);
          const limit = clampInteger(
            req.query.limit,
            REDIS_BROWSER_BACKUP_KEY_LIMIT_DEFAULT,
            1,
            REDIS_BROWSER_BACKUP_KEY_LIMIT_MAX
          );
          const data = await backupRedisKeys(redis, { pattern, limit });
          logger.info("Redis backup generated", {
            pattern,
            keyCount: data.keyCount,
            truncated: data.truncated,
          });
          logger.response(200, Date.now() - startTime);
          res.status(200).json(data);
          return;
        }
        default:
          logger.response(400, Date.now() - startTime);
          res.status(400).json({ error: "Invalid action" });
          return;
      }
    }

    if (req.method === "POST") {
      const postAction = body?.action;
      const targetUsername = body?.targetUsername;
      const reason = body?.reason;
      logger.info("POST request", { action: postAction, targetUsername });

      switch (postAction) {
        case "deleteUser": {
          if (!targetUsername) {
            logger.response(400, Date.now() - startTime);
            res.status(400).json({ error: "Target username is required" });
            return;
          }
          const result = await deleteUser(redis, targetUsername);
          if (result.success) {
            logger.info("User deleted", { targetUsername });
            logger.response(200, Date.now() - startTime);
            res.status(200).json({ success: true });
            return;
          }
          logger.error("Delete user failed", { targetUsername, error: result.error });
          logger.response(400, Date.now() - startTime);
          res.status(400).json({ error: result.error });
          return;
        }
        case "banUser": {
          if (!targetUsername) {
            logger.response(400, Date.now() - startTime);
            res.status(400).json({ error: "Target username is required" });
            return;
          }
          const result = await banUser(redis, targetUsername, reason);
          if (result.success) {
            logger.info("User banned", { targetUsername, reason });
            logger.response(200, Date.now() - startTime);
            res.status(200).json({ success: true });
            return;
          }
          logger.error("Ban user failed", { targetUsername, error: result.error });
          logger.response(400, Date.now() - startTime);
          res.status(400).json({ error: result.error });
          return;
        }
        case "unbanUser": {
          if (!targetUsername) {
            logger.response(400, Date.now() - startTime);
            res.status(400).json({ error: "Target username is required" });
            return;
          }
          const result = await unbanUser(redis, targetUsername);
          if (result.success) {
            logger.info("User unbanned", { targetUsername });
            logger.response(200, Date.now() - startTime);
            res.status(200).json({ success: true });
            return;
          }
          logger.error("Unban user failed", { targetUsername, error: result.error });
          logger.response(400, Date.now() - startTime);
          res.status(400).json({ error: result.error });
          return;
        }
        case "clearUserMemories": {
          if (!targetUsername) {
            logger.response(400, Date.now() - startTime);
            res.status(400).json({ error: "Target username is required" });
            return;
          }
          try {
            const memResult = await clearAllMemories(redis, targetUsername.toLowerCase());
            logger.info("User memories cleared", {
              targetUsername,
              deletedCount: memResult.deletedCount,
            });
            logger.response(200, Date.now() - startTime);
            res.status(200).json({
              success: true,
              deletedCount: memResult.deletedCount,
              message:
                memResult.deletedCount > 0
                  ? `Cleared ${memResult.deletedCount} memories for ${targetUsername}`
                  : `No memories to clear for ${targetUsername}`,
            });
            return;
          } catch (error) {
            logger.error("Clear memories failed", { targetUsername, error });
            logger.response(500, Date.now() - startTime);
            res.status(500).json({ error: "Failed to clear memories" });
            return;
          }
        }
        case "startCursorAgent": {
          const prompt =
            typeof body?.prompt === "string" ? body.prompt.trim() : "";
          if (!prompt) {
            logger.response(400, Date.now() - startTime);
            res.status(400).json({ error: "Prompt is required" });
            return;
          }
          if (prompt.length > 32_000) {
            logger.response(400, Date.now() - startTime);
            res.status(400).json({ error: "Prompt is too long" });
            return;
          }
          const modelId =
            typeof body?.modelId === "string" ? body.modelId.trim() : "";
          const apiKey = process.env.CURSOR_API_KEY?.trim();
          if (!apiKey) {
            logger.response(503, Date.now() - startTime);
            res.status(503).json({ error: "Cursor SDK not configured" });
            return;
          }
          const result = await executeCursorCloudAgent(
            {
              prompt,
              ...(modelId ? { modelId } : {}),
            },
            {
              username: CURSOR_REPO_AGENT_OWNER,
              apiKey,
              redis,
              log: (message: unknown, data?: unknown) =>
                logger.info(
                  typeof message === "string" ? message : String(message),
                  data
                ),
              logError: (message: unknown, error?: unknown) =>
                logger.error(
                  typeof message === "string" ? message : String(message),
                  error
                ),
            }
          );
          if ("success" in result && result.success === false) {
            logger.response(400, Date.now() - startTime);
            res.status(400).json({
              error: result.error ?? "Cursor agent failed to start",
            });
            return;
          }
          logger.info("Cursor agent started from admin", {
            async: "async" in result && result.async,
            runId: "runId" in result ? result.runId : undefined,
          });
          logger.response(200, Date.now() - startTime);
          res.status(200).json(result);
          return;
        }
        case "forceProcessDailyNotes": {
          if (!targetUsername) {
            logger.response(400, Date.now() - startTime);
            res.status(400).json({ error: "Target username is required" });
            return;
          }
          try {
            const normalizedTarget = targetUsername.toLowerCase();
            const resetResult = await resetDailyNotesProcessedFlag(redis, normalizedTarget, 30);
            logger.info("Daily notes reset for reprocessing", {
              targetUsername,
              resetCount: resetResult.resetCount,
            });

            const processResult = await processDailyNotesForUser(
              redis,
              normalizedTarget,
              (...args: unknown[]) => logger.info(String(args[0]), args[1]),
              (...args: unknown[]) => logger.error(String(args[0]), args[1]),
            );

            const skippedCount = processResult.skippedDates?.length || 0;
            logger.info("Force process daily notes complete", {
              targetUsername,
              notesReset: resetResult.resetCount,
              notesProcessed: processResult.processed,
              memoriesCreated: processResult.created,
              memoriesUpdated: processResult.updated,
              skippedDates: processResult.skippedDates,
            });
            logger.response(200, Date.now() - startTime);
            res.status(200).json({
              success: true,
              notesReset: resetResult.resetCount,
              notesProcessed: processResult.processed,
              memoriesCreated: processResult.created,
              memoriesUpdated: processResult.updated,
              dates: processResult.dates,
              skippedDates: processResult.skippedDates,
              message:
                processResult.processed === 0
                  ? "No daily notes to process (only past days are processed, not today)"
                  : `Reprocessed ${processResult.processed} daily notes → ${processResult.created} new + ${processResult.updated} updated memories` +
                    (skippedCount > 0 ? ` (${skippedCount} days deferred to next run)` : ""),
            });
            return;
          } catch (error) {
            logger.error("Force process daily notes failed", { targetUsername, error });
            logger.response(500, Date.now() - startTime);
            res.status(500).json({ error: "Failed to process daily notes" });
            return;
          }
        }
        case "deleteRedisKey": {
          const key = typeof body?.key === "string" ? body.key : "";
          const confirmKey =
            typeof body?.confirmKey === "string" ? body.confirmKey : "";
          if (!key) {
            logger.response(400, Date.now() - startTime);
            res.status(400).json({ error: "Redis key is required" });
            return;
          }
          if (confirmKey !== key) {
            logger.response(400, Date.now() - startTime);
            res.status(400).json({ error: "Confirmation does not match Redis key" });
            return;
          }
          const deletedCount = await redis.del(key);
          logger.info("Redis key delete requested", { key, deletedCount });
          logger.response(200, Date.now() - startTime);
          res.status(200).json({
            success: deletedCount > 0,
            deletedCount,
          });
          return;
        }
        default:
          logger.response(400, Date.now() - startTime);
          res.status(400).json({ error: "Invalid action" });
          return;
      }
    }

    logger.response(405, Date.now() - startTime);
    res.status(405).json({ error: "Method not allowed" });
  }
);
