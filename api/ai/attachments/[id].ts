import { apiHandler } from "../../_utils/api-handler.js";
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

    const attachment = await getAIAttachmentContent({
      redis,
      username: user!.username,
      attachmentId,
    });
    if (!attachment) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "attachment_not_found" });
      return;
    }

    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", attachment.record.mediaType);
    res.setHeader("Content-Length", String(attachment.bytes.byteLength));
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
