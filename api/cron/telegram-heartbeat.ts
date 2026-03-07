import type { VercelRequest, VercelResponse } from "@vercel/node";
import { stepCountIs, streamText } from "ai";
import { initLogger } from "../_utils/_logging.js";
import createRedis from "../_utils/redis.js";
import {
  appendTelegramConversationMessage,
  getLinkedTelegramAccountByUsername,
  loadTelegramConversationHistory,
} from "../_utils/telegram-link.js";
import { sendTelegramMessage } from "../_utils/telegram.js";
import { simplifyTelegramCitationDisplay } from "../_utils/telegram-format.js";
import {
  buildTelegramHeartbeatPrompt,
  buildTelegramHeartbeatRedisKey,
  TELEGRAM_HEARTBEAT_SLOT_TTL_SECONDS,
  TELEGRAM_HEARTBEAT_TARGET_USERNAME,
} from "../_utils/telegram-heartbeat.js";
import {
  prepareRyoConversationModelInput,
  type SimpleConversationMessage,
} from "../_utils/ryo-conversation.js";
import {
  DEFAULT_MODEL,
  SUPPORTED_AI_MODELS,
  type SupportedModel,
} from "../_utils/_aiModels.js";

export const runtime = "nodejs";
export const maxDuration = 80;

function setResponseHeaders(res: VercelResponse): void {
  res.setHeader("Content-Type", "application/json");
}

function sendJson(
  res: VercelResponse,
  status: number,
  payload: Record<string, unknown>
): void {
  res.status(status).json(payload);
}

function getHeader(req: VercelRequest, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return typeof value === "string" ? value : null;
}

function getTelegramModel(
  log: (...args: unknown[]) => void
): SupportedModel {
  const raw = process.env.TELEGRAM_BOT_MODEL as SupportedModel | undefined;
  if (raw && SUPPORTED_AI_MODELS.includes(raw)) {
    return raw;
  }
  if (raw) {
    log(`Unsupported TELEGRAM_BOT_MODEL "${raw}", falling back to ${DEFAULT_MODEL}`);
  }
  return DEFAULT_MODEL;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();

  setResponseHeaders(res);
  logger.request(req.method || "GET", req.url || "/api/cron/telegram-heartbeat");

  if (req.method === "OPTIONS") {
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  if ((req.method || "GET").toUpperCase() !== "GET") {
    logger.response(405, Date.now() - startTime);
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.warn("CRON_SECRET is not configured");
    logger.response(503, Date.now() - startTime);
    sendJson(res, 503, { error: "Cron secret is not configured" });
    return;
  }

  if (getHeader(req, "authorization") !== `Bearer ${cronSecret}`) {
    logger.warn("Rejected telegram heartbeat cron due to invalid secret");
    logger.response(401, Date.now() - startTime);
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    logger.warn("Telegram bot token is not configured");
    logger.response(503, Date.now() - startTime);
    sendJson(res, 503, { error: "Telegram bot is not configured" });
    return;
  }

  const redis = createRedis();
  const username = TELEGRAM_HEARTBEAT_TARGET_USERNAME;
  const linkedAccount = await getLinkedTelegramAccountByUsername(redis, username);

  if (!linkedAccount) {
    logger.info("Skipping telegram heartbeat because user is not linked", { username });
    logger.response(200, Date.now() - startTime);
    sendJson(res, 200, { success: true, sent: false, reason: "not-linked", username });
    return;
  }

  const slotKey = buildTelegramHeartbeatRedisKey(username);
  if ((await redis.exists(slotKey)) > 0) {
    logger.info("Skipping duplicate telegram heartbeat for current slot", {
      username,
      slotKey,
    });
    logger.response(200, Date.now() - startTime);
    sendJson(res, 200, {
      success: true,
      sent: false,
      reason: "already-sent",
      username,
    });
    return;
  }

  const history = await loadTelegramConversationHistory(redis, linkedAccount.chatId);
  const conversationMessages: SimpleConversationMessage[] = [
    ...history.map((message, index) => ({
      id: `history-${index}`,
      role: message.role,
      content: message.imageUrl ? `[image] ${message.content}` : message.content,
    })),
    {
      id: `heartbeat-${Date.now()}`,
      role: "user",
      content: buildTelegramHeartbeatPrompt(),
    },
  ];

  const telegramModel = getTelegramModel((message, ...rest) =>
    logger.info(String(message), rest.length > 0 ? rest : undefined)
  );

  const {
    selectedModel,
    tools,
    enrichedMessages,
    loadedSections,
    staticSystemPrompt,
  } = await prepareRyoConversationModelInput({
    channel: "telegram",
    messages: conversationMessages,
    username,
    redis,
    model: telegramModel,
    log: (...args: unknown[]) => logger.info(`[TelegramHeartbeat:${username}]`, args),
    logError: (...args: unknown[]) =>
      logger.error(`[TelegramHeartbeat:${username}]`, args),
  });

  logger.info("Telegram heartbeat prompt sections loaded", {
    username,
    loadedSections,
    approxTokens: Math.round(staticSystemPrompt.length / 4),
  });

  const result = streamText({
    model: selectedModel,
    messages: enrichedMessages,
    tools,
    temperature: 0.7,
    maxOutputTokens: 4000,
    stopWhen: stepCountIs(6),
    providerOptions: {
      openai: {
        reasoningEffort: "none",
      },
    },
    onStepFinish: async (stepResult) => {
      if (stepResult.toolResults.length > 0) {
        logger.info("Telegram heartbeat completed tool step", {
          username,
          toolResults: stepResult.toolResults.length,
          finishReason: stepResult.finishReason,
        });
      }
    },
  });

  let rawReply = "";
  for await (const chunk of result.textStream) {
    rawReply += chunk;
  }

  const replyText = simplifyTelegramCitationDisplay(rawReply);
  if (!replyText) {
    logger.warn("Telegram heartbeat generated empty reply", { username });
    logger.response(500, Date.now() - startTime);
    sendJson(res, 500, { error: "Generated empty reply" });
    return;
  }

  await sendTelegramMessage({
    botToken,
    chatId: linkedAccount.chatId,
    text: replyText,
  });

  await redis.set(
    slotKey,
    JSON.stringify({
      username,
      chatId: linkedAccount.chatId,
      sentAt: Date.now(),
    }),
    { ex: TELEGRAM_HEARTBEAT_SLOT_TTL_SECONDS }
  );

  await appendTelegramConversationMessage(redis, linkedAccount.chatId, {
    role: "assistant",
    content: replyText,
    createdAt: Date.now(),
  });

  logger.info("Telegram heartbeat sent", {
    username,
    chatId: linkedAccount.chatId,
    replyLength: replyText.length,
    model: telegramModel,
  });
  logger.response(200, Date.now() - startTime);
  sendJson(res, 200, {
    success: true,
    sent: true,
    username,
    replyLength: replyText.length,
  });
}
