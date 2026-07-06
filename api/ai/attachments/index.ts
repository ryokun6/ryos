import { apiHandler } from "../../_utils/api-handler.js";
import {
  readRequestBodyBuffer,
  RequestBodyTooLargeError,
} from "../../_utils/request-body.js";
import { getStoredUserRecord } from "../../_utils/auth/_user-record.js";
import { createAIAttachment } from "./_helpers/store.js";
import {
  AI_ATTACHMENT_MAX_BYTES,
  isAIAttachmentMediaType,
} from "../../../src/shared/contracts/aiAttachment.js";

export const runtime = "nodejs";
export const maxDuration = 30;
export const config = { api: { bodyParser: false } };

export default apiHandler(
  {
    methods: ["POST"],
    auth: "required",
    contentType: null,
  },
  async ({ req, res, redis, user, logger, startTime }) => {
    const contentTypeHeader = req.headers["content-type"];
    const mediaType =
      typeof contentTypeHeader === "string"
        ? contentTypeHeader.split(";")[0]?.trim().toLowerCase()
        : null;
    if (!isAIAttachmentMediaType(mediaType)) {
      logger.response(415, Date.now() - startTime);
      res.status(415).json({ error: "unsupported_image_type" });
      return;
    }

    const account = await getStoredUserRecord(redis, user!.username);
    if (typeof account?.createdAt !== "number") {
      logger.response(409, Date.now() - startTime);
      res.status(409).json({ error: "account_changed" });
      return;
    }

    try {
      const attachment = await createAIAttachment({
        redis,
        username: user!.username,
        accountCreatedAt: account.createdAt,
        mediaType,
        bytes: await readRequestBodyBuffer(req, AI_ATTACHMENT_MAX_BYTES),
      });
      logger.response(201, Date.now() - startTime);
      res.status(201).json(attachment);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        logger.response(413, Date.now() - startTime);
        res.status(413).json({ error: "image_too_large" });
        return;
      }
      if (
        error instanceof Error &&
        error.message === "attachment_quota_exceeded"
      ) {
        logger.response(429, Date.now() - startTime);
        res.status(429).json({ error: error.message });
        return;
      }
      if (error instanceof Error && error.message === "account_changed") {
        logger.response(409, Date.now() - startTime);
        res.status(409).json({ error: error.message });
        return;
      }
      if (error instanceof Error && error.message === "attachment_busy") {
        logger.response(503, Date.now() - startTime);
        res.status(503).json({ error: error.message });
        return;
      }
      if (error instanceof Error && error.message === "invalid_image") {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  }
);
