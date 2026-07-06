import { apiHandler } from "../../_utils/api-handler.js";
import { makeKey } from "../../_utils/_rate-limit-key.js";
import {
  readRequestBodyBuffer,
  RequestBodyTooLargeError,
} from "../../_utils/request-body.js";
import {
  AI_ATTACHMENT_MAX_BYTES,
  getAIAttachmentUrl,
  isAIAttachmentMediaType,
} from "../../../src/shared/contracts/aiAttachment.js";
import { createAIAttachment } from "./_helpers/store.js";

export const runtime = "nodejs";
export const maxDuration = 30;

export const config = {
  api: {
    bodyParser: false,
  },
};

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 15;
const INCREMENT_RATE_LIMIT_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return count
`;

export default apiHandler(
  {
    methods: ["POST"],
    auth: "required",
    contentType: null,
  },
  async ({ req, res, redis, user, logger, startTime }) => {
    const username = user!.username;
    const contentTypeHeader = req.headers["content-type"];
    const mediaType = (
      Array.isArray(contentTypeHeader)
        ? contentTypeHeader[0]
        : contentTypeHeader
    )
      ?.split(";")[0]
      ?.trim()
      .toLowerCase();
    if (!isAIAttachmentMediaType(mediaType)) {
      logger.response(415, Date.now() - startTime);
      res.status(415).json({ error: "attachment_media_type_unsupported" });
      return;
    }

    const contentLengthHeader = req.headers["content-length"];
    const contentLength = Number.parseInt(
      Array.isArray(contentLengthHeader)
        ? contentLengthHeader[0] ?? ""
        : contentLengthHeader ?? "",
      10
    );
    if (
      Number.isFinite(contentLength) &&
      (contentLength <= 0 || contentLength > AI_ATTACHMENT_MAX_BYTES)
    ) {
      logger.response(413, Date.now() - startTime);
      res.status(413).json({ error: "attachment_too_large" });
      return;
    }

    const rawFilename = Array.isArray(req.query.filename)
      ? req.query.filename[0]
      : req.query.filename;
    const filename =
      typeof rawFilename === "string" && rawFilename.trim()
        ? rawFilename.trim().slice(0, 160)
        : undefined;

    const rateLimitKey = makeKey([
      "rl",
      "ai-attachment",
      "user",
      username,
    ]);
    const requestCount = await redis.eval<number>(
      INCREMENT_RATE_LIMIT_SCRIPT,
      [rateLimitKey],
      [RATE_LIMIT_WINDOW_SECONDS]
    );
    if (requestCount > RATE_LIMIT_MAX) {
      logger.response(429, Date.now() - startTime);
      res.status(429).json({ error: "attachment_rate_limit_exceeded" });
      return;
    }

    try {
      const bytes = await readRequestBodyBuffer(
        req,
        AI_ATTACHMENT_MAX_BYTES
      );
      const record = await createAIAttachment({
        redis,
        username,
        mediaType,
        bytes,
        ...(filename ? { filename } : {}),
      });
      logger.response(201, Date.now() - startTime);
      res.status(201).json({
        attachmentId: record.id,
        mediaType: record.mediaType,
        size: record.size,
        url: getAIAttachmentUrl(record.id),
      });
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        logger.response(413, Date.now() - startTime);
        res.status(413).json({ error: "attachment_too_large" });
        return;
      }
      const code =
        error instanceof Error ? error.message : "attachment_upload_failed";
      if (code === "attachment_upload_invalid") {
        logger.response(422, Date.now() - startTime);
        res.status(422).json({ error: code });
        return;
      }
      if (code === "account_deleted") {
        logger.response(409, Date.now() - startTime);
        res.status(409).json({ error: code });
        return;
      }
      if (code === "attachment_quota_exceeded") {
        logger.response(429, Date.now() - startTime);
        res.status(429).json({ error: code });
        return;
      }
      throw error;
    }
  }
);
