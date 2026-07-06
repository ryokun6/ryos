import { z } from "zod";
import { waitUntil } from "@vercel/functions";
import { apiHandler } from "../../../_utils/api-handler.js";
import { getStoredUserTimeZone } from "../../../_utils/auth/_user-record.js";
import { extractMemoriesFromConversation } from "../../extract-memories.js";
import {
  AIConversationError,
  getAIConversationSummary,
  resetAIConversation,
} from "../_helpers/store.js";
import {
  collectAIAttachmentIds,
  deleteAIAttachments,
} from "../../attachments/_helpers/store.js";
import { isAIConversationChannel } from "../../../../src/shared/contracts/aiConversation.js";

export const runtime = "nodejs";
export const maxDuration = 60;

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
      if (result.reset) {
        const backgroundTasks: Promise<unknown>[] = [];
        if (
          result.clearedMessages.some((message) => message.role === "user")
        ) {
          backgroundTasks.push(
            getStoredUserTimeZone(redis, user!.username)
              .then((timeZone) =>
                extractMemoriesFromConversation({
                  redis,
                  username: user!.username,
                  messages: result.clearedMessages.map((message) => ({
                    role: message.role,
                    parts: message.parts,
                    metadata: { createdAt: message.createdAt },
                  })),
                  timeZone: timeZone ?? undefined,
                  storeLongTermMemories: true,
                  markTodayProcessed: true,
                  log: (...args: unknown[]) =>
                    logger.info(String(args[0]), args[1]),
                  logError: (...args: unknown[]) =>
                    logger.error(String(args[0]), args[1]),
                })
              )
              .catch((error) => {
                logger.error(
                  "Cleared conversation memory extraction failed",
                  error
                );
              })
          );
        }
        const attachmentIds = collectAIAttachmentIds(
          result.clearedMessages
        );
        if (attachmentIds.length > 0) {
          backgroundTasks.push(
            deleteAIAttachments({
              redis,
              username: user!.username,
              attachmentIds,
            }).catch((error) => {
              logger.error(
                "Cleared conversation attachment cleanup failed",
                error
              );
            })
          );
        }
        if (backgroundTasks.length > 0) {
          waitUntil(Promise.all(backgroundTasks));
        }
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
  }
);
