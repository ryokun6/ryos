import { apiHandler } from "../../_utils/api-handler.js";
import { createSignedDownloadUrl } from "../../_utils/storage.js";
import { isAIAttachmentId } from "../../../src/shared/contracts/aiAttachment.js";
import { getAIAttachmentRecord } from "./_helpers/store.js";

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

    const record = await getAIAttachmentRecord({
      redis,
      username: user!.username,
      attachmentId,
    });
    if (!record) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "attachment_not_found" });
      return;
    }

    const downloadUrl = await createSignedDownloadUrl(record.storageUrl);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Location", downloadUrl);
    logger.response(302, Date.now() - startTime);
    res.status(302).end();
  }
);
