import { apiHandler } from "../../_utils/api-handler.js";
import {
  checkCounterLimit,
  makeKey,
} from "../../_utils/_rate-limit.js";
import { isAIAttachmentId } from "../../../src/shared/contracts/aiAttachment.js";
import { getAIAttachmentContent } from "./_helpers/store.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default apiHandler(
  {
    methods: ["GET"],
    auth: "required",
    contentType: null,
  },
  async ({ req, res, redis, user, logger, startTime }) => {
    const rawId = req.query.id;
    const attachmentId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!isAIAttachmentId(attachmentId)) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "attachment_not_found" });
      return;
    }
    const rateLimit = await checkCounterLimit({
      key: makeKey([
        "rl",
        "ai-attachment-download",
        "user",
        user!.username,
      ]),
      windowSeconds: 60,
      limit: 120,
      redis,
    });
    if (!rateLimit.allowed) {
      res.setHeader("Retry-After", String(rateLimit.resetSeconds));
      logger.response(429, Date.now() - startTime);
      res.status(429).json({ error: "attachment_rate_limit_exceeded" });
      return;
    }

    let attachment: Awaited<ReturnType<typeof getAIAttachmentContent>>;
    try {
      attachment = await getAIAttachmentContent({
        redis,
        username: user!.username,
        attachmentId,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "attachment_storage_invalid"
      ) {
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "attachment_not_found" });
        return;
      }
      throw error;
    }
    if (!attachment) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "attachment_not_found" });
      return;
    }

    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", attachment.record.mediaType);
    res.setHeader("Content-Length", String(attachment.bytes.byteLength));
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (attachment.record.filename) {
      res.setHeader(
        "Content-Disposition",
        `inline; filename*=UTF-8''${encodeURIComponent(
          attachment.record.filename
        )}`
      );
    }
    logger.response(200, Date.now() - startTime);
    res.status(200).send(Buffer.from(attachment.bytes));
  }
);
