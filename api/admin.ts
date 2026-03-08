/**
 * Admin API endpoints
 * Only accessible by the admin user (ryo)
 * 
 * Node.js runtime with terminal logging
 */

import { Redis } from "@upstash/redis";
import {
  CHAT_MESSAGES_PREFIX,
  CHAT_ROOM_PREFIX,
  CHAT_ROOMS_SET,
  CHAT_USERS_PREFIX,
} from "./rooms/_helpers/_constants.js";
import { deleteAllUserTokens, PASSWORD_HASH_PREFIX } from "./_utils/auth/index.js";
import * as RateLimit from "./_utils/_rate-limit.js";
import { getClientIp } from "./_utils/_rate-limit.js";
import { apiHandler } from "./_utils/api-handler.js";
import { resolveRequestAuth } from "./_utils/request-auth.js";
import { getMemoryIndex, getMemoryDetail, getRecentDailyNotes, clearAllMemories, resetDailyNotesProcessedFlag, type MemoryEntry, type DailyNote } from "./_utils/_memory.js";
import { getRecentHeartbeatRecords, type HeartbeatRecord } from "./_utils/heartbeats.js";
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

interface UserActivityMessage {
  id: string;
  roomId: string;
  roomName: string;
  content: string;
  timestamp: number;
}

interface UserRoomActivity {
  messageCount: number;
  rooms: { id: string; name: string }[];
  messages: UserActivityMessage[];
}

const ROOM_ACTIVITY_SCAN_BATCH_SIZE = 25;

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [items];

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
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

    return {
      username: parsed.username,
      lastActive: parsed.lastActive || 0,
      banned: parsed.banned || false,
      banReason: parsed.banReason,
      bannedAt: parsed.bannedAt,
    };
  } catch (error) {
    console.error(`Error fetching user profile for ${normalizedUsername}:`, error);
    return null;
  }
}

async function getRoomNameMap(
  redis: Redis,
  roomIds: string[]
): Promise<Record<string, string>> {
  if (roomIds.length === 0) {
    return {};
  }

  const roomKeys = roomIds.map((roomId) => `${CHAT_ROOM_PREFIX}${roomId}`);
  const roomPayloads = await redis.mget<
    ({ name?: string } | string | null)[]
  >(...roomKeys);

  const roomNameMap: Record<string, string> = {};
  roomIds.forEach((roomId, index) => {
    const rawRoom = roomPayloads?.[index];
    if (!rawRoom) {
      roomNameMap[roomId] = roomId;
      return;
    }

    try {
      const parsedRoom =
        typeof rawRoom === "string" ? JSON.parse(rawRoom) : rawRoom;
      roomNameMap[roomId] = parsedRoom?.name || roomId;
    } catch {
      roomNameMap[roomId] = roomId;
    }
  });

  return roomNameMap;
}

async function getUserRoomActivity(
  redis: Redis,
  targetUsername: string,
  limit = 50
): Promise<UserRoomActivity> {
  const normalizedUsername = targetUsername.toLowerCase();
  const recentMessages: Array<Omit<UserActivityMessage, "roomName">> = [];
  const roomActivity = new Map<string, { latestTimestamp: number }>();
  let messageCount = 0;

  try {
    const roomIds = await redis.smembers(CHAT_ROOMS_SET);

    for (const roomIdBatch of chunkArray(
      roomIds || [],
      ROOM_ACTIVITY_SCAN_BATCH_SIZE
    )) {
      const batchActivity = await Promise.all(
        roomIdBatch.map(async (roomId) => {
          try {
            const roomMessages = await redis.lrange<
              (Record<string, unknown> | string)[]
            >(`${CHAT_MESSAGES_PREFIX}${roomId}`, 0, -1);
            const matchingMessages: Array<Omit<UserActivityMessage, "roomName">> =
              [];
            let latestTimestamp = 0;

            for (const rawMessage of roomMessages || []) {
              const message =
                typeof rawMessage === "string"
                  ? JSON.parse(rawMessage)
                  : rawMessage;
              const messageUsername =
                typeof message?.username === "string"
                  ? message.username.toLowerCase()
                  : "";

              if (messageUsername !== normalizedUsername) {
                continue;
              }

              const timestamp =
                typeof message.timestamp === "number" ? message.timestamp : 0;
              latestTimestamp = Math.max(latestTimestamp, timestamp);
              matchingMessages.push({
                id:
                  typeof message.id === "string"
                    ? message.id
                    : `${roomId}:${timestamp}`,
                roomId,
                content:
                  typeof message.content === "string" ? message.content : "",
                timestamp,
              });
            }

            return { roomId, matchingMessages, latestTimestamp };
          } catch (error) {
            console.error(`Error scanning room activity for ${roomId}:`, error);
            return { roomId, matchingMessages: [], latestTimestamp: 0 };
          }
        })
      );

      for (const { roomId, matchingMessages, latestTimestamp } of batchActivity) {
        if (matchingMessages.length === 0) {
          continue;
        }

        messageCount += matchingMessages.length;
        roomActivity.set(roomId, { latestTimestamp });
        recentMessages.push(...matchingMessages);
      }
    }

    const matchedRoomIds = Array.from(roomActivity.keys());
    const roomNameMap = await getRoomNameMap(redis, matchedRoomIds);
    const safeLimit = Math.max(1, Math.min(limit, 100));

    const rooms = matchedRoomIds
      .map((roomId) => ({
        id: roomId,
        name: roomNameMap[roomId] || roomId,
        latestTimestamp: roomActivity.get(roomId)?.latestTimestamp || 0,
      }))
      .sort((a, b) => b.latestTimestamp - a.latestTimestamp)
      .map(({ id, name }) => ({ id, name }));

    const messages = recentMessages
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, safeLimit)
      .map((message) => ({
        ...message,
        roomName: roomNameMap[message.roomId] || message.roomId,
      }));

    return {
      messageCount,
      rooms,
      messages,
    };
  } catch (error) {
    console.error(`Error fetching room activity for ${normalizedUsername}:`, error);
    return { messageCount: 0, rooms: [], messages: [] };
  }
}

async function getUserMessages(
  redis: Redis,
  targetUsername: string,
  limit = 50
): Promise<UserActivityMessage[]> {
  const activity = await getUserRoomActivity(redis, targetUsername, limit);
  return activity.messages;
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

    const ip = getClientIp(req);
    const rateLimitKey = RateLimit.makeKey(["rl", "admin", "user", username || ip]);
    const rateLimitResult = await RateLimit.checkCounterLimit({
      key: rateLimitKey,
      windowSeconds: ADMIN_RATE_LIMIT_WINDOW,
      limit: ADMIN_RATE_LIMIT_MAX,
    });

    if (!rateLimitResult.allowed) {
      logger.warn("Rate limit exceeded", { username, ip });
      logger.response(429, Date.now() - startTime);
      res.status(429).json({
        error: "rate_limit_exceeded",
        limit: rateLimitResult.limit,
        retryAfter: rateLimitResult.resetSeconds,
      });
      return;
    }

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
        case "getUserRoomActivity": {
          const targetUsername = req.query.username as string | undefined;
          const limit = parseInt((req.query.limit as string) || "50");
          if (!targetUsername) {
            logger.response(400, Date.now() - startTime);
            res.status(400).json({ error: "Username is required" });
            return;
          }
          const activity = await getUserRoomActivity(redis, targetUsername, limit);
          logger.info("Room activity retrieved", {
            targetUsername,
            roomCount: activity.rooms.length,
            messageCount: activity.messageCount,
            recentMessagesCount: activity.messages.length,
          });
          logger.response(200, Date.now() - startTime);
          res.status(200).json(activity);
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
