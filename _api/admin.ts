/**
 * Admin API endpoints
 * Only accessible by the admin user (ryo)
 * 
 * Node.js runtime with terminal logging
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import { CHAT_USERS_PREFIX } from "./rooms/_helpers/_constants.js";
import { deleteAllUserTokens, PASSWORD_HASH_PREFIX } from "./_utils/auth/index.js";
import { validateAuth } from "./_utils/auth/index.js";
import * as RateLimit from "./_utils/_rate-limit.js";
import { getClientIp } from "./_utils/_rate-limit.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "./_utils/_cors.js";
import { initLogger } from "./_utils/_logging.js";
import { getMemoryIndex, getMemoryDetail, type MemoryEntry } from "./_utils/_memory.js";

export const runtime = "nodejs";
export const maxDuration = 30;

// Helper functions for Node.js runtime
function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

async function isAdmin(redis: Redis, username: string | null, token: string | null): Promise<boolean> {
  if (!username || !token) return false;
  if (username.toLowerCase() !== "ryo") return false;
  const authResult = await validateAuth(redis, username, token, { allowExpired: false });
  return authResult.valid;
}

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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { requestId: _requestId, logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);
  
  logger.request(req.method || "GET", req.url || "/api/admin", "admin");
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    setCorsHeaders(res, origin);
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  setCorsHeaders(res, origin);
  res.setHeader("Content-Type", "application/json");

  if (!isAllowedOrigin(origin)) {
    logger.warn("Unauthorized origin", { origin });
    logger.response(403, Date.now() - startTime);
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  const redis = createRedis();

  const authHeader = req.headers.authorization;
  const usernameHeader = req.headers["x-username"] as string | undefined;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const username = usernameHeader || null;

  logger.info("Processing admin request", { username, hasToken: !!token });

  const adminAccess = await isAdmin(redis, username, token);
  if (!adminAccess) {
    logger.warn("Admin access denied", { username });
    logger.response(403, Date.now() - startTime);
    res.status(403).json({ error: "Forbidden - Admin access required" });
    return;
  }

  const ip = getClientIp(req);
  const rateLimitKey = RateLimit.makeKey(["rl", "admin", "user", username || ip]);
  const rateLimitResult = await RateLimit.checkCounterLimit({ key: rateLimitKey, windowSeconds: ADMIN_RATE_LIMIT_WINDOW, limit: ADMIN_RATE_LIMIT_MAX });

  if (!rateLimitResult.allowed) {
    logger.warn("Rate limit exceeded", { username, ip });
    logger.response(429, Date.now() - startTime);
    res.status(429).json({ error: "rate_limit_exceeded", limit: rateLimitResult.limit, retryAfter: rateLimitResult.resetSeconds });
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
      case "getUserMemories": {
        const targetUsername = req.query.username as string | undefined;
        if (!targetUsername) {
          logger.response(400, Date.now() - startTime);
          res.status(400).json({ error: "Username is required" });
          return;
        }
        const memories = await getUserMemories(redis, targetUsername);
        logger.info("Memories retrieved", { targetUsername, count: memories.length });
        logger.response(200, Date.now() - startTime);
        res.status(200).json({ memories });
        return;
      }
      default:
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "Invalid action" });
        return;
    }
  }

  if (req.method === "POST") {
    let body: AdminRequest;
    try {
      body = req.body as AdminRequest;
    } catch {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }

    const { action: postAction, targetUsername, reason } = body;
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
      default:
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "Invalid action" });
        return;
    }
  }

  logger.response(405, Date.now() - startTime);
  res.status(405).json({ error: "Method not allowed" });
}
