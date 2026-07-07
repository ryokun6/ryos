import { z } from "zod";
import { waitUntil } from "@vercel/functions";
import { apiHandler } from "../../../_utils/api-handler.js";
import { getStoredUserRecord } from "../../../_utils/auth/_user-record.js";
import {
  AIConversationError,
  getAIConversationSummary,
  resetAIConversation,
} from "../_helpers/store.js";
import { processClearedAIConversationMemory } from "../_helpers/reset-memory.js";
import { broadcastAIConversationUpdate } from "../_helpers/realtime.js";
import { cleanupStaleAIAttachments } from "../../attachments/_helpers/store.js";
import {
  AI_CONVERSATION_OPERATION_ID_MAX_LENGTH,
  isAIConversationChannel,
} from "../../../../src/shared/contracts/aiConversation.js";

export const runtime = "nodejs";
export const maxDuration = 60;

const resetConversationSchema = z.object({
  conversationId: z.string().uuid(),
  operationId: z.string().min(1).max(AI_CONVERSATION_OPERATION_ID_MAX_LENGTH),
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
    const account = await getStoredUserRecord(redis, user!.username);

    try {
      const result = await resetAIConversation({
        redis,
        username: user!.username,
        channel,
        conversationId: body!.conversationId,
        operationId: body!.operationId,
      });
      if (result.reset) {
        waitUntil(
          processClearedAIConversationMemory({
            redis,
            username: user!.username,
            messages: result.clearedMessages,
            operationId: body!.operationId,
            ...(account?.timeZone ? { timeZone: account.timeZone } : {}),
            log: (...args: unknown[]) => logger.info(String(args[0]), args[1]),
            logError: (...args: unknown[]) =>
              logger.error(String(args[0]), args[1]),
          }).catch((error) => {
            logger.error("Cleared conversation memory extraction failed", error);
          }),
        );
        // Attachments referenced only by the cleared thread become
        // unreferenced; sweep the ones already past the orphan grace period.
        waitUntil(
          cleanupStaleAIAttachments({
            redis,
            username: user!.username,
          }).catch((error) => {
            logger.error("Post-reset attachment sweep failed", error);
          }),
        );
        waitUntil(
          broadcastAIConversationUpdate({
            username: user!.username,
            channel,
            conversationId: result.document.id,
            revision: result.document.revision,
            reason: "reset",
            operationId: body!.operationId,
          })
        );
      }
      logger.response(200, Date.now() - startTime);
      res.status(200).json({
        owner: user!.username,
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
  },
);
