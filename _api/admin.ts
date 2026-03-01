/**
 * Admin API endpoints
 * Only accessible by the admin user (ryo)
 * 
 * Node.js runtime with terminal logging
 */

import type { Redis } from "@upstash/redis";
import { CHAT_USERS_PREFIX } from "./rooms/_helpers/_constants.js";
import { deleteAllUserTokens, PASSWORD_HASH_PREFIX } from "./_utils/auth/index.js";
import { createApiHandler } from "./_utils/handler.js";
import { getMemoryIndex, getMemoryDetail, getRecentDailyNotes, clearAllMemories, resetDailyNotesProcessedFlag, type MemoryEntry, type DailyNote } from "./_utils/_memory.js";
import { processDailyNotesForUser } from "./ai/process-daily-notes.js";

export const runtime = "nodejs";
export const maxDuration = 30;

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

export default createApiHandler(
  {
    operation: "admin",
    methods: ["GET", "POST"],
  },
  async (_req, _res, ctx): Promise<void> => {
    const user = await ctx.requireAuth({
      requireAdmin: true,
      missingMessage: "Forbidden - Admin access required",
      invalidMessage: "Forbidden - Admin access required",
      forbiddenMessage: "Forbidden - Admin access required",
      missingStatus: 403,
      invalidStatus: 403,
      forbiddenStatus: 403,
    });
    if (!user) {
      return;
    }

    ctx.logger.info("Processing admin request", {
      username: user.username,
      hasToken: true,
    });

    if (
      !(await ctx.applyRateLimit({
        prefix: "admin",
        windowSeconds: ADMIN_RATE_LIMIT_WINDOW,
        limit: ADMIN_RATE_LIMIT_MAX,
        by: "user",
        identifier: user.username,
        message: "rate_limit_exceeded",
      }))
    ) {
      return;
    }

    const action = ctx.getQueryParam("action");

    if (ctx.method === "GET") {
      ctx.logger.info("GET request", { action });

      switch (action) {
        case "getStats": {
          const stats = await getStats(ctx.redis);
          ctx.logger.info("Stats retrieved", stats);
          ctx.response.ok(stats);
          return;
        }
        case "getAllUsers": {
          const users = await getAllUsers(ctx.redis);
          ctx.logger.info("Users retrieved", { count: users.length });
          ctx.response.ok({ users });
          return;
        }
        case "getUserProfile": {
          const targetUsername = ctx.getQueryParam("username");
          if (!targetUsername) {
            ctx.response.badRequest("Username is required");
            return;
          }
          const profile = await getUserProfile(ctx.redis, targetUsername);
          if (!profile) {
            ctx.response.notFound("User not found");
            return;
          }
          ctx.logger.info("Profile retrieved", { targetUsername });
          ctx.response.ok(profile);
          return;
        }
        case "getUserMessages": {
          const targetUsername = ctx.getQueryParam("username");
          const limit = parseInt(ctx.getQueryParam("limit") || "50", 10);
          if (!targetUsername) {
            ctx.response.badRequest("Username is required");
            return;
          }
          const messages = await getUserMessages(ctx.redis, targetUsername, limit);
          ctx.logger.info("Messages retrieved", {
            targetUsername,
            count: messages.length,
          });
          ctx.response.ok({ messages });
          return;
        }
        case "getUserMemories": {
          const targetUsername = ctx.getQueryParam("username");
          if (!targetUsername) {
            ctx.response.badRequest("Username is required");
            return;
          }
          const [memories, dailyNotes] = await Promise.all([
            getUserMemories(ctx.redis, targetUsername),
            getRecentDailyNotes(
              ctx.redis,
              targetUsername.toLowerCase(),
              7
            ) as Promise<DailyNote[]>,
          ]);
          ctx.logger.info("Memories retrieved", {
            targetUsername,
            memoryCount: memories.length,
            dailyNoteCount: dailyNotes.length,
          });
          ctx.response.ok({ memories, dailyNotes });
          return;
        }
        default:
          ctx.response.badRequest("Invalid action");
          return;
      }
    }

    const { data: body, error } = ctx.parseJsonBody<AdminRequest>();
    if (error || !body) {
      ctx.response.badRequest(error ?? "Invalid JSON body");
      return;
    }

    const { action: postAction, targetUsername, reason } = body;
    ctx.logger.info("POST request", { action: postAction, targetUsername });

    switch (postAction) {
      case "deleteUser": {
        if (!targetUsername) {
          ctx.response.badRequest("Target username is required");
          return;
        }
        const result = await deleteUser(ctx.redis, targetUsername);
        if (result.success) {
          ctx.logger.info("User deleted", { targetUsername });
          ctx.response.ok({ success: true });
          return;
        }
        ctx.logger.error("Delete user failed", {
          targetUsername,
          error: result.error,
        });
        ctx.response.badRequest(result.error || "Failed to delete user");
        return;
      }
      case "banUser": {
        if (!targetUsername) {
          ctx.response.badRequest("Target username is required");
          return;
        }
        const result = await banUser(ctx.redis, targetUsername, reason);
        if (result.success) {
          ctx.logger.info("User banned", { targetUsername, reason });
          ctx.response.ok({ success: true });
          return;
        }
        ctx.logger.error("Ban user failed", {
          targetUsername,
          error: result.error,
        });
        ctx.response.badRequest(result.error || "Failed to ban user");
        return;
      }
      case "unbanUser": {
        if (!targetUsername) {
          ctx.response.badRequest("Target username is required");
          return;
        }
        const result = await unbanUser(ctx.redis, targetUsername);
        if (result.success) {
          ctx.logger.info("User unbanned", { targetUsername });
          ctx.response.ok({ success: true });
          return;
        }
        ctx.logger.error("Unban user failed", {
          targetUsername,
          error: result.error,
        });
        ctx.response.badRequest(result.error || "Failed to unban user");
        return;
      }
      case "clearUserMemories": {
        if (!targetUsername) {
          ctx.response.badRequest("Target username is required");
          return;
        }
        try {
          const memResult = await clearAllMemories(
            ctx.redis,
            targetUsername.toLowerCase()
          );
          ctx.logger.info("User memories cleared", {
            targetUsername,
            deletedCount: memResult.deletedCount,
          });
          ctx.response.ok({
            success: true,
            deletedCount: memResult.deletedCount,
            message:
              memResult.deletedCount > 0
                ? `Cleared ${memResult.deletedCount} memories for ${targetUsername}`
                : `No memories to clear for ${targetUsername}`,
          });
          return;
        } catch (routeError) {
          ctx.logger.error("Clear memories failed", {
            targetUsername,
            error: routeError,
          });
          ctx.response.serverError("Failed to clear memories");
          return;
        }
      }
      case "forceProcessDailyNotes": {
        if (!targetUsername) {
          ctx.response.badRequest("Target username is required");
          return;
        }
        try {
          const normalizedTarget = targetUsername.toLowerCase();
          const resetResult = await resetDailyNotesProcessedFlag(
            ctx.redis,
            normalizedTarget,
            30
          );
          ctx.logger.info("Daily notes reset for reprocessing", {
            targetUsername,
            resetCount: resetResult.resetCount,
          });

          const processResult = await processDailyNotesForUser(
            ctx.redis,
            normalizedTarget,
            (...args: unknown[]) => ctx.logger.info(String(args[0]), args[1]),
            (...args: unknown[]) => ctx.logger.error(String(args[0]), args[1])
          );

          const skippedCount = processResult.skippedDates?.length || 0;
          ctx.logger.info("Force process daily notes complete", {
            targetUsername,
            notesReset: resetResult.resetCount,
            notesProcessed: processResult.processed,
            memoriesCreated: processResult.created,
            memoriesUpdated: processResult.updated,
            skippedDates: processResult.skippedDates,
          });
          ctx.response.ok({
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
                : `Reprocessed ${processResult.processed} daily notes → ${processResult.created} new + ${processResult.updated} updated memories`
                    + (skippedCount > 0
                      ? ` (${skippedCount} days deferred to next run)`
                      : ""),
          });
          return;
        } catch (routeError) {
          ctx.logger.error("Force process daily notes failed", {
            targetUsername,
            error: routeError,
          });
          ctx.response.serverError("Failed to process daily notes");
          return;
        }
      }
      default:
        ctx.response.badRequest("Invalid action");
        return;
    }
  }
);
