import { apiHandler } from "../../../_utils/api-handler.js";
import {
  AIConversationError,
  getAIConversationPage,
} from "../_helpers/store.js";
import { isAIConversationChannel } from "../../../../src/shared/contracts/aiConversation.js";

export const runtime = "nodejs";
export const maxDuration = 10;

export default apiHandler(
  {
    methods: ["GET"],
    auth: "required",
  },
  async ({ req, res, redis, logger, startTime, user }) => {
    const rawChannel = req.query.channel;
    const channel = Array.isArray(rawChannel) ? rawChannel[0] : rawChannel;
    if (!isAIConversationChannel(channel)) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "conversation_channel_not_found" });
      return;
    }

    const rawLimit = Array.isArray(req.query.limit)
      ? req.query.limit[0]
      : req.query.limit;
    const limit = rawLimit === undefined ? 50 : Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "invalid_limit" });
      return;
    }
    const rawCursor = Array.isArray(req.query.cursor)
      ? req.query.cursor[0]
      : req.query.cursor;

    try {
      const page = await getAIConversationPage({
        redis,
        username: user!.username,
        channel,
        limit,
        ...(rawCursor ? { cursor: rawCursor } : {}),
      });
      res.setHeader("Cache-Control", "no-store");
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ owner: user!.username, ...page });
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
