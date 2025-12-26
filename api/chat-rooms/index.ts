/**
 * Chat Rooms API - Main HTTP Handlers
 * 
 * This module provides the main GET, POST, and DELETE handlers for the chat rooms API.
 * It delegates to specialized handler modules for specific functionality.
 */

import { redis } from "./_redis.js";
import {
  CHAT_ROOM_PREFIX,
  CHAT_ROOM_PRESENCE_PREFIX,
  CHAT_ROOM_USERS_PREFIX,
  CHAT_ROOM_PRESENCE_ZSET_PREFIX,
  CHAT_ROOMS_SET,
  runtime as apiRuntime,
  maxDuration as apiMaxDuration,
} from "./_constants.js";
import {
  getEffectiveOrigin,
  preflightIfNeeded,
} from "../_utils/cors.js";
import { logRequest, logInfo, logError, generateRequestId } from "../_utils/logging.js";
import { extractAuth, validateAuth, checkRateLimit } from "../_utils/auth.js";
import { setAuthLoggers, setIsProfaneUsername } from "../_utils/auth.js";
import { setValidationLogger, isProfaneUsername } from "../_utils/validation.js";
import { createErrorResponse, addCorsHeaders, getClientIp } from "./_helpers.js";

// Room handlers
import {
  handleGetRooms,
  handleGetRoom,
  handleCreateRoom,
  handleDeleteRoom,
  handleJoinRoom,
  handleLeaveRoom,
  handleSwitchRoom,
  handleGetRoomUsers,
} from "./_rooms.js";

// Message handlers
import {
  handleGetMessages,
  handleGetBulkMessages,
  handleSendMessage,
  handleGenerateRyoReply,
  handleDeleteMessage,
  handleClearAllMessages,
} from "./_messages.js";

// User handlers
import { handleCreateUser, handleGetUsers } from "./_users.js";

// Token handlers
import {
  handleGenerateToken,
  handleRefreshToken,
  handleVerifyToken,
  handleAuthenticateWithPassword,
  handleSetPassword,
  handleCheckPassword,
  handleListTokens,
  handleLogoutAllDevices,
  handleLogoutCurrent,
} from "./_tokens.js";

// Presence handlers
import {
  cleanupExpiredPresence,
  getDetailedRooms,
} from "./_presence.js";

// ============================================================================
// Initialize Module Connections
// ============================================================================

// Connect auth module to logging
setAuthLoggers(logInfo, logError);
setIsProfaneUsername(isProfaneUsername);
setValidationLogger(logInfo);

// ============================================================================
// Export Runtime Configuration
// ============================================================================

export const runtime = apiRuntime;
export const maxDuration = apiMaxDuration;

// ============================================================================
// GET Handler
// ============================================================================

export async function GET(request: Request): Promise<Response> {
  const effectiveOrigin = getEffectiveOrigin(request);
  const preflightResp = preflightIfNeeded(
    request,
    ["GET", "OPTIONS"],
    effectiveOrigin
  );
  if (preflightResp) return preflightResp;

  const requestId = generateRequestId();
  const startTime = performance.now();
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  logRequest("GET", request.url, action, requestId);

  let response: Response;
  try {
    // Actions that don't require authentication
    const publicActions = [
      "getRooms",
      "getMessages",
      "getBulkMessages",
      "getUsers",
    ];

    // Check authentication for protected actions
    if (!publicActions.includes(action || "")) {
      const { username, token } = extractAuth(request);

      // Special handling for checkPassword
      if (action === "checkPassword") {
        const isValid = await validateAuth(username, token, requestId);
        if (!isValid.valid) {
          response = createErrorResponse("Unauthorized", 401);
          return addCorsHeaders(response, effectiveOrigin);
        }
        response = await handleCheckPassword(username, requestId);
        return addCorsHeaders(response, effectiveOrigin);
      }

      // Validate authentication for other protected actions
      const isValid = await validateAuth(username, token, requestId);
      if (!isValid.valid) {
        response = createErrorResponse("Unauthorized", 401);
        return addCorsHeaders(response, effectiveOrigin);
      }
    }

    switch (action) {
      case "getRooms":
        response = await handleGetRooms(request, requestId);
        break;

      case "getRoom": {
        const roomId = url.searchParams.get("roomId");
        if (!roomId) {
          logInfo(requestId, "Missing roomId parameter");
          response = createErrorResponse(
            "roomId query parameter is required",
            400
          );
          break;
        }
        response = await handleGetRoom(roomId, requestId);
        break;
      }

      case "getMessages": {
        const roomId = url.searchParams.get("roomId");
        if (!roomId) {
          logInfo(requestId, "Missing roomId parameter");
          response = createErrorResponse(
            "roomId query parameter is required",
            400
          );
          break;
        }
        const limitParam = url.searchParams.get("limit");
        const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 20, 500) : 20;
        response = await handleGetMessages(roomId, requestId, limit);
        break;
      }

      case "getBulkMessages": {
        const roomIdsParam = url.searchParams.get("roomIds");
        if (!roomIdsParam) {
          logInfo(requestId, "Missing roomIds parameter");
          response = createErrorResponse(
            "roomIds query parameter is required",
            400
          );
          break;
        }
        const roomIds = roomIdsParam
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id.length > 0);
        if (roomIds.length === 0) {
          logInfo(requestId, "No valid room IDs provided");
          response = createErrorResponse("At least one room ID is required", 400);
          break;
        }
        response = await handleGetBulkMessages(roomIds, requestId);
        break;
      }

      case "getRoomUsers": {
        const roomId = url.searchParams.get("roomId");
        if (!roomId) {
          logInfo(requestId, "Missing roomId parameter for getRoomUsers");
          response = createErrorResponse(
            "roomId query parameter is required",
            400
          );
          break;
        }
        response = await handleGetRoomUsers(roomId);
        break;
      }

      case "getUsers": {
        const searchQuery = url.searchParams.get("search") || "";
        response = await handleGetUsers(requestId, searchQuery);
        break;
      }

      case "cleanupPresence": {
        const { username, token } = extractAuth(request);
        const isValid = await validateAuth(username, token, requestId);
        if (!isValid.valid || username?.toLowerCase() !== "ryo") {
          response = createErrorResponse(
            "Unauthorized - Admin access required",
            403
          );
          break;
        }

        const result = await cleanupExpiredPresence();
        response = new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
        break;
      }

      case "debugPresence": {
        const { username, token } = extractAuth(request);
        const isValid = await validateAuth(username, token, requestId);
        if (!isValid.valid || username?.toLowerCase() !== "ryo") {
          response = createErrorResponse(
            "Unauthorized - Admin access required",
            403
          );
          break;
        }

        try {
          const presenceKeys: string[] = [];
          let cursor = 0;

          do {
            const [newCursor, keys] = await redis.scan(cursor, {
              match: `${CHAT_ROOM_PRESENCE_PREFIX}*`,
              count: 100,
            });
            cursor = parseInt(String(newCursor));
            presenceKeys.push(...keys);
          } while (cursor !== 0);

          const presenceData: Record<string, { value: unknown; ttl: number }> =
            {};

          for (const key of presenceKeys) {
            const value = await redis.get(key);
            const ttl = await redis.ttl(key);
            presenceData[key] = { value, ttl };
          }

          const rooms = await getDetailedRooms();

          response = new Response(
            JSON.stringify({
              presenceKeys: presenceKeys.length,
              presenceData,
              rooms: rooms.map((r) => ({
                id: r.id,
                name: r.name,
                userCount: r.userCount,
                users: r.users,
              })),
            }),
            {
              headers: { "Content-Type": "application/json" },
            }
          );
        } catch (error) {
          logError(requestId, "Error in debugPresence:", error);
          response = createErrorResponse("Debug failed", 500);
        }
        break;
      }

      default:
        logInfo(requestId, `Invalid action: ${action}`);
        response = createErrorResponse("Invalid action", 400);
    }
    return addCorsHeaders(response, effectiveOrigin);
  } catch (error) {
    logError(requestId, "Error handling GET request:", error);
    response = createErrorResponse("Internal server error", 500);
    return addCorsHeaders(response, effectiveOrigin);
  } finally {
    const duration = performance.now() - startTime;
    logInfo(requestId, `Request completed in ${duration.toFixed(2)}ms`);
  }
}

// ============================================================================
// POST Handler
// ============================================================================

export async function POST(request: Request): Promise<Response> {
  const effectiveOrigin = getEffectiveOrigin(request);
  const preflightResp = preflightIfNeeded(
    request,
    ["POST", "OPTIONS"],
    effectiveOrigin
  );
  if (preflightResp) return preflightResp;

  const requestId = generateRequestId();
  const startTime = performance.now();
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  logRequest("POST", request.url, action, requestId);

  let response: Response;
  try {
    // Parse JSON body safely
    let body: Record<string, unknown> = {};
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        body = await request.json();
      } catch {
        body = {};
      }
    }

    // Rate limiting for sensitive actions
    const sensitiveRateLimitActions = new Set([
      "generateToken",
      "refreshToken",
      "authenticateWithPassword",
      "setPassword",
      "createUser",
      "generateRyoReply",
    ]);

    if (sensitiveRateLimitActions.has(action || "")) {
      let identifier: string;
      if (action === "createUser") {
        const ip = getClientIp(request);
        identifier = `ip:${ip}`.toLowerCase();

        // Check block first
        const blockKey = `rl:block:${action}:${identifier}`;
        const isBlocked = await redis.get(blockKey);
        if (isBlocked) {
          logInfo(requestId, `User creation blocked for ${identifier}`);
          response = createErrorResponse(
            "User creation temporarily blocked due to excessive attempts. Try again in 24 hours.",
            429
          );
          return addCorsHeaders(response, effectiveOrigin);
        }

        const allowed = await checkRateLimit(action, identifier, requestId);
        if (!allowed) {
          await redis.set(blockKey, 1, { ex: 24 * 60 * 60 });
          logInfo(
            requestId,
            `Set 24h block for createUser: ${identifier} after exceeding minute limit`
          );
          response = createErrorResponse(
            "Too many user creation attempts. You're blocked for 24 hours.",
            429
          );
          return addCorsHeaders(response, effectiveOrigin);
        }
      } else {
        const ip = getClientIp(request);
        identifier = (
          (body.username as string) ||
          request.headers.get("x-username") ||
          `anon:${ip}`
        )!.toLowerCase();
        const allowed = await checkRateLimit(action!, identifier, requestId);
        if (!allowed) {
          response = createErrorResponse(
            "Too many requests, please slow down",
            429
          );
          return addCorsHeaders(response, effectiveOrigin);
        }
      }
    }

    // Declare authentication variables
    let username: string | null = null;
    let token: string | null = null;

    // Protected actions
    const protectedActions = [
      "createRoom",
      "sendMessage",
      "clearAllMessages",
      "resetUserCounts",
      "setPassword",
      "generateToken",
      "listTokens",
      "logoutAllDevices",
      "logoutCurrent",
      "generateRyoReply",
    ];

    // Check authentication for protected actions
    if (protectedActions.includes(action || "")) {
      const authResult = extractAuth(request);
      username = authResult.username;
      token = authResult.token;

      // Validate username match if provided in body
      if (
        body.username &&
        (body.username as string).toLowerCase() !== username?.toLowerCase()
      ) {
        logInfo(
          requestId,
          `Auth mismatch: body username (${body.username}) != auth username (${username})`
        );
        response = createErrorResponse("Username mismatch", 401);
        return addCorsHeaders(response, effectiveOrigin);
      }

      const isValid = await validateAuth(
        username || (body.username as string),
        token,
        requestId
      );
      if (!isValid.valid) {
        response = createErrorResponse("Unauthorized", 401);
        return addCorsHeaders(response, effectiveOrigin);
      }
    }

    switch (action) {
      case "createRoom":
        response = await handleCreateRoom(
          body as { name?: string; type?: "public" | "private"; members?: string[] },
          username,
          token,
          requestId
        );
        break;

      case "joinRoom":
        response = await handleJoinRoom(
          body as { roomId: string; username: string },
          requestId
        );
        break;

      case "leaveRoom":
        response = await handleLeaveRoom(
          body as { roomId: string; username: string },
          requestId
        );
        break;

      case "switchRoom":
        response = await handleSwitchRoom(
          body as { previousRoomId?: string; nextRoomId?: string; username: string },
          requestId
        );
        break;

      case "sendMessage":
        response = await handleSendMessage(
          body as { roomId: string; username: string; content: string },
          requestId
        );
        break;

      case "generateRyoReply":
        response = await handleGenerateRyoReply(
          body as {
            roomId: string;
            prompt: string;
            systemState?: { chatRoomContext?: { recentMessages?: string; mentionedMessage?: string } };
          },
          username,
          requestId
        );
        break;

      case "createUser":
        response = await handleCreateUser(
          body as { username: string; password?: string },
          requestId
        );
        break;

      case "generateToken":
        response = await handleGenerateToken(
          body as { username: string; force?: boolean },
          requestId
        );
        break;

      case "refreshToken":
        response = await handleRefreshToken(
          body as { username: string; oldToken: string },
          requestId
        );
        break;

      case "clearAllMessages":
        response = await handleClearAllMessages(username, token, requestId);
        break;

      case "resetUserCounts":
        response = await handleResetUserCounts(username, token, requestId);
        break;

      case "verifyToken":
        response = await handleVerifyToken(request, requestId);
        break;

      case "authenticateWithPassword":
        response = await handleAuthenticateWithPassword(
          body as { username: string; password: string; oldToken?: string },
          requestId
        );
        break;

      case "setPassword":
        response = await handleSetPassword(
          body as { password: string },
          username,
          requestId
        );
        break;

      case "listTokens":
        response = await handleListTokens(username, request, requestId);
        break;

      case "logoutAllDevices":
        response = await handleLogoutAllDevices(username, request, requestId);
        break;

      case "logoutCurrent":
        response = await handleLogoutCurrent(username, token, requestId);
        break;

      default:
        logInfo(requestId, `Invalid action: ${action}`);
        response = createErrorResponse("Invalid action", 400);
    }
    return addCorsHeaders(response, effectiveOrigin);
  } catch (error) {
    logError(requestId, "Error handling POST request:", error);
    response = createErrorResponse("Internal server error", 500);
    return addCorsHeaders(response, effectiveOrigin);
  } finally {
    const duration = performance.now() - startTime;
    logInfo(requestId, `Request completed in ${duration.toFixed(2)}ms`);
  }
}

// ============================================================================
// DELETE Handler
// ============================================================================

export async function DELETE(request: Request): Promise<Response> {
  const effectiveOrigin = getEffectiveOrigin(request);
  const preflightResp = preflightIfNeeded(
    request,
    ["DELETE", "OPTIONS"],
    effectiveOrigin
  );
  if (preflightResp) return preflightResp;

  const requestId = generateRequestId();
  const startTime = performance.now();
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  logRequest("DELETE", request.url, action, requestId);

  let response: Response;
  try {
    // All DELETE actions require authentication
    const { username, token } = extractAuth(request);

    const isValid = await validateAuth(username, token, requestId);
    if (!isValid.valid) {
      response = createErrorResponse("Unauthorized", 401);
      return addCorsHeaders(response, effectiveOrigin);
    }

    switch (action) {
      case "deleteRoom": {
        const roomId = url.searchParams.get("roomId");
        if (!roomId) {
          logInfo(requestId, "Missing roomId parameter");
          response = createErrorResponse(
            "roomId query parameter is required",
            400
          );
          return addCorsHeaders(response, effectiveOrigin);
        }
        response = await handleDeleteRoom(roomId, username, token, requestId);
        break;
      }

      case "deleteMessage": {
        const roomId = url.searchParams.get("roomId");
        const messageId = url.searchParams.get("messageId");
        if (!roomId || !messageId) {
          logInfo(requestId, "Missing roomId or messageId parameter");
          response = createErrorResponse(
            "roomId and messageId query parameters are required",
            400
          );
          return addCorsHeaders(response, effectiveOrigin);
        }
        response = await handleDeleteMessage(
          roomId,
          messageId,
          username,
          token,
          requestId
        );
        break;
      }

      default:
        logInfo(requestId, `Invalid action: ${action}`);
        response = createErrorResponse("Invalid action", 400);
    }
    return addCorsHeaders(response, effectiveOrigin);
  } catch (error) {
    logError(requestId, "Error handling DELETE request:", error);
    response = createErrorResponse("Internal server error", 500);
    return addCorsHeaders(response, effectiveOrigin);
  } finally {
    const duration = performance.now() - startTime;
    logInfo(requestId, `Request completed in ${duration.toFixed(2)}ms`);
  }
}

// ============================================================================
// Admin Functions (not exported as HTTP handlers)
// ============================================================================

async function handleResetUserCounts(
  username: string | null,
  token: string | null,
  requestId: string
): Promise<Response> {
  logInfo(requestId, "Resetting all user counts and clearing room memberships");

  if (!username || !token) {
    return createErrorResponse("Forbidden - Admin access required", 403);
  }
  if (username.toLowerCase() !== "ryo") {
    logInfo(requestId, `Unauthorized: User ${username} is not the admin`);
    return createErrorResponse("Forbidden - Admin access required", 403);
  }

  const authResult = await validateAuth(username, token, requestId);
  if (!authResult.valid) {
    logInfo(requestId, `Unauthorized: Invalid token for admin user ${username}`);
    return createErrorResponse("Forbidden - Admin access required", 403);
  }

  try {
    const roomIds = await redis.smembers(CHAT_ROOMS_SET);
    const roomKeys = roomIds.map((id) => `${CHAT_ROOM_PREFIX}${id}`);

    logInfo(requestId, `Found ${roomKeys.length} rooms to update`);

    if (roomKeys.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No rooms to update" }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Get all room user set keys using SCAN
    const roomUserKeys: string[] = [];
    let cursor = 0;

    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: `${CHAT_ROOM_USERS_PREFIX}*`,
        count: 100,
      });
      cursor = parseInt(String(newCursor));
      roomUserKeys.push(...keys);
    } while (cursor !== 0);

    // Build presence ZSET keys for all rooms
    const presenceKeys = roomIds.map(
      (id) => `${CHAT_ROOM_PRESENCE_ZSET_PREFIX}${id}`
    );

    // Clear all room user sets and presence keys
    const deleteRoomUsersPipeline = redis.pipeline();
    roomUserKeys.forEach((key) => {
      deleteRoomUsersPipeline.del(key);
    });
    presenceKeys.forEach((key) => {
      deleteRoomUsersPipeline.del(key);
    });
    await deleteRoomUsersPipeline.exec();
    logInfo(
      requestId,
      `Cleared ${roomUserKeys.length} room user sets and ${presenceKeys.length} presence keys`
    );

    // Update all room objects to set userCount to 0
    const roomsData = await redis.mget<(Record<string, unknown> | string | null)[]>(...roomKeys);
    const updateRoomsPipeline = redis.pipeline();

    roomsData.forEach((roomData, index) => {
      if (roomData) {
        const room =
          typeof roomData === "object" ? roomData : JSON.parse(roomData as string);
        const updatedRoom = { ...room, userCount: 0 };
        updateRoomsPipeline.set(roomKeys[index], updatedRoom);
      }
    });

    await updateRoomsPipeline.exec();
    logInfo(requestId, `Reset user count to 0 for ${roomKeys.length} rooms`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Reset user counts for ${roomKeys.length} rooms`,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    logError(requestId, "Error resetting user counts:", error);
    return createErrorResponse("Failed to reset user counts", 500);
  }
}

