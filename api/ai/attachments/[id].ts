import { apiHandler } from "../../_utils/api-handler.js";
import { readAIAttachment } from "./_helpers/store.js";
import {
  getAIAttachmentUrl,
  parseAIAttachmentName,
} from "../../../src/shared/contracts/aiAttachment.js";

export const runtime = "nodejs";
export const maxDuration = 30;

export default apiHandler(
  {
    methods: ["GET"],
    auth: "required",
  },
  async ({ req, res, user, logger, startTime }) => {
    const rawId = req.query.id;
    const name = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!parseAIAttachmentName(name)) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "attachment_not_found" });
      return;
    }

    try {
      const attachment = await readAIAttachment({
        username: user!.username,
        url: getAIAttachmentUrl(name),
      });
      res.setHeader("Content-Type", attachment.mediaType);
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      res.setHeader("X-Content-Type-Options", "nosniff");
      logger.response(200, Date.now() - startTime);
      res.status(200).send(Buffer.from(attachment.bytes));
    } catch {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "attachment_not_found" });
    }
  }
);
