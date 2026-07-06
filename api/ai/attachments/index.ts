import { z } from "zod";
import { apiHandler } from "../../_utils/api-handler.js";
import { makeKey } from "../../_utils/_rate-limit-key.js";
import {
  AI_ATTACHMENT_MAX_BYTES,
  AI_ATTACHMENT_MEDIA_TYPES,
  getAIAttachmentUrl,
} from "../../../src/shared/contracts/aiAttachment.js";
import {
  completeAIAttachmentUpload,
  prepareAIAttachmentUpload,
} from "./_helpers/store.js";

export const runtime = "nodejs";
export const maxDuration = 30;

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 30;

const attachmentRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("prepare"),
    mediaType: z.enum(AI_ATTACHMENT_MEDIA_TYPES),
    size: z.number().int().positive().max(AI_ATTACHMENT_MAX_BYTES),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    filename: z.string().min(1).max(160).optional(),
  }),
  z.object({
    action: z.literal("complete"),
    attachmentId: z.string().uuid(),
    storageUrl: z.string().min(1).max(2_048),
  }),
]);

export default apiHandler(
  {
    methods: ["POST"],
    auth: "required",
    bodySchema: attachmentRequestSchema,
  },
  async ({ res, redis, user, body, logger, startTime }) => {
    const username = user!.username;
    const rateLimitKey = makeKey([
      "rl",
      "ai-attachment",
      "user",
      username,
    ]);
    const requestCount = await redis.incr(rateLimitKey);
    if (requestCount === 1) {
      await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW_SECONDS);
    }
    if (requestCount > RATE_LIMIT_MAX) {
      logger.response(429, Date.now() - startTime);
      res
        .status(429)
        .json({ error: "attachment_rate_limit_exceeded" });
      return;
    }

    try {
      if (body!.action === "prepare") {
        const prepared = await prepareAIAttachmentUpload({
          redis,
          username,
          mediaType: body!.mediaType,
          size: body!.size,
          sha256: body!.sha256,
          ...(body!.filename ? { filename: body!.filename } : {}),
        });
        logger.response(200, Date.now() - startTime);
        res.status(200).json({
          attachmentId: prepared.attachmentId,
          upload: prepared.upload,
        });
        return;
      }

      const record = await completeAIAttachmentUpload({
        redis,
        username,
        attachmentId: body!.attachmentId,
        storageUrl: body!.storageUrl,
      });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({
        attachmentId: record.id,
        mediaType: record.mediaType,
        size: record.size,
        url: getAIAttachmentUrl(record.id),
      });
    } catch (error) {
      const code =
        error instanceof Error ? error.message : "attachment_upload_failed";
      if (
        code === "attachment_upload_not_pending" ||
        code === "attachment_storage_url_mismatch" ||
        code === "attachment_upload_invalid"
      ) {
        logger.response(422, Date.now() - startTime);
        res.status(422).json({ error: code });
        return;
      }
      throw error;
    }
  }
);
