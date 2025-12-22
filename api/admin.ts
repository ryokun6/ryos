/**
 * Admin API endpoints
 * Only accessible by the admin user (ryo)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import { CHAT_USERS_PREFIX } from "./chat-rooms/_constants.js";
import {
  validateAuth,
  extractAuth,
  deleteAllUserTokens,
  PASSWORD_HASH_PREFIX,
} from "./_utils/auth.js";
import { logInfo, logError, generateRequestId } from "./_utils/logging.js";

// ============================================================================
// Configuration
// ============================================================================

export const runtime = "nodejs";
export const maxDuration = 15;

const redis = new Redis({
  url: process.env.REDIS_KV_REST_API_URL,
  token: process.env.REDIS_KV_REST_API_TOKEN,
});

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Helper Functions
// ============================================================================

function createErrorResponse(
  res: VercelResponse,
  message: string,
  status: number
) {
  return res.status(status).json({ error: message });
}

async function isAdmin(
  username: string | null,
  token: string | null,
  requestId: string
): Promise<boolean> {
  if (!username || !token) return false;
  if (username.toLowerCase() !== "ryo") return false;

  const authResult = await validateAuth(username, token, requestId);
  return authResult.valid;
}

// ============================================================================
// User Management
// ============================================================================

async function deleteUser(
  targetUsername: string,
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  const normalizedUsername = targetUsername.toLowerCase();

  // Don't allow deleting the admin
  if (normalizedUsername === "ryo") {
    return { success: false, error: "Cannot delete admin user" };
  }

  try {
    // Delete user record
    const userKey = `${CHAT_USERS_PREFIX}${normalizedUsername}`;
    await redis.del(userKey);
    logInfo(requestId, `Deleted user record: ${normalizedUsername}`);

    // Delete user's password hash
    const passwordKey = `${PASSWORD_HASH_PREFIX}${normalizedUsername}`;
    await redis.del(passwordKey);
    logInfo(requestId, `Deleted password hash: ${normalizedUsername}`);

    // Delete all user tokens
    const deletedTokens = await deleteAllUserTokens(normalizedUsername);
    logInfo(
      requestId,
      `Deleted ${deletedTokens} tokens for user: ${normalizedUsername}`
    );

    return { success: true };
  } catch (error) {
    logError(requestId, `Error deleting user ${normalizedUsername}:`, error);
    return { success: false, error: "Failed to delete user" };
  }
}

async function getAllUsers(
  requestId: string
): Promise<{ username: string; lastActive: number; banned?: boolean }[]> {
  const users: { username: string; lastActive: number; banned?: boolean }[] = [];
  let cursor: string | number = 0;
  let iterations = 0;
  const maxIterations = 100; // Safety limit

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
          const parsed =
            typeof data === "string"
              ? JSON.parse(data)
              : data;
          if (parsed && parsed.username) {
            users.push({
              username: parsed.username,
              lastActive: parsed.lastActive || 0,
              banned: parsed.banned || false,
            });
          }
        }
      }
    } while (cursor !== 0 && cursor !== "0" && iterations < maxIterations);

    logInfo(requestId, `Fetched ${users.length} total users in ${iterations} iterations`);
    return users;
  } catch (error) {
    logError(requestId, "Error fetching all users:", error);
    return [];
  }
}

async function getUserProfile(
  targetUsername: string,
  requestId: string
): Promise<UserProfile | null> {
  const normalizedUsername = targetUsername.toLowerCase();

  try {
    // Get user data
    const userKey = `${CHAT_USERS_PREFIX}${normalizedUsername}`;
    const userData = await redis.get<{ username: string; lastActive: number; banned?: boolean; banReason?: string; bannedAt?: number } | string>(userKey);
    
    if (!userData) {
      return null;
    }

    const parsed = typeof userData === "string" ? JSON.parse(userData) : userData;

    // Count user messages across all rooms
    let messageCount = 0;
    const userRooms: { id: string; name: string }[] = [];
    
    // Get all rooms
    const roomIds = await redis.smembers("chat:rooms");
    
    // Build a map of room id -> room name
    const roomNameMap: Record<string, string> = {};
    for (const roomId of roomIds || []) {
      try {
        const roomData = await redis.get<{ name: string } | string>(`chat:room:${roomId}`);
        if (roomData) {
          const parsed = typeof roomData === "string" ? JSON.parse(roomData) : roomData;
          roomNameMap[roomId] = parsed.name || roomId;
        } else {
          roomNameMap[roomId] = roomId;
        }
      } catch {
        roomNameMap[roomId] = roomId; // fallback to ID on error
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

    logInfo(requestId, `Fetched profile for ${normalizedUsername}: ${messageCount} messages in ${userRooms.length} rooms`);

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
    logError(requestId, `Error fetching user profile for ${normalizedUsername}:`, error);
    return null;
  }
}

async function getUserMessages(
  targetUsername: string,
  requestId: string,
  limit: number = 50
): Promise<{ id: string; roomId: string; roomName: string; content: string; timestamp: number }[]> {
  const normalizedUsername = targetUsername.toLowerCase();
  const messages: { id: string; roomId: string; roomName: string; content: string; timestamp: number }[] = [];

  try {
    // Get all rooms
    const roomIds = await redis.smembers("chat:rooms");
    
    // Build a map of room id -> room name
    const roomNameMap: Record<string, string> = {};
    for (const roomId of roomIds || []) {
      try {
        const roomData = await redis.get<{ name: string } | string>(`chat:room:${roomId}`);
        if (roomData) {
          const parsed = typeof roomData === "string" ? JSON.parse(roomData) : roomData;
          roomNameMap[roomId] = parsed.name || roomId;
        } else {
          roomNameMap[roomId] = roomId;
        }
      } catch {
        roomNameMap[roomId] = roomId; // fallback to ID on error
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

    // Sort by timestamp descending and limit
    messages.sort((a, b) => b.timestamp - a.timestamp);
    const limitedMessages = messages.slice(0, limit);

    logInfo(requestId, `Fetched ${limitedMessages.length} messages for ${normalizedUsername}`);
    return limitedMessages;
  } catch (error) {
    logError(requestId, `Error fetching messages for ${normalizedUsername}:`, error);
    return [];
  }
}

async function banUser(
  targetUsername: string,
  reason: string | undefined,
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  const normalizedUsername = targetUsername.toLowerCase();

  // Don't allow banning the admin
  if (normalizedUsername === "ryo") {
    return { success: false, error: "Cannot ban admin user" };
  }

  try {
    const userKey = `${CHAT_USERS_PREFIX}${normalizedUsername}`;
    const userData = await redis.get<{ username: string; lastActive: number; banned?: boolean } | string>(userKey);
    
    if (!userData) {
      return { success: false, error: "User not found" };
    }

    const parsed = typeof userData === "string" ? JSON.parse(userData) : userData;
    
    // Update user with ban status
    const updatedUser = {
      ...parsed,
      banned: true,
      banReason: reason || "No reason provided",
      bannedAt: Date.now(),
    };
    
    await redis.set(userKey, JSON.stringify(updatedUser));
    
    // Invalidate all user tokens so they get logged out
    const deletedTokens = await deleteAllUserTokens(normalizedUsername);
    logInfo(requestId, `Banned user ${normalizedUsername}, invalidated ${deletedTokens} tokens`);

    return { success: true };
  } catch (error) {
    logError(requestId, `Error banning user ${normalizedUsername}:`, error);
    return { success: false, error: "Failed to ban user" };
  }
}

async function unbanUser(
  targetUsername: string,
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  const normalizedUsername = targetUsername.toLowerCase();

  try {
    const userKey = `${CHAT_USERS_PREFIX}${normalizedUsername}`;
    const userData = await redis.get<{ username: string; lastActive: number; banned?: boolean; banReason?: string; bannedAt?: number } | string>(userKey);
    
    if (!userData) {
      return { success: false, error: "User not found" };
    }

    const parsed = typeof userData === "string" ? JSON.parse(userData) : userData;
    
    // Remove ban status
    const updatedUser = {
      ...parsed,
      banned: false,
      banReason: undefined,
      bannedAt: undefined,
    };
    
    await redis.set(userKey, JSON.stringify(updatedUser));
    logInfo(requestId, `Unbanned user ${normalizedUsername}`);

    return { success: true };
  } catch (error) {
    logError(requestId, `Error unbanning user ${normalizedUsername}:`, error);
    return { success: false, error: "Failed to unban user" };
  }
}

// ============================================================================
// Statistics
// ============================================================================

async function getStats(
  requestId: string
): Promise<{
  totalUsers: number;
  totalRooms: number;
  totalMessages: number;
}> {
  try {
    // Count users
    let userCount = 0;
    let cursor: string | number = 0;
    let iterations = 0;
    const maxIterations = 100;
    
    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: `${CHAT_USERS_PREFIX}*`,
        count: 1000,
      });
      cursor = newCursor;
      userCount += keys.length;
      iterations++;
    } while (cursor !== 0 && cursor !== "0" && iterations < maxIterations);

    // Count rooms
    const roomIds = await redis.smembers("chat:rooms");
    const roomCount = roomIds?.length || 0;

    // Count messages (approximate - count keys)
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

      // For each message list, get its length
      for (const key of keys) {
        const len = await redis.llen(key);
        messageCount += len;
      }
    } while (cursor !== 0 && cursor !== "0" && iterations < maxIterations);

    logInfo(
      requestId,
      `Stats: ${userCount} users, ${roomCount} rooms, ${messageCount} messages`
    );

    return {
      totalUsers: userCount,
      totalRooms: roomCount,
      totalMessages: messageCount,
    };
  } catch (error) {
    logError(requestId, "Error fetching stats:", error);
    return { totalUsers: 0, totalRooms: 0, totalMessages: 0 };
  }
}

// ============================================================================
// Main Handler
// ============================================================================

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<VercelResponse> {
  const requestId = generateRequestId();
  logInfo(requestId, `Admin API request: ${req.method}`);

  // Extract auth from VercelRequest
  // VercelRequest headers are IncomingHttpHeaders (string | string[] | undefined)
  const rawAuthHeader = req.headers.authorization;
  const authHeader = Array.isArray(rawAuthHeader) ? rawAuthHeader[0] : rawAuthHeader;
  const rawUsernameHeader = req.headers["x-username"];
  const usernameHeader = Array.isArray(rawUsernameHeader) ? rawUsernameHeader[0] : rawUsernameHeader;
  
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const username = usernameHeader || null;

  // Verify admin access
  const adminAccess = await isAdmin(username, token, requestId);
  if (!adminAccess) {
    logInfo(requestId, "Admin access denied");
    return createErrorResponse(res, "Forbidden - Admin access required", 403);
  }

  // Handle GET requests
  if (req.method === "GET") {
    const action = req.query.action as string;

    switch (action) {
      case "getStats": {
        const stats = await getStats(requestId);
        return res.status(200).json(stats);
      }

      case "getAllUsers": {
        const users = await getAllUsers(requestId);
        return res.status(200).json({ users });
      }

      case "getUserProfile": {
        const targetUsername = req.query.username as string;
        if (!targetUsername) {
          return createErrorResponse(res, "Username is required", 400);
        }
        const profile = await getUserProfile(targetUsername, requestId);
        if (!profile) {
          return createErrorResponse(res, "User not found", 404);
        }
        return res.status(200).json(profile);
      }

      case "getUserMessages": {
        const targetUsername = req.query.username as string;
        const limit = parseInt(req.query.limit as string) || 50;
        if (!targetUsername) {
          return createErrorResponse(res, "Username is required", 400);
        }
        const messages = await getUserMessages(targetUsername, requestId, limit);
        return res.status(200).json({ messages });
      }

      default:
        return createErrorResponse(res, "Invalid action", 400);
    }
  }

  // Handle POST requests
  if (req.method === "POST") {
    const body = req.body as AdminRequest;
    const { action, targetUsername, reason } = body;

    switch (action) {
      case "deleteUser": {
        if (!targetUsername) {
          return createErrorResponse(res, "Target username is required", 400);
        }

        const result = await deleteUser(targetUsername, requestId);
        if (result.success) {
          return res.status(200).json({ success: true });
        } else {
          return createErrorResponse(res, result.error || "Failed to delete user", 400);
        }
      }

      case "banUser": {
        if (!targetUsername) {
          return createErrorResponse(res, "Target username is required", 400);
        }

        const result = await banUser(targetUsername, reason, requestId);
        if (result.success) {
          return res.status(200).json({ success: true });
        } else {
          return createErrorResponse(res, result.error || "Failed to ban user", 400);
        }
      }

      case "unbanUser": {
        if (!targetUsername) {
          return createErrorResponse(res, "Target username is required", 400);
        }

        const result = await unbanUser(targetUsername, requestId);
        if (result.success) {
          return res.status(200).json({ success: true });
        } else {
          return createErrorResponse(res, result.error || "Failed to unban user", 400);
        }
      }

      default:
        return createErrorResponse(res, "Invalid action", 400);
    }
  }

  return createErrorResponse(res, "Method not allowed", 405);
}
