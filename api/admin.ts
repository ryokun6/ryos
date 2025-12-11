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
} from "./utils/auth.js";
import { logInfo, logError, generateRequestId } from "./utils/logging.js";

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
): Promise<{ username: string; lastActive: number }[]> {
  const users: { username: string; lastActive: number }[] = [];
  let cursor = 0;

  try {
    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: `${CHAT_USERS_PREFIX}*`,
        count: 100,
      });
      cursor = parseInt(String(newCursor));

      if (keys.length > 0) {
        const userData = await redis.mget<
          (string | { username: string; lastActive: number } | null)[]
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
            });
          }
        }
      }
    } while (cursor !== 0);

    logInfo(requestId, `Fetched ${users.length} total users`);
    return users;
  } catch (error) {
    logError(requestId, "Error fetching all users:", error);
    return [];
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
    let cursor = 0;
    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: `${CHAT_USERS_PREFIX}*`,
        count: 100,
      });
      cursor = parseInt(String(newCursor));
      userCount += keys.length;
    } while (cursor !== 0);

    // Count rooms
    const roomIds = await redis.smembers("chat:rooms");
    const roomCount = roomIds?.length || 0;

    // Count messages (approximate - count keys)
    let messageCount = 0;
    cursor = 0;
    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: "chat:messages:*",
        count: 100,
      });
      cursor = parseInt(String(newCursor));

      // For each message list, get its length
      for (const key of keys) {
        const len = await redis.llen(key);
        messageCount += len;
      }
    } while (cursor !== 0);

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
  // VercelRequest headers can be either an object or a Headers-like object
  const authHeader = 
    typeof req.headers.authorization === "string" 
      ? req.headers.authorization 
      : (req.headers.get?.("authorization") as string | undefined);
  const usernameHeader = 
    typeof req.headers["x-username"] === "string"
      ? req.headers["x-username"]
      : (req.headers.get?.("x-username") as string | undefined);
  
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

      default:
        return createErrorResponse(res, "Invalid action", 400);
    }
  }

  // Handle POST requests
  if (req.method === "POST") {
    const body = req.body as AdminRequest;
    const { action, targetUsername } = body;

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

      default:
        return createErrorResponse(res, "Invalid action", 400);
    }
  }

  return createErrorResponse(res, "Method not allowed", 405);
}
