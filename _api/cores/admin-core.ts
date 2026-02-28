import { Redis } from "@upstash/redis";
import { CHAT_USERS_PREFIX } from "../rooms/_helpers/_constants.js";
import { deleteAllUserTokens, PASSWORD_HASH_PREFIX } from "../_utils/auth/index.js";
import { validateAuth } from "../_utils/auth/index.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import {
  getMemoryIndex,
  getMemoryDetail,
  getRecentDailyNotes,
  clearAllMemories,
  resetDailyNotesProcessedFlag,
  type MemoryEntry,
  type DailyNote,
} from "../_utils/_memory.js";
import { processDailyNotesForUser } from "../ai/process-daily-notes.js";
import type { CoreResponse } from "../_runtime/core-types.js";

const ADMIN_RATE_LIMIT_WINDOW = 60;
const ADMIN_RATE_LIMIT_MAX = 30;

interface AdminRequest {
  action: string;
  targetUsername?: string;
  reason?: string;
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

interface UserMemory {
  key: string;
  summary: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

interface AdminCoreInput {
  redis: Redis;
  method: string | undefined;
  action: string | undefined;
  query: Record<string, string | undefined>;
  body: unknown;
  authHeader: string | undefined;
  usernameHeader: string | undefined;
  clientIp: string;
}

async function isAdmin(
  redis: Redis,
  username: string | null,
  token: string | null
): Promise<boolean> {
  if (!username || !token) return false;
  if (username.toLowerCase() !== "ryo") return false;
  const authResult = await validateAuth(redis, username, token, {
    allowExpired: false,
  });
  return authResult.valid;
}

async function deleteUser(
  redis: Redis,
  targetUsername: string
): Promise<{ success: boolean; error?: string }> {
  const normalizedUsername = targetUsername.toLowerCase();
  if (normalizedUsername === "ryo") {
    return { success: false, error: "Cannot delete admin user" };
  }

  try {
    await redis.del(`${CHAT_USERS_PREFIX}${normalizedUsername}`);
    await redis.del(`${PASSWORD_HASH_PREFIX}${normalizedUsername}`);
    await deleteAllUserTokens(redis, normalizedUsername);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete user" };
  }
}

async function getAllUsers(
  redis: Redis
): Promise<{ username: string; lastActive: number; banned?: boolean }[]> {
  const users: { username: string; lastActive: number; banned?: boolean }[] = [];
  let cursor: string | number = 0;
  let iterations = 0;

  try {
    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: `${CHAT_USERS_PREFIX}*`,
        count: 1000,
      });
      cursor = newCursor;
      iterations++;

      if (keys.length > 0) {
        const userData = await redis.mget<
          (string | { username: string; lastActive: number; banned?: boolean } | null)[]
        >(...keys);
        for (const data of userData) {
          if (!data) continue;
          const parsed = typeof data === "string" ? JSON.parse(data) : data;
          if (parsed?.username) {
            users.push({
              username: parsed.username,
              lastActive: parsed.lastActive || 0,
              banned: parsed.banned || false,
            });
          }
        }
      }
    } while (cursor !== 0 && cursor !== "0" && iterations < 100);

    return users;
  } catch {
    return [];
  }
}

async function getUserProfile(
  redis: Redis,
  targetUsername: string
): Promise<UserProfile | null> {
  const normalizedUsername = targetUsername.toLowerCase();

  try {
    const userData = await redis.get<
      { username: string; lastActive: number; banned?: boolean; banReason?: string; bannedAt?: number } | string
    >(`${CHAT_USERS_PREFIX}${normalizedUsername}`);
    if (!userData) return null;

    const parsed = typeof userData === "string" ? JSON.parse(userData) : userData;
    let messageCount = 0;
    const userRooms: { id: string; name: string }[] = [];

    const roomIds = await redis.smembers("chat:rooms");
    const roomNameMap: Record<string, string> = {};

    for (const roomId of roomIds || []) {
      try {
        const roomData = await redis.get<{ name: string } | string>(
          `chat:room:${roomId}`
        );
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
  } catch {
    return null;
  }
}

async function getUserMessages(
  redis: Redis,
  targetUsername: string,
  limit = 50
): Promise<
  { id: string; roomId: string; roomName: string; content: string; timestamp: number }[]
> {
  const normalizedUsername = targetUsername.toLowerCase();
  const messages: {
    id: string;
    roomId: string;
    roomName: string;
    content: string;
    timestamp: number;
  }[] = [];

  try {
    const roomIds = await redis.smembers("chat:rooms");
    const roomNameMap: Record<string, string> = {};

    for (const roomId of roomIds || []) {
      try {
        const roomData = await redis.get<{ name: string } | string>(
          `chat:room:${roomId}`
        );
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
          messages.push({
            id: msgData.id,
            roomId,
            roomName: roomNameMap[roomId] || roomId,
            content: msgData.content,
            timestamp: msgData.timestamp,
          });
        }
      }
    }

    messages.sort((a, b) => b.timestamp - a.timestamp);
    return messages.slice(0, limit);
  } catch {
    return [];
  }
}

async function banUser(
  redis: Redis,
  targetUsername: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const normalizedUsername = targetUsername.toLowerCase();
  if (normalizedUsername === "ryo") {
    return { success: false, error: "Cannot ban admin user" };
  }

  try {
    const userKey = `${CHAT_USERS_PREFIX}${normalizedUsername}`;
    const userData = await redis.get<
      { username: string; lastActive: number; banned?: boolean } | string
    >(userKey);
    if (!userData) return { success: false, error: "User not found" };

    const parsed = typeof userData === "string" ? JSON.parse(userData) : userData;
    const updatedUser = {
      ...parsed,
      banned: true,
      banReason: reason || "No reason provided",
      bannedAt: Date.now(),
    };
    await redis.set(userKey, JSON.stringify(updatedUser));
    await deleteAllUserTokens(redis, normalizedUsername);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to ban user" };
  }
}

async function unbanUser(
  redis: Redis,
  targetUsername: string
): Promise<{ success: boolean; error?: string }> {
  const normalizedUsername = targetUsername.toLowerCase();

  try {
    const userKey = `${CHAT_USERS_PREFIX}${normalizedUsername}`;
    const userData = await redis.get<
      { username: string; lastActive: number; banned?: boolean } | string
    >(userKey);
    if (!userData) return { success: false, error: "User not found" };

    const parsed = typeof userData === "string" ? JSON.parse(userData) : userData;
    const updatedUser = {
      ...parsed,
      banned: false,
      banReason: undefined,
      bannedAt: undefined,
    };
    await redis.set(userKey, JSON.stringify(updatedUser));
    return { success: true };
  } catch {
    return { success: false, error: "Failed to unban user" };
  }
}

async function getStats(
  redis: Redis
): Promise<{ totalUsers: number; totalRooms: number; totalMessages: number }> {
  try {
    let userCount = 0;
    let cursor: string | number = 0;
    let iterations = 0;

    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: `${CHAT_USERS_PREFIX}*`,
        count: 1000,
      });
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
      const [newCursor, keys] = await redis.scan(cursor, {
        match: "chat:messages:*",
        count: 1000,
      });
      cursor = newCursor;
      iterations++;
      for (const key of keys) {
        const len = await redis.llen(key);
        messageCount += len;
      }
    } while (cursor !== 0 && cursor !== "0" && iterations < 100);

    return { totalUsers: userCount, totalRooms: roomCount, totalMessages: messageCount };
  } catch {
    return { totalUsers: 0, totalRooms: 0, totalMessages: 0 };
  }
}

async function getUserMemories(
  redis: Redis,
  targetUsername: string
): Promise<UserMemory[]> {
  const normalizedUsername = targetUsername.toLowerCase();

  try {
    const index = await getMemoryIndex(redis, normalizedUsername);
    if (!index || index.memories.length === 0) {
      return [];
    }

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

    memoriesWithDetails.sort((a, b) => b.updatedAt - a.updatedAt);
    return memoriesWithDetails;
  } catch {
    return [];
  }
}

export async function executeAdminCore(
  input: AdminCoreInput
): Promise<CoreResponse> {
  const token = input.authHeader?.startsWith("Bearer ")
    ? input.authHeader.slice(7)
    : null;
  const username = input.usernameHeader || null;

  const adminAccess = await isAdmin(input.redis, username, token);
  if (!adminAccess) {
    return { status: 403, body: { error: "Forbidden - Admin access required" } };
  }

  const rateLimitKey = RateLimit.makeKey([
    "rl",
    "admin",
    "user",
    username || input.clientIp,
  ]);
  const rateLimitResult = await RateLimit.checkCounterLimit({
    key: rateLimitKey,
    windowSeconds: ADMIN_RATE_LIMIT_WINDOW,
    limit: ADMIN_RATE_LIMIT_MAX,
  });

  if (!rateLimitResult.allowed) {
    return {
      status: 429,
      body: {
        error: "rate_limit_exceeded",
        limit: rateLimitResult.limit,
        retryAfter: rateLimitResult.resetSeconds,
      },
    };
  }

  if (input.method === "GET") {
    switch (input.action) {
      case "getStats": {
        const stats = await getStats(input.redis);
        return { status: 200, body: stats };
      }
      case "getAllUsers": {
        const users = await getAllUsers(input.redis);
        return { status: 200, body: { users } };
      }
      case "getUserProfile": {
        const targetUsername = input.query.username;
        if (!targetUsername) {
          return { status: 400, body: { error: "Username is required" } };
        }
        const profile = await getUserProfile(input.redis, targetUsername);
        if (!profile) return { status: 404, body: { error: "User not found" } };
        return { status: 200, body: profile };
      }
      case "getUserMessages": {
        const targetUsername = input.query.username;
        const limit = parseInt(input.query.limit || "50", 10);
        if (!targetUsername) {
          return { status: 400, body: { error: "Username is required" } };
        }
        const messages = await getUserMessages(input.redis, targetUsername, limit);
        return { status: 200, body: { messages } };
      }
      case "getUserMemories": {
        const targetUsername = input.query.username;
        if (!targetUsername) {
          return { status: 400, body: { error: "Username is required" } };
        }
        const [memories, dailyNotes] = await Promise.all([
          getUserMemories(input.redis, targetUsername),
          getRecentDailyNotes(input.redis, targetUsername.toLowerCase(), 7) as Promise<
            DailyNote[]
          >,
        ]);
        return { status: 200, body: { memories, dailyNotes } };
      }
      default:
        return { status: 400, body: { error: "Invalid action" } };
    }
  }

  if (input.method === "POST") {
    const body = input.body as AdminRequest;
    const { action: postAction, targetUsername, reason } = body || {};

    switch (postAction) {
      case "deleteUser": {
        if (!targetUsername) {
          return { status: 400, body: { error: "Target username is required" } };
        }
        const result = await deleteUser(input.redis, targetUsername);
        if (result.success) return { status: 200, body: { success: true } };
        return { status: 400, body: { error: result.error } };
      }
      case "banUser": {
        if (!targetUsername) {
          return { status: 400, body: { error: "Target username is required" } };
        }
        const result = await banUser(input.redis, targetUsername, reason);
        if (result.success) return { status: 200, body: { success: true } };
        return { status: 400, body: { error: result.error } };
      }
      case "unbanUser": {
        if (!targetUsername) {
          return { status: 400, body: { error: "Target username is required" } };
        }
        const result = await unbanUser(input.redis, targetUsername);
        if (result.success) return { status: 200, body: { success: true } };
        return { status: 400, body: { error: result.error } };
      }
      case "clearUserMemories": {
        if (!targetUsername) {
          return { status: 400, body: { error: "Target username is required" } };
        }
        try {
          const memResult = await clearAllMemories(input.redis, targetUsername.toLowerCase());
          return {
            status: 200,
            body: {
              success: true,
              deletedCount: memResult.deletedCount,
              message:
                memResult.deletedCount > 0
                  ? `Cleared ${memResult.deletedCount} memories for ${targetUsername}`
                  : `No memories to clear for ${targetUsername}`,
            },
          };
        } catch {
          return { status: 500, body: { error: "Failed to clear memories" } };
        }
      }
      case "forceProcessDailyNotes": {
        if (!targetUsername) {
          return { status: 400, body: { error: "Target username is required" } };
        }
        try {
          const normalizedTarget = targetUsername.toLowerCase();
          const resetResult = await resetDailyNotesProcessedFlag(
            input.redis,
            normalizedTarget,
            30
          );

          const processResult = await processDailyNotesForUser(
            input.redis,
            normalizedTarget,
            () => undefined,
            () => undefined
          );

          const skippedCount = processResult.skippedDates?.length || 0;
          return {
            status: 200,
            body: {
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
                    (skippedCount > 0
                      ? ` (${skippedCount} days deferred to next run)`
                      : ""),
            },
          };
        } catch {
          return { status: 500, body: { error: "Failed to process daily notes" } };
        }
      }
      default:
        return { status: 400, body: { error: "Invalid action" } };
    }
  }

  return { status: 405, body: { error: "Method not allowed" } };
}
