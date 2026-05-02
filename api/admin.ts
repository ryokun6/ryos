/**
 * Admin API endpoints
 * Only accessible by the admin user (ryo)
 * 
 * Node.js runtime with terminal logging
 */

import type { Redis } from "./_utils/redis.js";
import { CHAT_USERS_PREFIX } from "./rooms/_helpers/_constants.js";
import { deleteAllUserTokens, PASSWORD_HASH_PREFIX } from "./_utils/auth/index.js";
import { apiHandler } from "./_utils/api-handler.js";
import { resolveRequestAuth } from "./_utils/request-auth.js";
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
  executeCursorRyOsRepoAgent,
} from "./chat/tools/cursor-repo-agent.js";

/** Matches `cursorSdkMetaKey` in chat/tools/cursor-repo-agent.ts */
const CURSOR_SDK_META_KEY_PATTERN = "cursor-sdk-run:*:meta";
const META_RUN_ID_REGEX = /^cursor-sdk-run:([^:]+):meta$/;

export const runtime = "nodejs";
export const maxDuration = 30;

interface AdminRequest {
  action: string;
  targetUsername?: string;
  reason?: string;
  prompt?: string;
  modelId?: string;
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
    await redis.del(`${CHAT_USERS_PREFIX}${normalizedUsername}`);
    await redis.del(`${PASSWORD_HASH_PREFIX}${normalizedUsername}`);
    await deleteAllUserTokens(redis, normalizedUsername);
    return { success: true };
  } catch (error) {
    console.error(`Error deleting user ${normalizedUsername}:`, error);
    return { success: false, error: "Failed to delete user" };
  }
}

async function getAllUsers(redis: Redis): Promise<{ username: string; lastActive: number; banned?: boolean }[]> {
  const users: { username: string; lastActive: number; banned?: boolean }[] = [];
  let cursor: string | number = 0;
  let iterations = 0;

  try {
    do {
      const [newCursor, keys] = await redis.scan(cursor, { match: `${CHAT_USERS_PREFIX}*`, count: 1000 });
      cursor = newCursor;
      iterations++;

      if (keys.length > 0) {
        const userData = await redis.mget<(string | { username: string; lastActive: number; banned?: boolean } | null)[]>(...keys);
        for (const data of userData) {
          if (!data) continue;
          const parsed = typeof data === "string" ? JSON.parse(data) : data;
          if (parsed?.username) {
            users.push({ username: parsed.username, lastActive: parsed.lastActive || 0, banned: parsed.banned || false });
          }
        }
      }
    } while (cursor !== 0 && cursor !== "0" && iterations < 100);

    return users;
  } catch (error) {
    console.error("Error fetching all users:", error);
    return [];
  }
}

async function getUserProfile(redis: Redis, targetUsername: string): Promise<UserProfile | null> {
  const normalizedUsername = targetUsername.toLowerCase();

  try {
    const userData = await redis.get<{ username: string; lastActive: number; banned?: boolean; banReason?: string; bannedAt?: number } | string>(`${CHAT_USERS_PREFIX}${normalizedUsername}`);
    if (!userData) return null;

    const parsed = typeof userData === "string" ? JSON.parse(userData) : userData;
    let messageCount = 0;
    const userRooms: { id: string; name: string }[] = [];
    
    const roomIds = await redis.smembers("chat:rooms");
    const roomNameMap: Record<string, string> = {};
    
    for (const roomId of roomIds || []) {
      try {
        const roomData = await redis.get<{ name: string } | string>(`chat:room:${roomId}`);
        if (roomData) {
          const p = typeof roomData === "string" ? JSON.parse(roomData) : roomData;
          roomNameMap[roomId] = p.name || roomId;
        } else {
          roomNameMap[roomId] = roomId;
        }
      } catch {
        roomNameMap[roomId] = roomId;
      }
    }
    
    for (const roomId of roomIds || []) {
      const messages = await redis.lrange(`chat:messages:${roomId}`, 0, -1);
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
    const roomIds = await redis.smembers("chat:rooms");
    const roomNameMap: Record<string, string> = {};
    
    for (const roomId of roomIds || []) {
      try {
        const roomData = await redis.get<{ name: string } | string>(`chat:room:${roomId}`);
        if (roomData) {
          const p = typeof roomData === "string" ? JSON.parse(roomData) : roomData;
          roomNameMap[roomId] = p.name || roomId;
        } else {
          roomNameMap[roomId] = roomId;
        }
      } catch {
        roomNameMap[roomId] = roomId;
      }
    }
    
    for (const roomId of roomIds || []) {
      const roomMessages = await redis.lrange(`chat:messages:${roomId}`, 0, -1);
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
    const userKey = `${CHAT_USERS_PREFIX}${normalizedUsername}`;
    const userData = await redis.get<{ username: string; lastActive: number; banned?: boolean } | string>(userKey);
    if (!userData) return { success: false, error: "User not found" };

    const parsed = typeof userData === "string" ? JSON.parse(userData) : userData;
    const updatedUser = { ...parsed, banned: true, banReason: reason || "No reason provided", bannedAt: Date.now() };
    await redis.set(userKey, JSON.stringify(updatedUser));
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
    const userKey = `${CHAT_USERS_PREFIX}${normalizedUsername}`;
    const userData = await redis.get<{ username: string; lastActive: number; banned?: boolean } | string>(userKey);
    if (!userData) return { success: false, error: "User not found" };

    const parsed = typeof userData === "string" ? JSON.parse(userData) : userData;
    const updatedUser = { ...parsed, banned: false, banReason: undefined, bannedAt: undefined };
    await redis.set(userKey, JSON.stringify(updatedUser));
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
}

function parseStoredRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") {
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw) as unknown;
        return parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>)
          : null;
      } catch {
        return null;
      }
    }
    return null;
  }
  return raw as Record<string, unknown>;
}

function strField(rec: Record<string, unknown>, key: string): string | undefined {
  const v = rec[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function numField(rec: Record<string, unknown>, key: string): number | null {
  const v = rec[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function previewFromSummary(summary: string | undefined, max = 160): string | undefined {
  if (!summary || summary.trim().length === 0) return undefined;
  const t = summary.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

async function listCursorSdkRunsForAdmin(
  redis: Redis,
  limit: number
): Promise<{ runs: AdminCursorAgentRunRow[]; scanIncomplete: boolean }> {
  const metaKeys = new Set<string>();
  let cursor: string | number = 0;
  let iterations = 0;
  const maxIterations = 200;

  try {
    do {
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: CURSOR_SDK_META_KEY_PATTERN,
        count: 500,
      });
      cursor = nextCursor;
      iterations++;
      for (const k of keys) {
        if (typeof k === "string") metaKeys.add(k);
      }
    } while (cursor !== 0 && cursor !== "0" && iterations < maxIterations);
  } catch (e) {
    console.error("listCursorSdkRunsForAdmin scan failed", e);
    return { runs: [], scanIncomplete: false };
  }

  const scanIncomplete = iterations >= maxIterations && cursor !== 0 && cursor !== "0";

  const keyList = [...metaKeys];
  const rows: AdminCursorAgentRunRow[] = [];
  const batchSize = 40;

  for (let i = 0; i < keyList.length; i += batchSize) {
    const batch = keyList.slice(i, i + batchSize);
    let values: unknown[];
    try {
      values = await redis.mget<unknown[]>(...batch);
    } catch (e) {
      console.error("listCursorSdkRunsForAdmin mget failed", e);
      continue;
    }

    for (let j = 0; j < batch.length; j++) {
      const key = batch[j]!;
      const rec = parseStoredRecord(values[j]);
      if (!rec) continue;

      const fromKey = META_RUN_ID_REGEX.exec(key)?.[1];
      const runId = strField(rec, "runId") ?? fromKey;
      if (!runId) continue;

      const agentId = strField(rec, "agentId") ?? "";
      const terminalStatus = strField(rec, "terminalStatus");
      const finishedAt = numField(rec, "finishedAt");
      const createdAt = numField(rec, "createdAt");
      const updatedAt = finishedAt ?? createdAt;
      const activeRunId = rec["activeRunId"];
      const isRunning =
        !terminalStatus &&
        (activeRunId === runId ||
          activeRunId === null ||
          activeRunId === undefined);

      let status: string;
      if (isRunning) {
        status = "running";
      } else if (terminalStatus === "finished") {
        status = "finished";
      } else if (terminalStatus) {
        status = terminalStatus;
      } else {
        status = "unknown";
      }

      const summaryRaw = strField(rec, "summary");
      const errorRaw = strField(rec, "error");

      rows.push({
        runId,
        agentId,
        status,
        createdAt,
        updatedAt,
        promptPreview: strField(rec, "promptPreview"),
        agentTitle: strField(rec, "agentTitle"),
        modelId: strField(rec, "modelId"),
        prUrl: strField(rec, "prUrl"),
        terminalStatus,
        summaryPreview: previewFromSummary(summaryRaw),
        errorPreview: previewFromSummary(errorRaw, 120),
        isFollowup: rec.isFollowup === true,
        previousRunId: strField(rec, "previousRunId"),
      });
    }
  }

  const dedup = new Map<string, AdminCursorAgentRunRow>();
  for (const r of rows) {
    dedup.set(r.runId, r);
  }

  const list = [...dedup.values()];
  list.sort((a, b) => {
    const ar = a.status === "running" ? 1 : 0;
    const br = b.status === "running" ? 1 : 0;
    if (ar !== br) return br - ar;
    const at = a.updatedAt ?? a.createdAt ?? 0;
    const bt = b.updatedAt ?? b.createdAt ?? 0;
    return bt - at;
  });

  return {
    runs: list.slice(0, limit),
    scanIncomplete,
  };
}

async function getStats(redis: Redis): Promise<{ totalUsers: number; totalRooms: number; totalMessages: number }> {
  try {
    let userCount = 0;
    let cursor: string | number = 0;
    let iterations = 0;
    
    do {
      const [newCursor, keys] = await redis.scan(cursor, { match: `${CHAT_USERS_PREFIX}*`, count: 1000 });
      cursor = newCursor;
      userCount += keys.length;
      iterations++;
    } while (cursor !== 0 && cursor !== "0" && iterations < 100);

    const roomIds = await redis.smembers("chat:rooms");
    const roomCount = roomIds?.length || 0;

    let messageCount = 0;
    cursor = 0;
    iterations = 0;
    do {
      const [newCursor, keys] = await redis.scan(cursor, { match: "chat:messages:*", count: 1000 });
      cursor = newCursor;
      iterations++;
      for (const key of keys) {
        const len = await redis.llen(key);
        messageCount += len;
      }
    } while (cursor !== 0 && cursor !== "0" && iterations < 100);

    return { totalUsers: userCount, totalRooms: roomCount, totalMessages: messageCount };
  } catch (error) {
    console.error("Error fetching stats:", error);
    return { totalUsers: 0, totalRooms: 0, totalMessages: 0 };
  }
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
    parseJsonBody: true,
  },
  async ({ req, res, redis, logger, startTime, body }): Promise<void> => {
    const authResolution = await resolveRequestAuth(req, redis, {
      required: false,
      allowExpired: false,
    });

    const username = authResolution.user?.username || null;
    logger.info("Processing admin request", { username, hasToken: !!authResolution.user?.token });

    // Keep historical contract: any non-admin state returns 403.
    if (authResolution.error || !authResolution.user || authResolution.user.username !== "ryo") {
      logger.warn("Admin access denied", { username, authError: authResolution.error });
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Forbidden - Admin access required" });
      return;
    }

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
          const { runs, scanIncomplete } = await listCursorSdkRunsForAdmin(redis, limit);
          const sliceTruncated = runs.length >= limit;
          logger.info("Cursor agent runs listed", {
            count: runs.length,
            limit,
            scanIncomplete,
            sliceTruncated,
          });
          logger.response(200, Date.now() - startTime);
          res.status(200).json({
            runs,
            truncated: sliceTruncated || scanIncomplete,
            scanIncomplete,
          });
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
          const result = await executeCursorRyOsRepoAgent(
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
