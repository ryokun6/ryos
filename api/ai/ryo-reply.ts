/**
 * POST /api/ai/ryo-reply
 * 
 * Generate an AI reply as Ryo in chat rooms
 */

import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { assertValidRoomId, escapeHTML, filterProfanityPreservingUrls } from "../_utils/_validation.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { roomExists, addMessage, generateId, getCurrentTimestamp } from "../rooms/_helpers/_redis.js";
import { broadcastNewMessage } from "../rooms/_helpers/_pusher.js";
import type { Message } from "../rooms/_helpers/_types.js";
import { apiHandler } from "../_utils/api-handler.js";
import {
  PROMPT_CACHE_CONTROL_OPTIONS,
  ROOM_REPLY_STATIC_SYSTEM_PROMPT,
} from "../_utils/_aiPrompts.js";
import { buildChatRoomContextPrompt } from "../_utils/ryo-conversation.js";

export const runtime = "nodejs";

interface RyoReplyRequest {
  roomId: string;
  prompt: string;
  systemState?: {
    chatRoomContext?: {
      recentMessages?: string;
      mentionedMessage?: string;
    };
  };
}

export default apiHandler<RyoReplyRequest>(
  {
    methods: ["POST"],
    auth: "required",
    parseJsonBody: true,
  },
  async ({ res, logger, startTime, user, body }) => {
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

    if (!body) {
      logger.warn("Invalid JSON body");
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }

    const { roomId, prompt, systemState } = body;

    try {
      assertValidRoomId(roomId, "ryo-reply");
    } catch (e) {
      logger.warn("Invalid room ID", {
        roomId,
        error: e instanceof Error ? e.message : "Invalid",
      });
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: e instanceof Error ? e.message : "Invalid room ID" });
      return;
    }

    if (!prompt || typeof prompt !== "string") {
      logger.warn("Missing prompt");
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Prompt is required" });
      return;
    }

    const exists = await roomExists(roomId);
    if (!exists) {
      logger.warn("Room not found", { roomId });
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "Room not found" });
      return;
    }

    const messages = [
      {
        role: "system" as const,
        content: ROOM_REPLY_STATIC_SYSTEM_PROMPT,
        ...PROMPT_CACHE_CONTROL_OPTIONS,
      },
      systemState?.chatRoomContext
        ? {
            role: "system" as const,
            content: buildChatRoomContextPrompt({
              roomId,
              recentMessages: systemState.chatRoomContext.recentMessages || "",
              mentionedMessage:
                systemState.chatRoomContext.mentionedMessage || prompt,
            }),
          }
        : null,
      { role: "user" as const, content: prompt },
    ].filter((m): m is NonNullable<typeof m> => m !== null);

    let replyText = "";
    try {
      logger.info("Generating AI reply", { roomId, promptLength: prompt.length });
      const { text } = await generateText({
        model: google("gemini-3-flash-preview"),
        messages,
        temperature: 0.6,
      });
      replyText = text;
      logger.info("AI reply generated", { replyLength: replyText.length });
    } catch (e) {
      logger.error("AI generation failed for Ryo reply", e);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to generate reply" });
      return;
    }

    const message: Message = {
      id: generateId(),
      roomId,
      username: "ryo",
      content: escapeHTML(filterProfanityPreservingUrls(replyText)),
      timestamp: getCurrentTimestamp(),
    };

    await addMessage(roomId, message);

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
