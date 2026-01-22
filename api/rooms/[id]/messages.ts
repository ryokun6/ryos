/**
 * /api/rooms/[id]/messages
 * 
 * GET  - Get messages for a room
 * POST - Send a message to a room
 */

import {
  createRedis,
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
} from "../../_utils/middleware.js";
import { validateAuth } from "../../_utils/auth/index.js";
import {
  isProfaneUsername,
  assertValidRoomId,
  escapeHTML,
  filterProfanityPreservingUrls,
  MAX_MESSAGE_LENGTH,
} from "../../_utils/_validation.js";
import {
  CHAT_ROOM_PREFIX,
  CHAT_MESSAGES_PREFIX,
  CHAT_USERS_PREFIX,
  CHAT_BURST_PREFIX,
  CHAT_BURST_SHORT_WINDOW_SECONDS,
  CHAT_BURST_SHORT_LIMIT,
  CHAT_BURST_LONG_WINDOW_SECONDS,
  CHAT_BURST_LONG_LIMIT,
  CHAT_MIN_INTERVAL_SECONDS,
  USER_EXPIRATION_TIME,
  CHAT_ROOM_PRESENCE_ZSET_PREFIX,
} from "../_helpers/_constants.js";
import { ensureUserExists } from "../_helpers/_users.js";
import type { Message, Room, User } from "../_helpers/_types.js";

export const config = {
  runtime: "nodejs",
};

// ============================================================================
// Local Redis helpers (avoid importing from _redis.ts to prevent bundler issues)
// ============================================================================

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getCurrentTimestamp(): number {
  return Date.now();
}

function parseJSON<T>(data: unknown): T | null {
  if (!data) return null;
  if (typeof data === "object") return data as T;
  if (typeof data === "string") {
    try { return JSON.parse(data) as T; }
    catch { return null; }
  }
  return null;
}

async function roomExists(roomId: string): Promise<boolean> {
  const redis = createRedis();
  const exists = await redis.exists(`${CHAT_ROOM_PREFIX}${roomId}`);
  return exists === 1;
}

async function getRoom(roomId: string): Promise<Room | null> {
  const redis = createRedis();
  const data = await redis.get(`${CHAT_ROOM_PREFIX}${roomId}`);
  return parseJSON<Room>(data);
}

async function getMessages(roomId: string, limit: number = 20): Promise<Message[]> {
  const redis = createRedis();
  const messagesKey = `${CHAT_MESSAGES_PREFIX}${roomId}`;
  const rawMessages = await redis.lrange<(Message | string)[]>(messagesKey, 0, limit - 1);
  return (rawMessages || [])
    .map((item) => parseJSON<Message>(item))
    .filter((msg): msg is Message => msg !== null);
}

async function addMessage(roomId: string, message: Message): Promise<void> {
  const redis = createRedis();
  const messagesKey = `${CHAT_MESSAGES_PREFIX}${roomId}`;
  await redis.lpush(messagesKey, JSON.stringify(message));
  await redis.ltrim(messagesKey, 0, 99);
}

async function getLastMessage(roomId: string): Promise<Message | null> {
  const redis = createRedis();
  const messagesKey = `${CHAT_MESSAGES_PREFIX}${roomId}`;
  const lastMessages = await redis.lrange<(Message | string)[]>(messagesKey, 0, 0);
  if (!lastMessages || lastMessages.length === 0) return null;
  return parseJSON<Message>(lastMessages[0]);
}

async function setUser(username: string, user: User): Promise<void> {
  const redis = createRedis();
  await redis.set(`${CHAT_USERS_PREFIX}${username}`, JSON.stringify(user));
}

async function refreshRoomPresence(roomId: string, username: string): Promise<void> {
  const redis = createRedis();
  const zkey = `${CHAT_ROOM_PRESENCE_ZSET_PREFIX}${roomId}`;
  await redis.zadd(zkey, { score: Date.now(), member: username });
}

// ============================================================================
// Route Handler
// ============================================================================

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

    const authResult = await validateAuth(createRedis(), usernameHeader, token, {});
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
        const redis = createRedis();
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
      await createRedis().expire(`chat:users:${username}`, USER_EXPIRATION_TIME);
      await refreshRoomPresence(roomId, username);

      return new Response(JSON.stringify({ message }), { status: 201, headers });
    } catch (error) {
      console.error(`Error sending message in room ${roomId}:`, error);
      return new Response(JSON.stringify({ error: "Failed to send message" }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
}
