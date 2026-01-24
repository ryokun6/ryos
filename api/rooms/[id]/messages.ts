/**
 * /api/rooms/[id]/messages
 * 
 * GET  - Get messages for a room
 * POST - Send a message to a room
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
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
import { initLogger } from "../../_utils/_logging.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../../_utils/_cors.js";

export const runtime = "nodejs";

// ============================================================================
// Local Redis helpers (avoid importing from _redis.ts to prevent bundler issues)
// ============================================================================

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { requestId: _requestId, logger } = initLogger();
  const startTime = Date.now();
  
  const origin = getEffectiveOrigin(req);
  setCorsHeaders(res, origin);
  
  logger.request(req.method || "GET", req.url || "/api/rooms/[id]/messages");
  
  if (req.method === "OPTIONS") {
    logger.response(204, Date.now() - startTime);
    return res.status(204).end();
  }

  if (!isAllowedOrigin(origin)) {
    logger.warn("Unauthorized origin", { origin });
    logger.response(403, Date.now() - startTime);
    return res.status(403).json({ error: "Unauthorized" });
  }

  // Extract room ID from query params
  const roomId = req.query.id as string | undefined;
  if (!roomId) {
    logger.warn("Missing room ID");
    logger.response(400, Date.now() - startTime);
    return res.status(400).json({ error: "Room ID is required" });
  }

  try {
    assertValidRoomId(roomId, "messages-operation");
  } catch (e) {
    logger.warn("Invalid room ID", { roomId, error: e instanceof Error ? e.message : "Invalid" });
    logger.response(400, Date.now() - startTime);
    return res.status(400).json({ error: e instanceof Error ? e.message : "Invalid room ID" });
  }

  // GET - Get messages
  if (req.method === "GET") {
    try {
      const exists = await roomExists(roomId);
      if (!exists) {
        logger.warn("Room not found", { roomId });
        logger.response(404, Date.now() - startTime);
        return res.status(404).json({ error: "Room not found" });
      }

      const limitParam = req.query.limit as string | undefined;
      const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 20, 500) : 20;

      const messages = await getMessages(roomId, limit);
      
      logger.info("Messages retrieved", { roomId, count: messages.length });
      logger.response(200, Date.now() - startTime);
      return res.status(200).json({ messages });
    } catch (error) {
      logger.error(`Error fetching messages for room ${roomId}`, error);
      logger.response(500, Date.now() - startTime);
      return res.status(500).json({ error: "Failed to fetch messages" });
    }
  }

  // POST - Send message
  if (req.method === "POST") {
    const authHeader = req.headers.authorization as string | undefined;
    const usernameHeader = req.headers["x-username"] as string | undefined;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token || !usernameHeader) {
      logger.warn("Missing credentials");
      logger.response(401, Date.now() - startTime);
      return res.status(401).json({ error: "Unauthorized - missing credentials" });
    }

    const authResult = await validateAuth(createRedis(), usernameHeader, token, {});
    if (!authResult.valid) {
      logger.warn("Invalid token", { username: usernameHeader });
      logger.response(401, Date.now() - startTime);
      return res.status(401).json({ error: "Unauthorized - invalid token" });
    }

    const username = usernameHeader.toLowerCase();

    if (isProfaneUsername(username)) {
      logger.warn("Profane username", { username });
      logger.response(401, Date.now() - startTime);
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body = req.body;

    const originalContent = body?.content;
    if (!originalContent || typeof originalContent !== "string") {
      logger.warn("Missing content");
      logger.response(400, Date.now() - startTime);
      return res.status(400).json({ error: "Content is required" });
    }

    const content = escapeHTML(filterProfanityPreservingUrls(originalContent));

    const roomData = await getRoom(roomId);
    if (!roomData) {
      logger.warn("Room not found", { roomId });
      logger.response(404, Date.now() - startTime);
      return res.status(404).json({ error: "Room not found" });
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
          logger.warn("Short burst rate limit exceeded", { username, roomId });
          logger.response(429, Date.now() - startTime);
          return res.status(429).json({ error: "You're sending messages too quickly." });
        }

        const longCount = await redis.incr(longKey);
        if (longCount === 1) await redis.expire(longKey, CHAT_BURST_LONG_WINDOW_SECONDS);
        if (longCount > CHAT_BURST_LONG_LIMIT) {
          logger.warn("Long burst rate limit exceeded", { username, roomId });
          logger.response(429, Date.now() - startTime);
          return res.status(429).json({ error: "Too many messages. Please wait." });
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        const lastSent = await redis.get<string>(lastKey);
        if (lastSent) {
          const delta = nowSeconds - parseInt(lastSent);
          if (delta < CHAT_MIN_INTERVAL_SECONDS) {
            logger.warn("Min interval not met", { username, roomId });
            logger.response(429, Date.now() - startTime);
            return res.status(429).json({ error: "Please wait before sending another message." });
          }
        }
        await redis.set(lastKey, nowSeconds, { ex: CHAT_BURST_LONG_WINDOW_SECONDS });
      } catch (rlError) {
        logger.error("Chat burst rate-limit check failed", rlError);
      }
    }

    try {
      let userData;
      try {
        userData = await ensureUserExists(username, "send-message");
        if (!userData) {
          logger.error("Failed to verify user", { username });
          logger.response(500, Date.now() - startTime);
          return res.status(500).json({ error: "Failed to verify user" });
        }
      } catch (error) {
        if (error instanceof Error && error.message === "Username contains inappropriate language") {
          logger.warn("Inappropriate username", { username });
          logger.response(400, Date.now() - startTime);
          return res.status(400).json({ error: "Username contains inappropriate language" });
        }
        logger.error("Failed to verify user", error);
        logger.response(500, Date.now() - startTime);
        return res.status(500).json({ error: "Failed to verify user" });
      }

      if (content.length > MAX_MESSAGE_LENGTH) {
        logger.warn("Message too long", { length: content.length, max: MAX_MESSAGE_LENGTH });
        logger.response(400, Date.now() - startTime);
        return res.status(400).json({ error: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH}` });
      }

      const lastMsg = await getLastMessage(roomId);
      if (lastMsg && lastMsg.username === username && lastMsg.content === content) {
        logger.warn("Duplicate message detected", { username, roomId });
        logger.response(400, Date.now() - startTime);
        return res.status(400).json({ error: "Duplicate message detected" });
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

      logger.info("Message sent", { username, roomId, messageId: message.id });
      logger.response(201, Date.now() - startTime);
      return res.status(201).json({ message });
    } catch (error) {
      logger.error(`Error sending message in room ${roomId}`, error);
      logger.response(500, Date.now() - startTime);
      return res.status(500).json({ error: "Failed to send message" });
    }
  }

  logger.warn("Method not allowed", { method: req.method });
  logger.response(405, Date.now() - startTime);
  return res.status(405).json({ error: "Method not allowed" });
}
