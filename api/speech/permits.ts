import { z } from "zod";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import { apiHandler } from "../_utils/api-handler.js";
import { mintSpeechPermit } from "../_utils/speech-permit-store.js";
import {
  SPEECH_PERMIT_MESSAGE_ID_MAX_LENGTH,
  SPEECH_PERMIT_TEXT_MAX_LENGTH,
  resolveSpeechOwner,
} from "../_utils/speech-permit.js";

const bodySchema = z.object({
  messageId: z.string().min(1).max(SPEECH_PERMIT_MESSAGE_ID_MAX_LENGTH),
  text: z.string().min(1).max(SPEECH_PERMIT_TEXT_MAX_LENGTH),
  source: z.string().min(1).max(64),
  contentHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional(),
});

export default apiHandler(
  {
    methods: ["POST"],
    auth: "optional",
    bodySchema,
  },
  async ({ req, res, redis, logger, startTime, body, user }) => {
    const username = user?.username ?? null;
    const isAuthenticated = !!user;
    const isAuthenticatedRyo = isAuthenticated && username === "ryo";
    const ip = getClientIp(req);
    const owner = resolveSpeechOwner({ username, ip });

    try {
      if (!isAuthenticatedRyo) {
        const rateLimitIdentifier = isAuthenticated && username ? username : `anon:${ip}`;
        const burst = await RateLimit.checkCounterLimit({
          key: RateLimit.makeKey(["rl", "tts-permit", "burst", rateLimitIdentifier]),
          windowSeconds: 60,
          limit: 30,
        });
        if (!burst.allowed) {
          logger.response(429, Date.now() - startTime);
          res.setHeader("Retry-After", String(burst.resetSeconds ?? 60));
          res.status(429).json({
            error: "rate_limit_exceeded",
            scope: "burst",
            limit: burst.limit,
            windowSeconds: burst.windowSeconds,
            resetSeconds: burst.resetSeconds,
          });
          return;
        }
      }
    } catch (error) {
      logger.error("Rate limit check failed (speech permit)", error);
      logger.response(503, Date.now() - startTime);
      res.status(503).json({ error: "rate_limit_unavailable" });
      return;
    }

    const result = await mintSpeechPermit({
      redis,
      owner,
      messageId: body.messageId,
      text: body.text,
      source: body.source,
      contentHash: body.contentHash,
    });

    if (!result.ok) {
      logger.warn("Rejected speech permit mint", {
        error: result.error,
        ownerKind: owner.startsWith("user:") ? "user" : "anon",
        messageId: body.messageId,
        username,
      });
      logger.response(result.status, Date.now() - startTime);
      res.status(result.status).json({
        error: result.error,
        message: result.message,
      });
      return;
    }

    logger.info("Issued speech permit", {
      messageId: result.messageId,
      expiresInSeconds: result.expiresInSeconds,
      username,
    });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({
      permitId: result.permitId,
      contentHash: result.contentHash,
      expiresInSeconds: result.expiresInSeconds,
      messageId: result.messageId,
    });
  }
);
