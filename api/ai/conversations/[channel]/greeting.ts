import { z } from "zod";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { waitUntil } from "../../../_utils/_background.js";
import { apiHandler } from "../../../_utils/api-handler.js";
import { loadRyoMemoryContext } from "../../../_utils/ryo-conversation.js";
import { PROACTIVE_GREETING_INSTRUCTIONS } from "../../../_utils/_aiPrompts.js";
import { getStoredUserTimeZone } from "../../../_utils/auth/_user-record.js";
import { buildUserLocalTimeContext } from "../../../_utils/user-time-context.js";
import { getUnprocessedDailyNotesExcludingToday } from "../../../_utils/_memory.js";
import {
  AIConversationError,
  appendAIConversationAssistantMessage,
  getAIConversationSummary,
  getAIProactiveGreetingEligibility,
  getOrCreateAIConversation,
} from "../_helpers/store.js";
import { broadcastAIConversationUpdate } from "../_helpers/realtime.js";
import {
  AI_CONVERSATION_OPERATION_ID_MAX_LENGTH,
  AI_PROACTIVE_GREETING_MESSAGE_ID_PREFIX,
} from "../../../../src/shared/contracts/aiConversation.js";

const greetingRequestSchema = z.object({
  operationId: z
    .string()
    .min(1)
    .max(AI_CONVERSATION_OPERATION_ID_MAX_LENGTH)
    .optional(),
});

/**
 * Server-owned proactive greeting for the Ryo chat thread. The client only
 * decides when a request is worth making; this endpoint re-validates against
 * the canonical conversation, generates the greeting, and persists it as a
 * real conversation message so it survives hydration and syncs across
 * devices. Greetings are exempt from the AI message rate limit — eligibility
 * (never twice in a row, never over an active thread) bounds them.
 */
export default apiHandler(
  {
    methods: ["POST"],
    auth: "required",
    bodySchema: greetingRequestSchema,
  },
  async ({ req, res, redis, logger, startTime, user, body }) => {
    const rawChannel = req.query.channel;
    const channel = Array.isArray(rawChannel) ? rawChannel[0] : rawChannel;
    // Proactive greetings exist only for the Ryo chat thread.
    if (channel !== "chat") {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "conversation_channel_not_found" });
      return;
    }
    const username = user!.username;
    const operationId = body?.operationId ?? crypto.randomUUID();

    const respondSkipped = (reason: string) => {
      logger.info(`Proactive greeting skipped: ${reason}`);
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ greeting: null, reason });
    };

    let conversation: Awaited<ReturnType<typeof getOrCreateAIConversation>>;
    try {
      conversation = await getOrCreateAIConversation({
        redis,
        username,
        channel: "chat",
      });
    } catch (error) {
      if (error instanceof AIConversationError) {
        respondSkipped(error.code);
        return;
      }
      throw error;
    }
    const eligibility = getAIProactiveGreetingEligibility(conversation);
    if (!eligibility.eligible) {
      respondSkipped(eligibility.reason);
      return;
    }

    const timeZone = (await getStoredUserTimeZone(redis, username)) ?? undefined;

    // Background: fold unprocessed past daily notes into long-term memory.
    // Greetings fire roughly once per session, making them a natural hook.
    waitUntil(
      getUnprocessedDailyNotesExcludingToday(redis, username, 7, timeZone)
        .then(async (unprocessedNotes) => {
          if (unprocessedNotes.length === 0) return;
          logger.info(
            `[DailyNotes] Processing ${unprocessedNotes.length} unprocessed daily notes for ${username}`
          );
          const { processDailyNotesForUser } = await import(
            "../../process-daily-notes.js"
          );
          await processDailyNotesForUser(
            redis,
            username,
            (...args: unknown[]) => logger.info(String(args[0]), args[1]),
            (...args: unknown[]) => logger.error(String(args[0]), args[1]),
            timeZone
          );
        })
        .catch((error) => {
          logger.error("[DailyNotes] Background processing failed", error);
        })
    );

    const memoryContext = await loadRyoMemoryContext({
      redis,
      username,
      timeZone,
      log: (...args: unknown[]) => logger.info(String(args[0]), args[1]),
      logError: (...args: unknown[]) => logger.error(String(args[0]), args[1]),
    });

    let greetingMemoryContext = "";
    if (
      memoryContext.userMemories &&
      memoryContext.userMemories.memories.length > 0
    ) {
      greetingMemoryContext += "## User's long-term memories:\n";
      for (const mem of memoryContext.userMemories.memories) {
        greetingMemoryContext += `- ${mem.key}: ${mem.summary}\n`;
      }
    }
    if (memoryContext.dailyNotesText) {
      greetingMemoryContext += `\n## Recent daily notes:\n${memoryContext.dailyNotesText}\n`;
    }
    // Without memories the client's generic greeting is just as good.
    if (!greetingMemoryContext) {
      respondSkipped("no memories available");
      return;
    }

    const now = new Date();
    const localTimeContext =
      buildUserLocalTimeContext(timeZone, now) ||
      buildUserLocalTimeContext("America/Los_Angeles", now);
    const timeContext = localTimeContext
      ? `${localTimeContext.dateString} ${localTimeContext.timeString} (${localTimeContext.timeZone})`
      : now.toISOString();

    try {
      const greetingDynamicContext = `It's ${timeContext}. The user's name is "${username}".

${greetingMemoryContext}

Generate ONE short proactive greeting. Pick one interesting angle from the context — a recent topic, a memory, something timely — and use it naturally. Don't try to cover everything.`;

      const { text } = await generateText({
        model: google("gemini-3-flash-preview"),
        temperature: 1,
        maxOutputTokens: 2000,
        instructions: [
          { role: "system" as const, content: PROACTIVE_GREETING_INSTRUCTIONS },
          { role: "system" as const, content: greetingDynamicContext },
        ],
        messages: [
          { role: "user" as const, content: "Generate a proactive greeting." },
        ],
      });

      const greeting = text.trim();
      if (!greeting) {
        respondSkipped("generation failed");
        return;
      }

      // Persist to the canonical conversation. The optimistic revision guard
      // makes sure a user message that raced the generation wins and the
      // greeting is dropped.
      const greetingMessage = {
        id: `${AI_PROACTIVE_GREETING_MESSAGE_ID_PREFIX}${crypto.randomUUID()}`,
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: greeting }],
        metadata: { createdAt: new Date().toISOString() },
      };
      let appended: Awaited<
        ReturnType<typeof appendAIConversationAssistantMessage>
      >;
      try {
        appended = await appendAIConversationAssistantMessage({
          redis,
          username,
          channel: "chat",
          operationId,
          message: greetingMessage,
          expectedConversationId: conversation.id,
          expectedRevision: conversation.revision,
        });
      } catch (persistError) {
        if (persistError instanceof AIConversationError) {
          respondSkipped(persistError.code);
          return;
        }
        throw persistError;
      }
      const storedGreeting = appended.document.messages.find(
        (message) => message.id === greetingMessage.id
      );
      if (!storedGreeting) {
        respondSkipped("persist_failed");
        return;
      }
      waitUntil(
        broadcastAIConversationUpdate({
          username,
          channel: "chat",
          conversationId: appended.document.id,
          revision: appended.document.revision,
          reason: "greeting",
          operationId,
        })
      );

      logger.response(200, Date.now() - startTime);
      res.status(200).json({
        greeting,
        message: storedGreeting,
        conversation: getAIConversationSummary(appended.document),
      });
    } catch (error) {
      logger.error("Failed to generate proactive greeting", error);
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ greeting: null, reason: "generation failed" });
    }
  }
);
