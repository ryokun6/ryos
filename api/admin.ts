/**
 * Admin API endpoints
 * Only accessible by the admin user (ryo)
 */

import { Redis } from "@upstash/redis";
import { CHAT_USERS_PREFIX } from "./rooms/_helpers/_constants.js";
import { deleteAllUserTokens, PASSWORD_HASH_PREFIX } from "./_utils/auth/index.js";
import {
  isAdmin,
  createRedis,
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
  getClientIp,
} from "./_utils/middleware.js";
import * as RateLimit from "./_utils/_rate-limit.js";

export const config = {
  runtime: "bun",
};

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

export default async function handler(req: Request) {
  const origin = getEffectiveOrigin(req);
  
  if (req.method === "OPTIONS") {
    const preflight = preflightIfNeeded(req, ["GET", "POST", "OPTIONS"], origin);
    if (preflight) return preflight;
    return new Response(null, { status: 204 });
  }

  if (!isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;

  const redis = createRedis();

  const authHeader = req.headers.get("authorization");
  const usernameHeader = req.headers.get("x-username");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const username = usernameHeader || null;

  const adminAccess = await isAdmin(redis, username, token);
  if (!adminAccess) {
    return new Response(JSON.stringify({ error: "Forbidden - Admin access required" }), { status: 403, headers });
  }

  const ip = getClientIp(req);
  const rateLimitKey = RateLimit.makeKey(["rl", "admin", "user", username || ip]);
  const rateLimitResult = await RateLimit.checkCounterLimit({ key: rateLimitKey, windowSeconds: ADMIN_RATE_LIMIT_WINDOW, limit: ADMIN_RATE_LIMIT_MAX });

  if (!rateLimitResult.allowed) {
    return new Response(JSON.stringify({ error: "rate_limit_exceeded", limit: rateLimitResult.limit, retryAfter: rateLimitResult.resetSeconds }), { status: 429, headers });
  }

  const url = new URL(req.url);

  if (req.method === "GET") {
    const action = url.searchParams.get("action");

    switch (action) {
      case "getStats": {
        const stats = await getStats(redis);
        return new Response(JSON.stringify(stats), { status: 200, headers });
      }
      case "getAllUsers": {
        const users = await getAllUsers(redis);
        return new Response(JSON.stringify({ users }), { status: 200, headers });
      }
      case "getUserProfile": {
        const targetUsername = url.searchParams.get("username");
        if (!targetUsername) return new Response(JSON.stringify({ error: "Username is required" }), { status: 400, headers });
        const profile = await getUserProfile(redis, targetUsername);
        if (!profile) return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers });
        return new Response(JSON.stringify(profile), { status: 200, headers });
      }
      case "getUserMessages": {
        const targetUsername = url.searchParams.get("username");
        const limit = parseInt(url.searchParams.get("limit") || "50");
        if (!targetUsername) return new Response(JSON.stringify({ error: "Username is required" }), { status: 400, headers });
        const messages = await getUserMessages(redis, targetUsername, limit);
        return new Response(JSON.stringify({ messages }), { status: 200, headers });
      }
      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers });
    }
  }

  if (req.method === "POST") {
    let body: AdminRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
    }

    const { action, targetUsername, reason } = body;

    switch (action) {
      case "deleteUser": {
        if (!targetUsername) return new Response(JSON.stringify({ error: "Target username is required" }), { status: 400, headers });
        const result = await deleteUser(redis, targetUsername);
        if (result.success) return new Response(JSON.stringify({ success: true }), { status: 200, headers });
        return new Response(JSON.stringify({ error: result.error }), { status: 400, headers });
      }
      case "banUser": {
        if (!targetUsername) return new Response(JSON.stringify({ error: "Target username is required" }), { status: 400, headers });
        const result = await banUser(redis, targetUsername, reason);
        if (result.success) return new Response(JSON.stringify({ success: true }), { status: 200, headers });
        return new Response(JSON.stringify({ error: result.error }), { status: 400, headers });
      }
      case "unbanUser": {
        if (!targetUsername) return new Response(JSON.stringify({ error: "Target username is required" }), { status: 400, headers });
        const result = await unbanUser(redis, targetUsername);
        if (result.success) return new Response(JSON.stringify({ success: true }), { status: 200, headers });
        return new Response(JSON.stringify({ error: result.error }), { status: 400, headers });
      }
      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers });
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
}
