/**
 * /api/rooms/[id]/messages
 * 
 * GET  - Get messages for a room
 * POST - Send a message to a room
 */

import { getEffectiveOrigin, isAllowedOrigin, preflightIfNeeded } from "../../_utils/_cors.js";
import { validateAuthToken } from "../../_utils/_auth-validate.js";
import {
  isProfaneUsername,
  assertValidRoomId,
  escapeHTML,
  filterProfanityPreservingUrls,
  MAX_MESSAGE_LENGTH,
} from "../../_utils/_validation.js";

import { Redis } from "@upstash/redis";
import {
  roomExists,
  getRoom,
  getMessages,
  addMessage,
  getLastMessage,
  generateId,
  getCurrentTimestamp,
  setUser,
} from "../../chat-rooms/_redis.js";

// Create Redis client for rate limiting operations
function getRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}
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
import { ensureUserExists } from "../../chat-rooms/_users.js";
import type { Message } from "../../chat-rooms/_types.js";

export const edge = true;
export const config = {
  runtime: "edge",
};

function getRoomId(req: Request): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const roomsIndex = pathParts.indexOf("rooms");
  if (roomsIndex !== -1 && pathParts[roomsIndex + 1]) {
    return pathParts[roomsIndex + 1];
  }
  return null;
}

export default async function handler(req: Request) {
  const origin = getEffectiveOrigin(req);
  
  if (req.method === "OPTIONS") {
    const preflight = preflightIfNeeded(req, ["GET", "POST", "OPTIONS"], origin);
    if (preflight) return preflight;
    return new Response(null, { status: 204 });
  }

  if (!isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { 
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;

  const roomId = getRoomId(req);
  if (!roomId) {
    return new Response(JSON.stringify({ error: "Room ID is required" }), { status: 400, headers });
  }

  try {
    assertValidRoomId(roomId, "messages-operation");
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Invalid room ID" }), { status: 400, headers });
  }

  // GET - Get messages
  if (req.method === "GET") {
    try {
      const exists = await roomExists(roomId);
      if (!exists) {
        return new Response(JSON.stringify({ error: "Room not found" }), { status: 404, headers });
      }

      const url = new URL(req.url);
      const limitParam = url.searchParams.get("limit");
      const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 20, 500) : 20;

      const messages = await getMessages(roomId, limit);
      return new Response(JSON.stringify({ messages }), { status: 200, headers });
    } catch (error) {
      console.error(`Error fetching messages for room ${roomId}:`, error);
      return new Response(JSON.stringify({ error: "Failed to fetch messages" }), { status: 500, headers });
    }
  }

  // POST - Send message
  if (req.method === "POST") {
    const authHeader = req.headers.get("authorization");
    const usernameHeader = req.headers.get("x-username");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token || !usernameHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized - missing credentials" }), { status: 401, headers });
    }

    const authResult = await validateAuthToken(usernameHeader, token, "send-message");
    if (!authResult.valid) {
      return new Response(JSON.stringify({ error: "Unauthorized - invalid token" }), { status: 401, headers });
    }

    const username = usernameHeader.toLowerCase();

    if (isProfaneUsername(username)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
    }

    const originalContent = body?.content;
    if (!originalContent || typeof originalContent !== "string") {
      return new Response(JSON.stringify({ error: "Content is required" }), { status: 400, headers });
    }

    const content = escapeHTML(filterProfanityPreservingUrls(originalContent));

    const roomData = await getRoom(roomId);
    if (!roomData) {
      return new Response(JSON.stringify({ error: "Room not found" }), { status: 404, headers });
    }

    const isPublicRoom = !roomData.type || roomData.type === "public";

    // Burst rate limiting for public rooms
    if (isPublicRoom) {
      try {
        const redis = getRedis();
        const shortKey = `${CHAT_BURST_PREFIX}s:${roomId}:${username}`;
        const longKey = `${CHAT_BURST_PREFIX}l:${roomId}:${username}`;
        const lastKey = `${CHAT_BURST_PREFIX}last:${roomId}:${username}`;

        const shortCount = await redis.incr(shortKey);
        if (shortCount === 1) await redis.expire(shortKey, CHAT_BURST_SHORT_WINDOW_SECONDS);
        if (shortCount > CHAT_BURST_SHORT_LIMIT) {
          return new Response(JSON.stringify({ error: "You're sending messages too quickly." }), { status: 429, headers });
        }

        const longCount = await redis.incr(longKey);
        if (longCount === 1) await redis.expire(longKey, CHAT_BURST_LONG_WINDOW_SECONDS);
        if (longCount > CHAT_BURST_LONG_LIMIT) {
          return new Response(JSON.stringify({ error: "Too many messages. Please wait." }), { status: 429, headers });
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        const lastSent = await redis.get<string>(lastKey);
        if (lastSent) {
          const delta = nowSeconds - parseInt(lastSent);
          if (delta < CHAT_MIN_INTERVAL_SECONDS) {
            return new Response(JSON.stringify({ error: "Please wait before sending another message." }), { status: 429, headers });
          }
        }
        await redis.set(lastKey, nowSeconds, { ex: CHAT_BURST_LONG_WINDOW_SECONDS });
      } catch (rlError) {
        console.error("Chat burst rate-limit check failed", rlError);
      }
    }

    try {
      let userData;
      try {
        userData = await ensureUserExists(username, "send-message");
        if (!userData) {
          return new Response(JSON.stringify({ error: "Failed to verify user" }), { status: 500, headers });
        }
      } catch (error) {
        if (error instanceof Error && error.message === "Username contains inappropriate language") {
          return new Response(JSON.stringify({ error: "Username contains inappropriate language" }), { status: 400, headers });
        }
        return new Response(JSON.stringify({ error: "Failed to verify user" }), { status: 500, headers });
      }

      if (content.length > MAX_MESSAGE_LENGTH) {
        return new Response(JSON.stringify({ error: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH}` }), { status: 400, headers });
      }

      const lastMsg = await getLastMessage(roomId);
      if (lastMsg && lastMsg.username === username && lastMsg.content === content) {
        return new Response(JSON.stringify({ error: "Duplicate message detected" }), { status: 400, headers });
      }

      const message: Message = {
        id: generateId(),
        roomId,
        username,
        content,
        timestamp: getCurrentTimestamp(),
      };

      await addMessage(roomId, message);

      const updatedUser = { ...userData, lastActive: getCurrentTimestamp() };
      await setUser(username, updatedUser);
      await getRedis().expire(`chat:users:${username}`, USER_EXPIRATION_TIME);
      await refreshRoomPresence(roomId, username);

      return new Response(JSON.stringify({ message }), { status: 201, headers });
    } catch (error) {
      console.error(`Error sending message in room ${roomId}:`, error);
      return new Response(JSON.stringify({ error: "Failed to send message" }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
}
