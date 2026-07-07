import { z } from "zod";
import { apiHandler } from "../../../_utils/api-handler.js";
import {
  AIConversationError,
  getAIConversationSummary,
  importAIConversationMessages,
} from "../_helpers/store.js";
import {
  AI_CONVERSATION_OPERATION_ID_MAX_LENGTH,
  isAIConversationChannel,
} from "../../../../src/shared/contracts/aiConversation.js";
import { broadcastAIConversationRealtimeEvent } from "../_helpers/realtime.js";

export const runtime = "nodejs";
export const maxDuration = 10;

const importConversationSchema = z.object({
  conversationId: z.string().uuid(),
  expectedRevision: z.literal(0),
  operationId: z
    .string()
    .min(1)
    .max(AI_CONVERSATION_OPERATION_ID_MAX_LENGTH),
  messages: z.array(z.unknown()).min(1).max(200),
  historyTruncated: z.boolean().optional().default(false),
});

export default apiHandler(
  {
    methods: ["POST"],
    auth: "required",
    bodySchema: importConversationSchema,
  },
  async ({ req, res, redis, logger, startTime, user, body }) => {
    const rawChannel = req.query.channel;
    const channel = Array.isArray(rawChannel) ? rawChannel[0] : rawChannel;
    if (!isAIConversationChannel(channel)) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "conversation_channel_not_found" });
      return;
    }

    try {
      const document = await importAIConversationMessages({
        redis,
        username: user!.username,
        channel,
        expectedConversationId: body!.conversationId,
        expectedRevision: body!.expectedRevision,
        operationId: body!.operationId,
        messages: body!.messages,
        historyTruncated: body!.historyTruncated,
      });
      await broadcastAIConversationRealtimeEvent(user!.username, {
        kind: "conversation-updated",
        reason: "imported",
        channel,
        conversationId: document.id,
        revision: document.revision,
        operationId: body!.operationId,
      }).catch((error) => {
        logger.error("Failed to broadcast conversation import", error);
      });
      logger.response(201, Date.now() - startTime);
      res.status(201).json({
        owner: user!.username,
        conversation: getAIConversationSummary(document),
        imported: document.messages.length,
      });
    } catch (error) {
      if (error instanceof AIConversationError) {
        logger.response(error.status, Date.now() - startTime);
        res.status(error.status).json({ error: error.code });
        return;
      }
      throw error;
    }
  }
);
