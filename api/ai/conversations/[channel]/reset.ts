import { z } from "zod";
import { apiHandler } from "../../../_utils/api-handler.js";
import {
  AIConversationError,
  getAIConversationSummary,
  resetAIConversation,
} from "../_helpers/store.js";
import { isAIConversationChannel } from "../../../../src/shared/contracts/aiConversation.js";

export const runtime = "nodejs";
export const maxDuration = 10;

const resetConversationSchema = z.object({
  conversationId: z.string().uuid(),
  operationId: z.string().min(1).max(160),
});

export default apiHandler(
  {
    methods: ["POST"],
    auth: "required",
    bodySchema: resetConversationSchema,
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
      const result = await resetAIConversation({
        redis,
        username: user!.username,
        channel,
        conversationId: body!.conversationId,
        operationId: body!.operationId,
      });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({
        conversation: getAIConversationSummary(result.document),
        reset: result.reset,
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
