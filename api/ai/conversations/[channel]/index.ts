import { apiHandler } from "../../../_utils/api-handler.js";
import {
  AIConversationError,
  getAIConversationSnapshot,
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

    // Delta reads: `afterSeq` returns only messages with a greater `seq`.
    // Content updates re-mint `seq`, so in-place assistant updates are
    // included; clients verify the returned summary to detect structural
    // changes (reset / regeneration / trim) and fall back to a full read.
    const rawAfterSeq = Array.isArray(req.query.afterSeq)
      ? req.query.afterSeq[0]
      : req.query.afterSeq;
    let afterSeq: number | undefined;
    if (rawAfterSeq !== undefined) {
      afterSeq = Number(rawAfterSeq);
      if (!Number.isSafeInteger(afterSeq) || afterSeq < 0) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "invalid_after_seq" });
        return;
      }
    }

    try {
      const snapshot = await getAIConversationSnapshot({
        redis,
        username: user!.username,
        channel,
        ...(afterSeq === undefined ? {} : { afterSeq }),
      });
      res.setHeader("Cache-Control", "no-store");
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ owner: user!.username, ...snapshot });
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
