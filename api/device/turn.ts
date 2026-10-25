import { z } from "zod";
import { apiHandler } from "../_utils/api-handler.js";
import { clearDeviceConversationHistory } from "../_utils/device-conversation.js";
import { checkDeviceTurnLimit, runDeviceTurn } from "../_utils/device-turn.js";
import { upsertSpeechDraft } from "../_utils/speech-permit-store.js";
import { resolveSpeechOwner } from "../_utils/speech-permit.js";
import { getClientIp } from "../_utils/_rate-limit.js";

const bodySchema = z
  .object({
    text: z.string().trim().min(1).max(4000).optional(),
    reset: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.reset && !value.text) {
      ctx.addIssue({
        code: "custom",
        message: "text is required",
        path: ["text"],
      });
    }
  });

export default apiHandler(
  {
    methods: ["POST"],
    auth: "required",
    allowMissingOrigin: true,
    bodySchema,
  },
  async ({ req, res, redis, logger, startTime, body, user }) => {
    const username = user?.username;
    if (!username) {
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (body.reset) {
      await clearDeviceConversationHistory(redis, username);
      if (!body.text) {
        logger.response(200, Date.now() - startTime);
        res.status(200).json({ reset: true, username, text: "" });
        return;
      }
    }

    try {
      const limit = await checkDeviceTurnLimit(redis, username);
      if (!limit.allowed) {
        logger.response(429, Date.now() - startTime);
        res.status(429).json({
          error: "rate_limit_exceeded",
          text: "slow down a second.",
          limit: limit.limit,
          resetSeconds: limit.resetSeconds,
        });
        return;
      }
    } catch (error) {
      logger.error("Rate limit check failed (device)", error);
      logger.response(503, Date.now() - startTime);
      res.status(503).json({ error: "rate_limit_unavailable" });
      return;
    }

    const turn = await runDeviceTurn({
      redis,
      username,
      text: body.text ?? "",
      log: (message, data) => logger.info(String(message), data),
      logError: (message, data) => logger.error(String(message), data),
    });
    await upsertSpeechDraft({
      redis,
      owner: resolveSpeechOwner({ username, ip: getClientIp(req) }),
      messageId: turn.messageId,
      text: turn.text,
      now: Date.now(),
    });

    logger.response(200, Date.now() - startTime);
    res.status(200).json({
      username,
      messageId: turn.messageId,
      text: turn.text,
    });
  }
);
