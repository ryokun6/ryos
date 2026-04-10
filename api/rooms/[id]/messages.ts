/**
 * /api/rooms/[id]/messages
 *
 * GET  - Get messages for a room
 * POST - Send a message to a room
 */

import { apiHandler } from "../../_utils/api-handler.js";
import {
  isProfaneUsername,
  assertValidRoomId,
  escapeHTML,
  filterProfanityPreservingUrls,
  MAX_MESSAGE_LENGTH,
} from "../../_utils/_validation.js";
import {
  CHAT_BURST_PREFIX,
  CHAT_BURST_SHORT_WINDOW_SECONDS,
  CHAT_BURST_SHORT_LIMIT,
  CHAT_BURST_LONG_WINDOW_SECONDS,
  CHAT_BURST_LONG_LIMIT,
  CHAT_MIN_INTERVAL_SECONDS,
  USER_EXPIRATION_TIME,
} from "../_helpers/_constants.js";
import { ensureUserExists } from "../_helpers/_users.js";
import { addMessage, generateId, getCurrentTimestamp, getLastMessage, getMessages, getRoom, setUser } from "../_helpers/_redis.js";
import { refreshRoomPresence } from "../_helpers/_presence.js";
import type { Message } from "../_helpers/_types.js";
import { getRoomReadAccessError, getRoomWriteAccessError } from "../_helpers/_access.js";
import { broadcastNewMessage } from "../_helpers/_pusher.js";
import { getIrcBridge, isIrcBridgeEnabled } from "../../_utils/irc/_bridge.js";

export const runtime = "nodejs";

export default apiHandler(
  { methods: ["GET", "POST"], auth: "optional" },
  async ({ req, res, redis, logger, startTime, user }) => {
    const roomId = req.query.id as string | undefined;
    const method = (req.method || "GET").toUpperCase();

    if (!roomId) {
      logger.warn("Missing room ID");
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Room ID is required" });
      return;
    }

    try {
      assertValidRoomId(roomId, "messages-operation");
    } catch (e) {
      logger.warn("Invalid room ID", { roomId, error: e instanceof Error ? e.message : "Invalid" });
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: e instanceof Error ? e.message : "Invalid room ID" });
      return;
    }

    // GET - Get messages
    if (method === "GET") {
      try {
        const roomData = await getRoom(roomId);
        if (!roomData) {
          logger.warn("Room not found", { roomId });
          logger.response(404, Date.now() - startTime);
          res.status(404).json({ error: "Room not found" });
          return;
        }

        const accessError = getRoomReadAccessError(roomData, user);
        if (accessError) {
          logger.warn("Forbidden room messages read", {
            roomId,
            viewer: user?.username ?? null,
          });
          logger.response(accessError.status, Date.now() - startTime);
          res.status(accessError.status).json({ error: accessError.error });
          return;
        }

        const limitParam = req.query.limit as string | undefined;
        const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 20, 500) : 20;

        const messages = await getMessages(roomId, limit);

        logger.info("Messages retrieved", { roomId, count: messages.length });
        logger.response(200, Date.now() - startTime);
        res.status(200).json({ messages });
        return;
      } catch (error) {
        logger.error(`Error fetching messages for room ${roomId}`, error);
        logger.response(500, Date.now() - startTime);
        res.status(500).json({ error: "Failed to fetch messages" });
        return;
      }
    }

    // POST - Send message (requires auth)
    if (!user) {
      logger.warn("Invalid auth on room message write");
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Unauthorized - missing credentials" });
      return;
    }

    const username = user.username;

    if (isProfaneUsername(username)) {
      logger.warn("Profane username", { username });
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const body = req.body;
    const originalContent = body?.content;
    if (!originalContent || typeof originalContent !== "string") {
      logger.warn("Missing content");
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Content is required" });
      return;
    }

    const content = escapeHTML(filterProfanityPreservingUrls(originalContent));

    const roomData = await getRoom(roomId);
    if (!roomData) {
      logger.warn("Room not found", { roomId });
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "Room not found" });
      return;
    }

    const writeAccessError = getRoomWriteAccessError(roomData, user);
    if (writeAccessError) {
      logger.warn("Forbidden room message write", { roomId, username });
      logger.response(writeAccessError.status, Date.now() - startTime);
      res.status(writeAccessError.status).json({ error: writeAccessError.error });
      return;
    }

    const isPublicRoom = !roomData.type || roomData.type === "public";

    if (isPublicRoom) {
      try {
        const shortKey = `${CHAT_BURST_PREFIX}s:${roomId}:${username}`;
        const longKey = `${CHAT_BURST_PREFIX}l:${roomId}:${username}`;
        const lastKey = `${CHAT_BURST_PREFIX}last:${roomId}:${username}`;

        const shortCount = await redis.incr(shortKey);
        if (shortCount === 1) await redis.expire(shortKey, CHAT_BURST_SHORT_WINDOW_SECONDS);
        if (shortCount > CHAT_BURST_SHORT_LIMIT) {
          logger.warn("Short burst rate limit exceeded", { username, roomId });
          logger.response(429, Date.now() - startTime);
          res.status(429).json({ error: "You're sending messages too quickly." });
          return;
        }

        const longCount = await redis.incr(longKey);
        if (longCount === 1) await redis.expire(longKey, CHAT_BURST_LONG_WINDOW_SECONDS);
        if (longCount > CHAT_BURST_LONG_LIMIT) {
          logger.warn("Long burst rate limit exceeded", { username, roomId });
          logger.response(429, Date.now() - startTime);
          res.status(429).json({ error: "Too many messages. Please wait." });
          return;
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        const lastSent = await redis.get<string>(lastKey);
        if (lastSent) {
          const delta = nowSeconds - parseInt(lastSent);
          if (delta < CHAT_MIN_INTERVAL_SECONDS) {
            logger.warn("Min interval not met", { username, roomId });
            logger.response(429, Date.now() - startTime);
            res.status(429).json({ error: "Please wait before sending another message." });
            return;
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
          res.status(500).json({ error: "Failed to verify user" });
          return;
        }
      } catch (error) {
        if (error instanceof Error && error.message === "Username contains inappropriate language") {
          logger.warn("Inappropriate username", { username });
          logger.response(400, Date.now() - startTime);
          res.status(400).json({ error: "Username contains inappropriate language" });
          return;
        }
        logger.error("Failed to verify user", error);
        logger.response(500, Date.now() - startTime);
        res.status(500).json({ error: "Failed to verify user" });
        return;
      }

      if (content.length > MAX_MESSAGE_LENGTH) {
        logger.warn("Message too long", { length: content.length, max: MAX_MESSAGE_LENGTH });
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH}` });
        return;
      }

      const lastMsg = await getLastMessage(roomId);
      if (lastMsg && lastMsg.username === username && lastMsg.content === content) {
        logger.warn("Duplicate message detected", { username, roomId });
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "Duplicate message detected" });
        return;
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
      await redis.expire(`chat:users:${username}`, USER_EXPIRATION_TIME);
      await refreshRoomPresence(roomId, username);

      await broadcastNewMessage(roomId, message, roomData);
      logger.info("Pusher room-message broadcast sent", { roomId, messageId: message.id });

      // If this is an IRC room, forward the message to the IRC bridge. Send
      // the unescaped content so the IRC side doesn't see HTML entities.
      if (roomData.type === "irc" && isIrcBridgeEnabled()) {
        try {
          await getIrcBridge().sendMessage(
            roomData,
            username,
            filterProfanityPreservingUrls(originalContent)
          );
        } catch (err) {
          logger.error("Failed to forward message to IRC bridge", err);
        }
      }

      logger.info("Message sent", { username, roomId, messageId: message.id });
      logger.response(201, Date.now() - startTime);
      res.status(201).json({ message });
    } catch (error) {
      logger.error(`Error sending message in room ${roomId}`, error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to send message" });
    }
  }
);
