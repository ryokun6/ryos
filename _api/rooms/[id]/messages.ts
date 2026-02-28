/**
 * /api/rooms/[id]/messages
 *
 * GET  - Get messages for a room
 * POST - Send a message to a room
 */

import { createApiHandler } from "../../_utils/handler.js";
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
import { addMessage, generateId, getCurrentTimestamp, getLastMessage, getMessages, getRoom, roomExists, setUser } from "../_helpers/_redis.js";
import { refreshRoomPresence } from "../_helpers/_presence.js";
import type { Message } from "../_helpers/_types.js";
import { broadcastNewMessage } from "../_helpers/_pusher.js";

export const runtime = "nodejs";

interface SendMessageRequest {
  content?: string;
}

export default createApiHandler(
  {
    operation: "room-messages",
    methods: ["GET", "POST"],
    cors: {
      headers: ["Content-Type", "Authorization", "X-Username"],
    },
  },
  async (_req, _res, ctx): Promise<void> => {
    const roomId = ctx.getQueryParam("id");
    if (!roomId) {
      ctx.response.badRequest("Room ID is required");
      return;
    }

    try {
      assertValidRoomId(roomId, "messages-operation");
    } catch (validationError) {
      ctx.response.badRequest(
        validationError instanceof Error
          ? validationError.message
          : "Invalid room ID"
      );
      return;
    }

    if (ctx.method === "GET") {
      try {
        const exists = await roomExists(roomId);
        if (!exists) {
          ctx.response.notFound("Room not found");
          return;
        }

        const limitParam = ctx.getQueryParam("limit");
        const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 20, 500) : 20;
        const messages = await getMessages(roomId, limit);
        ctx.logger.info("Messages retrieved", { roomId, count: messages.length });
        ctx.response.ok({ messages });
      } catch (routeError) {
        ctx.logger.error(`Error fetching messages for room ${roomId}`, routeError);
        ctx.response.serverError("Failed to fetch messages");
      }
      return;
    }

    const user = await ctx.requireAuth();
    if (!user) {
      return;
    }
    const username = user.username;

    if (isProfaneUsername(username)) {
      ctx.response.unauthorized("Unauthorized");
      return;
    }

    const { data: body, error } = ctx.parseJsonBody<SendMessageRequest>();
    if (error || !body) {
      ctx.response.badRequest(error ?? "Invalid JSON body");
      return;
    }

    const originalContent = body.content;
    if (!originalContent || typeof originalContent !== "string") {
      ctx.response.badRequest("Content is required");
      return;
    }

    const content = escapeHTML(filterProfanityPreservingUrls(originalContent));
    const roomData = await getRoom(roomId);
    if (!roomData) {
      ctx.response.notFound("Room not found");
      return;
    }

    const isPublicRoom = !roomData.type || roomData.type === "public";
    if (isPublicRoom) {
      try {
        const shortKey = `${CHAT_BURST_PREFIX}s:${roomId}:${username}`;
        const longKey = `${CHAT_BURST_PREFIX}l:${roomId}:${username}`;
        const lastKey = `${CHAT_BURST_PREFIX}last:${roomId}:${username}`;

        const shortCount = await ctx.redis.incr(shortKey);
        if (shortCount === 1) {
          await ctx.redis.expire(shortKey, CHAT_BURST_SHORT_WINDOW_SECONDS);
        }
        if (shortCount > CHAT_BURST_SHORT_LIMIT) {
          ctx.response.tooManyRequests("You're sending messages too quickly.");
          return;
        }

        const longCount = await ctx.redis.incr(longKey);
        if (longCount === 1) {
          await ctx.redis.expire(longKey, CHAT_BURST_LONG_WINDOW_SECONDS);
        }
        if (longCount > CHAT_BURST_LONG_LIMIT) {
          ctx.response.tooManyRequests("Too many messages. Please wait.");
          return;
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        const lastSent = await ctx.redis.get<string>(lastKey);
        if (lastSent) {
          const delta = nowSeconds - parseInt(lastSent, 10);
          if (delta < CHAT_MIN_INTERVAL_SECONDS) {
            ctx.response.tooManyRequests("Please wait before sending another message.");
            return;
          }
        }
        await ctx.redis.set(lastKey, nowSeconds, { ex: CHAT_BURST_LONG_WINDOW_SECONDS });
      } catch (rlError) {
        ctx.logger.error("Chat burst rate-limit check failed", rlError);
      }
    }

    try {
      let userData;
      try {
        userData = await ensureUserExists(username, "send-message");
        if (!userData) {
          ctx.response.serverError("Failed to verify user");
          return;
        }
      } catch (userError) {
        if (
          userError instanceof Error &&
          userError.message === "Username contains inappropriate language"
        ) {
          ctx.response.badRequest("Username contains inappropriate language");
          return;
        }
        ctx.logger.error("Failed to verify user", userError);
        ctx.response.serverError("Failed to verify user");
        return;
      }

      if (content.length > MAX_MESSAGE_LENGTH) {
        ctx.response.badRequest(
          `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH}`
        );
        return;
      }

      const lastMsg = await getLastMessage(roomId);
      if (lastMsg && lastMsg.username === username && lastMsg.content === content) {
        ctx.response.badRequest("Duplicate message detected");
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
      await ctx.redis.expire(`chat:users:${username}`, USER_EXPIRATION_TIME);
      await refreshRoomPresence(roomId, username);
      await broadcastNewMessage(roomId, message, roomData);

      ctx.logger.info("Message sent", { username, roomId, messageId: message.id });
      ctx.response.created({ message });
    } catch (routeError) {
      ctx.logger.error(`Error sending message in room ${roomId}`, routeError);
      ctx.response.serverError("Failed to send message");
    }
  }
);
