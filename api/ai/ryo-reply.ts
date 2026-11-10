/**
 * POST /api/ai/ryo-reply
 *
 * Generate an AI reply as Ryo in chat rooms
 */

import { generateText } from "ai";
import { z } from "zod";
import { geminiFlashLiteSettings } from "../_utils/gemini-flash-lite.js";
import {
  escapeHTML,
  filterProfanityPreservingUrls,
  MAX_MESSAGE_LENGTH,
  MAX_USERNAME_LENGTH,
  ROOM_ID_REGEX,
} from "../_utils/_validation.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getRoom, addMessage, generateId, getCurrentTimestamp } from "../rooms/_helpers/_redis.js";
import { getRoomWriteAccessError } from "../rooms/_helpers/_access.js";
import { broadcastNewMessage } from "../rooms/_helpers/_pusher.js";
import type { Message } from "../rooms/_helpers/_types.js";
import { apiHandler } from "../_utils/api-handler.js";
import { CHAT_ROOM_REPLY_INSTRUCTIONS } from "../_utils/_aiPrompts.js";

/**
 * Prompt character cap. Matches `/api/applet-ai` (`prompt` / message `content`
 * max 4000) so room @ryo mentions stay in the same ballpark as other AI routes.
 */
export const MAX_RYO_REPLY_PROMPT_CHARS = 4000;

/** Max prior room messages the client may include as chat context. */
export const MAX_RYO_REPLY_RECENT_MESSAGES = 10;

/** One `username: content` line from the client context blob. */
const MAX_RECENT_MESSAGE_LINE_CHARS =
  MAX_USERNAME_LENGTH + 2 + MAX_MESSAGE_LENGTH;

/** Upper bound for the newline-joined `recentMessages` string (10 lines). */
const MAX_RECENT_MESSAGES_CHARS =
  MAX_RYO_REPLY_RECENT_MESSAGES * (MAX_RECENT_MESSAGE_LINE_CHARS + 1);

const bodySchema = z.object({
  roomId: z.string().regex(ROOM_ID_REGEX, "Invalid roomId format"),
  prompt: z.string().min(1).max(MAX_RYO_REPLY_PROMPT_CHARS),
  systemState: z
    .object({
      chatRoomContext: z
        .object({
          recentMessages: z
            .string()
            .max(MAX_RECENT_MESSAGES_CHARS)
            .refine(
              (value) =>
                value.split("\n").filter((line) => line.length > 0).length <=
                MAX_RYO_REPLY_RECENT_MESSAGES,
              {
                message: `At most ${MAX_RYO_REPLY_RECENT_MESSAGES} recent messages`,
              }
            )
            .optional(),
          mentionedMessage: z.string().max(MAX_MESSAGE_LENGTH).optional(),
        })
        .optional(),
    })
    .optional(),
});

type RyoReplyRequest = z.infer<typeof bodySchema>;

export default apiHandler<RyoReplyRequest>(
  {
    methods: ["POST"],
    auth: "required",
    parseJsonBody: true,
    bodySchema,
  },
  async ({ res, redis, logger, startTime, user, body }) => {
    const username = user?.username || "";

    // Rate limiting: 5/min per user
    const rlKey = RateLimit.makeKey(["rl", "ai:ryo-reply", "user", username]);
    const rlResult = await RateLimit.checkCounterLimit({
      key: rlKey,
      windowSeconds: 60,
      limit: 5,
    });

    if (!rlResult.allowed) {
      logger.warn("Rate limit exceeded", { username });
      logger.response(429, Date.now() - startTime);
      res.status(429).json({ error: "Rate limit exceeded" });
      return;
    }

    // bodySchema guarantees a validated body; keep the null check for safety.
    if (!body) {
      logger.warn("Invalid JSON body");
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }

    const { roomId, prompt, systemState } = body;

    const room = await getRoom(roomId, redis);
    if (!room) {
      logger.warn("Room not found", { roomId });
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "Room not found" });
      return;
    }

    const writeAccessError = getRoomWriteAccessError(room, user);
    if (writeAccessError) {
      logger.warn("Forbidden Ryo reply room write", { roomId, username });
      logger.response(writeAccessError.status, Date.now() - startTime);
      res.status(writeAccessError.status).json({ error: writeAccessError.error });
      return;
    }

    const messages = [
      systemState?.chatRoomContext
        ? {
            role: "user" as const,
            content: `${prompt}\n\n<chat_room_context>\nroomId: ${roomId}\nrecentMessages:\n${
              systemState.chatRoomContext.recentMessages || ""
            }\nmentionedMessage: ${
              systemState.chatRoomContext.mentionedMessage || prompt
            }\n</chat_room_context>`,
          }
        : { role: "user" as const, content: prompt },
    ];

    let replyText = "";
    try {
      logger.info("Generating AI reply", { roomId, promptLength: prompt.length });
      const { text } = await generateText({
        ...geminiFlashLiteSettings("low"),
        instructions: CHAT_ROOM_REPLY_INSTRUCTIONS,
        messages,
        maxOutputTokens: 2000,
      });
      replyText = text;
      logger.info("AI reply generated", { replyLength: replyText.length });
    } catch (e) {
      logger.error("AI generation failed for Ryo reply", e);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to generate reply" });
      return;
    }

    // Store with the same length cap as user chat messages.
    const storedContent =
      replyText.length > MAX_MESSAGE_LENGTH
        ? replyText.slice(0, MAX_MESSAGE_LENGTH)
        : replyText;

    const message: Message = {
      id: generateId(),
      roomId,
      username: "ryo",
      content: escapeHTML(filterProfanityPreservingUrls(storedContent)),
      timestamp: getCurrentTimestamp(),
    };

    await addMessage(roomId, message, redis);

    // Broadcast the message to all clients in the room via Pusher
    try {
      await broadcastNewMessage(roomId, message);
      logger.info("Ryo reply broadcasted via Pusher", { roomId, messageId: message.id });
    } catch (pusherError) {
      logger.error("Error broadcasting Ryo reply via Pusher", pusherError);
    }

    logger.info("Ryo reply posted", { roomId, messageId: message.id });
    logger.response(201, Date.now() - startTime);
    res.status(201).json({ message });
  }
);
