import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiHandler } from "../_utils/api-handler.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getTelegramModel } from "../_utils/_aiModels.js";
import {
  prepareRyoConversationModelInput,
  type SimpleConversationMessage,
} from "../_utils/ryo-conversation.js";
import {
  createRyoToolLoopAgent,
  RYO_AGENT_TIMEOUTS,
  textStreamFromFullStream,
} from "../_utils/ryo-agent.js";
import {
  appendDeviceConversationMessage,
  clearDeviceConversationHistory,
  loadDeviceConversationHistory,
} from "../_utils/device-conversation.js";
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

function toolResultMessage(output: unknown): { message: string; success: boolean } | null {
  if (!output || typeof output !== "object" || !("message" in output)) return null;
  const message = (output as { message?: unknown }).message;
  if (typeof message !== "string" || message.trim().length === 0) return null;
  const success = (output as { success?: unknown }).success;
  return { message: message.trim(), success: success !== false };
}

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

    if (username !== "ryo") {
      try {
        const burst = await RateLimit.checkCounterLimit({
          key: RateLimit.makeKey(["rl", "device", "user", username]),
          windowSeconds: 5 * 60,
          limit: 20,
          redis,
        });
        if (!burst.allowed) {
          logger.response(429, Date.now() - startTime);
          res.status(429).json({
            error: "rate_limit_exceeded",
            text: "slow down a second.",
            limit: burst.limit,
            resetSeconds: burst.resetSeconds,
          });
          return;
        }
      } catch (error) {
        logger.error("Rate limit check failed (device)", error);
        logger.response(503, Date.now() - startTime);
        res.status(503).json({ error: "rate_limit_unavailable" });
        return;
      }
    }

    const text = body.text ?? "";
    const history = await loadDeviceConversationHistory(redis, username);
    const messages: SimpleConversationMessage[] = [
      ...history.map((message, index) => ({
        id: `history-${index}`,
        role: message.role,
        content: message.content,
      })),
      { id: `device-${randomUUID()}`, role: "user", content: text },
    ];

    const model = getTelegramModel((message, ...rest) =>
      logger.info(String(message), rest.length > 0 ? rest : undefined)
    );
    const prepared = await prepareRyoConversationModelInput({
      channel: "device",
      messages,
      username,
      redis,
      model,
      log: (...args: unknown[]) => logger.info(`[Device:${username}]`, args),
      logError: (...args: unknown[]) => logger.error(`[Device:${username}]`, args),
    });

    let lastToolMessage = "";
    const agent = createRyoToolLoopAgent({
      preset: "telegram",
      prepared,
    });
    const result = await agent.stream({
      messages: prepared.enrichedMessages,
      timeout: RYO_AGENT_TIMEOUTS.telegram,
    });
    let replyText = "";
    const textStream = textStreamFromFullStream(result.stream, (chunk) => {
      if (chunk.type !== "tool-result") return;
      const toolMessage = toolResultMessage((chunk as { output?: unknown }).output);
      if (toolMessage?.success) lastToolMessage = toolMessage.message;
    });
    for await (const chunk of textStream) {
      replyText += chunk;
    }
    replyText = replyText.trim() || lastToolMessage || "done.";

    const now = Date.now();
    const messageId = `device-${randomUUID()}`;
    await appendDeviceConversationMessage(redis, username, {
      role: "user",
      content: text,
      createdAt: now,
    });
    await appendDeviceConversationMessage(redis, username, {
      role: "assistant",
      content: replyText,
      createdAt: now + 1,
    });
    await upsertSpeechDraft({
      redis,
      owner: resolveSpeechOwner({ username, ip: getClientIp(req) }),
      messageId,
      text: replyText,
      now,
    });

    logger.response(200, Date.now() - startTime);
    res.status(200).json({
      username,
      messageId,
      text: replyText,
    });
  }
);
