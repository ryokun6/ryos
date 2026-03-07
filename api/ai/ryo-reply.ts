/**
 * POST /api/ai/ryo-reply
 * 
 * Generate an AI reply as Ryo in chat rooms
 */

import { assertValidRoomId, escapeHTML, filterProfanityPreservingUrls } from "../_utils/_validation.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { roomExists, addMessage, generateId, getCurrentTimestamp } from "../rooms/_helpers/_redis.js";
import { broadcastNewMessage } from "../rooms/_helpers/_pusher.js";
import type { Message } from "../rooms/_helpers/_types.js";
import { apiHandler } from "../_utils/api-handler.js";
import { generateRyoDirectReply } from "../_utils/ryo-direct-chat.js";

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

    let replyText = "";
    try {
      logger.info("Generating AI reply", { roomId, promptLength: prompt.length });
      replyText = await generateRyoDirectReply({
        prompt,
        contextSections: [
          `<chat_instructions>
you're chatting in public rooms in ryOS Chats app. keep responses 1-2 sentences unless asked to elaborate.
respond in the user's language. comment on the recent conversation and mentioned message.
when user asks for an aquarium, fish tank, fishes, or sam's aquarium, include the special token [[AQUARIUM]] in your response.
</chat_instructions>`,
          systemState?.chatRoomContext
            ? `<chat_room_context>
roomId: ${roomId}
recentMessages:
${systemState.chatRoomContext.recentMessages || ""}
mentionedMessage: ${systemState.chatRoomContext.mentionedMessage || prompt}
</chat_room_context>`
            : "",
        ],
      });
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
