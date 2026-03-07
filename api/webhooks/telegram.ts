import type { VercelRequest, VercelResponse } from "@vercel/node";
import { generateText, stepCountIs } from "ai";
import { initLogger } from "../_utils/_logging.js";
import createRedis from "../_utils/redis.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import {
  appendTelegramConversationMessage,
  getLinkedTelegramAccountByTelegramUserId,
  hasProcessedTelegramUpdate,
  linkTelegramAccount,
  loadTelegramConversationHistory,
  markTelegramUpdateProcessed,
} from "../_utils/telegram-link.js";
import {
  parseTelegramTextUpdate,
  sendTelegramMessage,
  type TelegramUpdate,
} from "../_utils/telegram.js";
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

function getTelegramWebhookSecret(req: VercelRequest): string | null {
  const value = req.headers["x-telegram-bot-api-secret-token"];
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

async function sendTelegramInfoMessage(
  botToken: string,
  chatId: string,
  text: string,
  replyToMessageId: number
): Promise<void> {
  await sendTelegramMessage({
    botToken,
    chatId,
    text,
    replyToMessageId,
  });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();

  setResponseHeaders(res);
  logger.request(req.method || "POST", req.url || "/api/webhooks/telegram");

  if (req.method === "OPTIONS") {
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  if ((req.method || "GET").toUpperCase() !== "POST") {
    logger.response(405, Date.now() - startTime);
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!botToken || !expectedSecret) {
    logger.warn("Telegram bot is not configured");
    logger.response(503, Date.now() - startTime);
    sendJson(res, 503, {
      error:
        "Telegram bot is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET.",
    });
    return;
  }

  if (getTelegramWebhookSecret(req) !== expectedSecret) {
    logger.warn("Rejected Telegram webhook due to invalid secret");
    logger.response(401, Date.now() - startTime);
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }

  const redis = createRedis();
  const update = (req.body as TelegramUpdate | undefined) ?? null;
  const parsedUpdate = parseTelegramTextUpdate(update);

  if (!parsedUpdate) {
    logger.info("Ignoring unsupported Telegram update payload");
    logger.response(202, Date.now() - startTime);
    sendJson(res, 202, { ignored: true, reason: "unsupported-update" });
    return;
  }

  if (await hasProcessedTelegramUpdate(redis, parsedUpdate.updateId)) {
    logger.info("Ignoring duplicate Telegram update", {
      updateId: parsedUpdate.updateId,
    });
    logger.response(202, Date.now() - startTime);
    sendJson(res, 202, { ignored: true, reason: "duplicate-update" });
    return;
  }

  if (!parsedUpdate.isPrivateChat) {
    await markTelegramUpdateProcessed(redis, parsedUpdate.updateId);
    logger.info("Ignoring non-private Telegram chat", {
      updateId: parsedUpdate.updateId,
      chatType: parsedUpdate.chatType,
    });
    logger.response(202, Date.now() - startTime);
    sendJson(res, 202, { ignored: true, reason: "non-private-chat" });
    return;
  }

  if (
    parsedUpdate.startPayload &&
    parsedUpdate.startPayload.startsWith("link_")
  ) {
    const code = parsedUpdate.startPayload.slice("link_".length).trim();
    const linkedAccount = await linkTelegramAccount(redis, {
      code,
      telegramUserId: parsedUpdate.telegramUserId,
      chatId: parsedUpdate.chatId,
      telegramUsername: parsedUpdate.telegramUsername,
      firstName: parsedUpdate.firstName,
      lastName: parsedUpdate.lastName,
    });

    if (!linkedAccount) {
      await sendTelegramInfoMessage(
        botToken,
        parsedUpdate.chatId,
        "that link code expired or is invalid. generate a new Telegram link from ryOS Control Panels > System.",
        parsedUpdate.messageId
      );
      await markTelegramUpdateProcessed(redis, parsedUpdate.updateId);
      logger.response(200, Date.now() - startTime);
      sendJson(res, 200, { success: true, linked: false, reason: "invalid-link-code" });
      return;
    }

    await sendTelegramInfoMessage(
      botToken,
      parsedUpdate.chatId,
      `linked to ryOS as @${linkedAccount.username}. just talk to me here now.`,
      parsedUpdate.messageId
    );
    await markTelegramUpdateProcessed(redis, parsedUpdate.updateId);
    logger.info("Linked Telegram account to ryOS user", {
      username: linkedAccount.username,
      telegramUserId: linkedAccount.telegramUserId,
    });
    logger.response(200, Date.now() - startTime);
    sendJson(res, 200, { success: true, linked: true, username: linkedAccount.username });
    return;
  }

  const linkedAccount = await getLinkedTelegramAccountByTelegramUserId(
    redis,
    parsedUpdate.telegramUserId
  );

  if (!linkedAccount) {
    await sendTelegramInfoMessage(
      botToken,
      parsedUpdate.chatId,
      "link your Telegram account from ryOS first. open Control Panels > System > Telegram and tap Link Telegram.",
      parsedUpdate.messageId
    );
    await markTelegramUpdateProcessed(redis, parsedUpdate.updateId);
    logger.response(200, Date.now() - startTime);
    sendJson(res, 200, { success: true, linked: false, reason: "not-linked" });
    return;
  }

  const userBurstLimit = await RateLimit.checkCounterLimit({
    key: RateLimit.makeKey([
      "rl",
      "telegram",
      "user",
      parsedUpdate.telegramUserId,
    ]),
    windowSeconds: 5 * 60,
    limit: 20,
  });
  if (!userBurstLimit.allowed) {
    logger.warn("Telegram user burst rate limit exceeded", {
      telegramUserId: parsedUpdate.telegramUserId,
    });
    logger.response(429, Date.now() - startTime);
    sendJson(res, 429, { error: "Rate limit exceeded" });
    return;
  }

  const accountLimit = await RateLimit.checkCounterLimit({
    key: RateLimit.makeKey(["rl", "telegram", "ryos", linkedAccount.username]),
    windowSeconds: 5 * 60 * 60,
    limit: 15,
  });
  if (!accountLimit.allowed) {
    logger.warn("Linked ryOS user rate limit exceeded via Telegram", {
      username: linkedAccount.username,
    });
    logger.response(429, Date.now() - startTime);
    sendJson(res, 429, { error: "Rate limit exceeded" });
    return;
  }

  const history = await loadTelegramConversationHistory(redis, parsedUpdate.chatId);
  const conversationMessages: SimpleConversationMessage[] = [
    ...history.map((message, index) => ({
      id: `history-${index}`,
      role: message.role,
      content: message.content,
    })),
    {
      id: `telegram-${parsedUpdate.updateId}`,
      role: "user",
      content: parsedUpdate.text,
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
    username: linkedAccount.username,
    redis,
    model: telegramModel,
    log: (...args: unknown[]) =>
      logger.info(`[Telegram:${linkedAccount.username}]`, args),
    logError: (...args: unknown[]) =>
      logger.error(`[Telegram:${linkedAccount.username}]`, args),
  });

  logger.info("Telegram prompt sections loaded", {
    username: linkedAccount.username,
    loadedSections,
    approxTokens: Math.round(staticSystemPrompt.length / 4),
  });

  const { text } = await generateText({
    model: selectedModel,
    messages: enrichedMessages as any,
    tools: tools as any,
    temperature: 0.7,
    maxOutputTokens: 4000,
    stopWhen: stepCountIs(6),
    providerOptions: {
      openai: {
        reasoningEffort: "none",
      },
    },
  });

  const replyText = text.trim();
  if (!replyText) {
    logger.warn("Generated empty Telegram reply", {
      username: linkedAccount.username,
      updateId: parsedUpdate.updateId,
    });
    logger.response(500, Date.now() - startTime);
    sendJson(res, 500, { error: "Generated empty reply" });
    return;
  }

  await sendTelegramMessage({
    botToken,
    chatId: parsedUpdate.chatId,
    text: replyText,
    replyToMessageId: parsedUpdate.messageId,
  });

  const timestamp = Date.now();
  await appendTelegramConversationMessage(redis, parsedUpdate.chatId, {
    role: "user",
    content: parsedUpdate.text,
    createdAt: timestamp,
  });
  await appendTelegramConversationMessage(redis, parsedUpdate.chatId, {
    role: "assistant",
    content: replyText,
    createdAt: timestamp,
  });
  await markTelegramUpdateProcessed(redis, parsedUpdate.updateId);

  logger.info("Telegram message handled", {
    username: linkedAccount.username,
    telegramUserId: parsedUpdate.telegramUserId,
    updateId: parsedUpdate.updateId,
    replyLength: replyText.length,
  });
  logger.response(200, Date.now() - startTime);
  sendJson(res, 200, { success: true, reply: replyText });
}
