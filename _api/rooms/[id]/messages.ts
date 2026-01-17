/**
 * /api/rooms/[id]/messages
 * 
 * GET  - Get messages for a room
 * POST - Send a message to a room
 */

import { Redis } from "@upstash/redis";
import {
  jsonResponse,
  errorResponse,
  handleCors,
  requireAuth,
  parseJsonBody,
  getQueryParam,
} from "../../_utils/middleware.js";
import {
  isProfaneUsername,
  assertValidRoomId,
  escapeHTML,
  filterProfanityPreservingUrls,
  MAX_MESSAGE_LENGTH,
} from "../../_utils/_validation.js";
import * as RateLimit from "../../_utils/_rate-limit.js";

// Import from existing chat-rooms modules
import {
  redis,
  roomExists,
  getRoom,
  getMessages,
  addMessage,
  getLastMessage,
  generateId,
  getCurrentTimestamp,
  setUser,
} from "../../chat-rooms/_redis.js";
import {
  CHAT_BURST_PREFIX,
  CHAT_BURST_SHORT_WINDOW_SECONDS,
  CHAT_BURST_SHORT_LIMIT,
  CHAT_BURST_LONG_WINDOW_SECONDS,
  CHAT_BURST_LONG_LIMIT,
  CHAT_MIN_INTERVAL_SECONDS,
  USER_EXPIRATION_TIME,
} from "../../chat-rooms/_constants.js";
import { refreshRoomPresence } from "../../chat-rooms/_presence.js";
import { broadcastNewMessage } from "../../chat-rooms/_pusher.js";
import { ensureUserExists } from "../../chat-rooms/_users.js";
import type { Message } from "../../chat-rooms/_types.js";

export const runtime = "edge";
export const maxDuration = 15;

/**
 * Extract room ID from URL path
 */
function getRoomId(request: Request): string | null {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/");
  // Path: /api/rooms/[id]/messages -> ["", "api", "rooms", "[id]", "messages"]
  const roomsIndex = pathParts.indexOf("rooms");
  if (roomsIndex !== -1 && pathParts[roomsIndex + 1]) {
    return pathParts[roomsIndex + 1];
  }
  return null;
}

/**
 * GET /api/rooms/[id]/messages - Get messages for a room
 */
export async function GET(request: Request): Promise<Response> {
  const cors = handleCors(request, ["GET", "POST", "OPTIONS"]);
  if (cors.preflight) return cors.preflight;
  if (!cors.allowed) {
    return errorResponse("Unauthorized", 403);
  }

  const roomId = getRoomId(request);
  if (!roomId) {
    return errorResponse("Room ID is required", 400, cors.origin);
  }

  try {
    assertValidRoomId(roomId, "get-messages");
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Invalid room ID", 400, cors.origin);
  }

  try {
    const exists = await roomExists(roomId);
    if (!exists) {
      return errorResponse("Room not found", 404, cors.origin);
    }

    const limitParam = getQueryParam(request, "limit");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 20, 500) : 20;

    const messages = await getMessages(roomId, limit);
    return jsonResponse({ messages }, 200, cors.origin);
  } catch (error) {
    console.error(`Error fetching messages for room ${roomId}:`, error);
    return errorResponse("Failed to fetch messages", 500, cors.origin);
  }
}

/**
 * POST /api/rooms/[id]/messages - Send a message to a room
 */
export async function POST(request: Request): Promise<Response> {
  const cors = handleCors(request, ["GET", "POST", "OPTIONS"]);
  if (cors.preflight) return cors.preflight;
  if (!cors.allowed) {
    return errorResponse("Unauthorized", 403);
  }

  const redisClient = new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });

  // Require authentication
  const auth = await requireAuth(request, redisClient, cors.origin);
  if (auth.error) return auth.error;

  const roomId = getRoomId(request);
  if (!roomId) {
    return errorResponse("Room ID is required", 400, cors.origin);
  }

  try {
    assertValidRoomId(roomId, "send-message");
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Invalid room ID", 400, cors.origin);
  }

  const username = auth.user!.username;

  // Check profanity in username
  if (isProfaneUsername(username)) {
    return errorResponse("Unauthorized", 401, cors.origin);
  }

  // Parse body
  const { data: body, error: parseError } = await parseJsonBody<{ content: string }>(request);
  if (parseError || !body) {
    return errorResponse(parseError || "Invalid request body", 400, cors.origin);
  }

  const originalContent = body.content;

  if (!originalContent || typeof originalContent !== "string") {
    return errorResponse("Content is required", 400, cors.origin);
  }

  // Filter profanity and escape HTML
  const content = escapeHTML(filterProfanityPreservingUrls(originalContent));

  // Check room exists and get type
  const roomData = await getRoom(roomId);
  if (!roomData) {
    return errorResponse("Room not found", 404, cors.origin);
  }

  const isPublicRoom = !roomData.type || roomData.type === "public";

  // Burst rate limiting for public rooms
  if (isPublicRoom) {
    try {
      const shortKey = `${CHAT_BURST_PREFIX}s:${roomId}:${username}`;
      const longKey = `${CHAT_BURST_PREFIX}l:${roomId}:${username}`;
      const lastKey = `${CHAT_BURST_PREFIX}last:${roomId}:${username}`;

      // Short window check
      const shortCount = await redis.incr(shortKey);
      if (shortCount === 1) {
        await redis.expire(shortKey, CHAT_BURST_SHORT_WINDOW_SECONDS);
      }
      if (shortCount > CHAT_BURST_SHORT_LIMIT) {
        return errorResponse(
          "You're sending messages too quickly. Please slow down.",
          429,
          cors.origin
        );
      }

      // Long window check
      const longCount = await redis.incr(longKey);
      if (longCount === 1) {
        await redis.expire(longKey, CHAT_BURST_LONG_WINDOW_SECONDS);
      }
      if (longCount > CHAT_BURST_LONG_LIMIT) {
        return errorResponse(
          "Too many messages in a short period. Please wait a moment.",
          429,
          cors.origin
        );
      }

      // Minimum interval check
      const nowSeconds = Math.floor(Date.now() / 1000);
      const lastSent = await redis.get<string>(lastKey);
      if (lastSent) {
        const delta = nowSeconds - parseInt(lastSent);
        if (delta < CHAT_MIN_INTERVAL_SECONDS) {
          return errorResponse(
            "Please wait a moment before sending another message.",
            429,
            cors.origin
          );
        }
      }
      await redis.set(lastKey, nowSeconds, {
        ex: CHAT_BURST_LONG_WINDOW_SECONDS,
      });
    } catch (rlError) {
      console.error("Chat burst rate-limit check failed", rlError);
    }
  }

  try {
    // Ensure user exists
    let userData;
    try {
      userData = await ensureUserExists(username, "send-message");
      if (!userData) {
        return errorResponse("Failed to verify or create user", 500, cors.origin);
      }
    } catch (error) {
      if (error instanceof Error && error.message === "Username contains inappropriate language") {
        return errorResponse("Username contains inappropriate language", 400, cors.origin);
      }
      return errorResponse("Failed to verify or create user", 500, cors.origin);
    }

    // Validate message length
    if (content.length > MAX_MESSAGE_LENGTH) {
      return errorResponse(
        `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`,
        400,
        cors.origin
      );
    }

    // Duplicate check
    const lastMsg = await getLastMessage(roomId);
    if (lastMsg && lastMsg.username === username && lastMsg.content === content) {
      return errorResponse("Duplicate message detected", 400, cors.origin);
    }

    // Create and save message
    const message: Message = {
      id: generateId(),
      roomId,
      username,
      content,
      timestamp: getCurrentTimestamp(),
    };

    await addMessage(roomId, message);

    // Update user's last active timestamp
    const updatedUser = { ...userData, lastActive: getCurrentTimestamp() };
    await setUser(username, updatedUser);
    await redis.expire(`chat:users:${username}`, USER_EXPIRATION_TIME);

    // Refresh presence
    await refreshRoomPresence(roomId, username);

    // Broadcast message
    try {
      await broadcastNewMessage(roomId, message);
    } catch (pusherError) {
      console.error("Error triggering Pusher event:", pusherError);
    }

    return jsonResponse({ message }, 201, cors.origin);
  } catch (error) {
    console.error(`Error sending message in room ${roomId}:`, error);
    return errorResponse("Failed to send message", 500, cors.origin);
  }
}

export async function OPTIONS(request: Request): Promise<Response> {
  const cors = handleCors(request, ["GET", "POST", "OPTIONS"]);
  return cors.preflight || new Response(null, { status: 204 });
}
