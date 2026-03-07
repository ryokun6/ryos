import type { VercelRequest, VercelResponse } from "@vercel/node";
import { stepCountIs, streamText } from "ai";
import { initLogger } from "../_utils/_logging.js";
import createRedis from "../_utils/redis.js";
import {
  appendDailyNote,
  getDailyNote,
  getTodayDateString,
} from "../_utils/_memory.js";
import {
  appendTelegramConversationMessage,
  getLinkedTelegramAccountByUsername,
  loadTelegramConversationHistory,
} from "../_utils/telegram-link.js";
import { sendTelegramMessage } from "../_utils/telegram.js";
import { simplifyTelegramCitationDisplay } from "../_utils/telegram-format.js";
import {
  buildTelegramHeartbeatConversationContext,
  buildTelegramHeartbeatLogEntry,
  buildTelegramHeartbeatPrompt,
  buildTelegramHeartbeatRedisKey,
  formatTelegramHeartbeatEntries,
  formatTelegramConversationEntries,
  getTelegramHeartbeatAuthSecret,
  isRepeatedTelegramHeartbeatReply,
  parseTelegramHeartbeatResult,
  shouldSendTelegramHeartbeat,
  splitTelegramHeartbeatEntries,
  TELEGRAM_HEARTBEAT_SLOT_TTL_SECONDS,
  TELEGRAM_HEARTBEAT_TARGET_USERNAME,
  TELEGRAM_HEARTBEAT_TIME_ZONE,
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

async function markHeartbeatSlot(
  redis: ReturnType<typeof createRedis>,
  slotKey: string,
  payload: Record<string, unknown>
): Promise<void> {
  await redis.set(slotKey, JSON.stringify(payload), {
    ex: TELEGRAM_HEARTBEAT_SLOT_TTL_SECONDS,
  });
}

async function appendHeartbeatLog(
  redis: ReturnType<typeof createRedis>,
  username: string,
  text: string,
  logger: ReturnType<typeof initLogger>["logger"]
): Promise<void> {
  const result = await appendDailyNote(redis, username, text, {
    timeZone: TELEGRAM_HEARTBEAT_TIME_ZONE,
  });

  if (!result.success) {
    logger.warn("Failed to append telegram heartbeat log to daily notes", {
      username,
      message: result.message,
    });
  }
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

  const authSecret = getTelegramHeartbeatAuthSecret();
  if (!authSecret) {
    logger.warn("CRON_SECRET is not configured for telegram heartbeat");
    logger.response(503, Date.now() - startTime);
    sendJson(res, 503, {
      error: "CRON_SECRET is not configured",
    });
    return;
  }

  if (getHeader(req, "authorization") !== `Bearer ${authSecret}`) {
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

  const today = getTodayDateString(TELEGRAM_HEARTBEAT_TIME_ZONE);
  const todaysDailyNote = await getDailyNote(redis, username, today);
  const noteContext = splitTelegramHeartbeatEntries(todaysDailyNote);
  const history = await loadTelegramConversationHistory(redis, linkedAccount.chatId);
  const conversationContext = buildTelegramHeartbeatConversationContext(history);
  const gateDecision = shouldSendTelegramHeartbeat(noteContext, conversationContext);

  if (!gateDecision.shouldSend) {
    await appendHeartbeatLog(
      redis,
      username,
      buildTelegramHeartbeatLogEntry({
        sent: false,
        reason: gateDecision.reason,
      }),
      logger
    );
    await markHeartbeatSlot(redis, slotKey, {
      username,
      chatId: linkedAccount.chatId,
      sent: false,
      reason: gateDecision.reason,
      code: gateDecision.code,
      checkedAt: Date.now(),
    });
    logger.info("Skipping telegram heartbeat after reading current notes and chats", {
      username,
      reason: gateDecision.reason,
      actionableEntries: noteContext.actionableEntries.length,
      logEntries: noteContext.logEntries.length,
      recentMessages: conversationContext.recentMessages.length,
      date: today,
    });
    logger.response(200, Date.now() - startTime);
    sendJson(res, 200, {
      success: true,
      sent: false,
      reason: gateDecision.reason,
      code: gateDecision.code,
      username,
    });
    return;
  }

  const conversationMessages: SimpleConversationMessage[] = [
    ...history.map((message, index) => ({
      id: `history-${index}`,
      role: message.role,
      content: message.imageUrl ? `[image] ${message.content}` : message.content,
    })),
    {
      id: `heartbeat-${Date.now()}`,
      role: "user",
      content: buildTelegramHeartbeatPrompt({
        dailyNoteSnapshot: formatTelegramHeartbeatEntries(
          noteContext.actionableEntries
        ),
        recentTelegramSnapshot: formatTelegramConversationEntries(
          conversationContext.recentMessages
        ),
        heartbeatLogSnapshot: formatTelegramHeartbeatEntries(
          noteContext.logEntries
        ),
      }),
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
    timeZone: TELEGRAM_HEARTBEAT_TIME_ZONE,
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

  const heartbeatResult = parseTelegramHeartbeatResult(rawReply);
  if (!heartbeatResult.shouldSend) {
    await appendHeartbeatLog(
      redis,
      username,
      buildTelegramHeartbeatLogEntry({
        sent: false,
        reason: heartbeatResult.reason,
      }),
      logger
    );
    await markHeartbeatSlot(redis, slotKey, {
      username,
      chatId: linkedAccount.chatId,
      sent: false,
      reason: heartbeatResult.reason,
      code: "model-no-heartbeat",
      checkedAt: Date.now(),
    });
    logger.info("Telegram heartbeat skipped by model decision", {
      username,
      reason: heartbeatResult.reason,
    });
    logger.response(200, Date.now() - startTime);
    sendJson(res, 200, {
      success: true,
      sent: false,
      reason: heartbeatResult.reason,
      code: "model-no-heartbeat",
      username,
    });
    return;
  }

  const replyText = simplifyTelegramCitationDisplay(heartbeatResult.replyText || "");
  if (!replyText) {
    logger.warn("Telegram heartbeat generated empty reply", { username });
    logger.response(500, Date.now() - startTime);
    sendJson(res, 500, { error: "Generated empty reply" });
    return;
  }

  if (isRepeatedTelegramHeartbeatReply(replyText, history)) {
    const reason = "generated reply repeated a recent Telegram message";
    await appendHeartbeatLog(
      redis,
      username,
      buildTelegramHeartbeatLogEntry({
        sent: false,
        reason,
      }),
      logger
    );
    await markHeartbeatSlot(redis, slotKey, {
      username,
      chatId: linkedAccount.chatId,
      sent: false,
      reason,
      code: "model-duplicate-reply",
      checkedAt: Date.now(),
    });
    logger.info("Telegram heartbeat skipped because reply repeated recent context", {
      username,
      replyLength: replyText.length,
    });
    logger.response(200, Date.now() - startTime);
    sendJson(res, 200, {
      success: true,
      sent: false,
      reason,
      code: "model-duplicate-reply",
      username,
    });
    return;
  }

  await sendTelegramMessage({
    botToken,
    chatId: linkedAccount.chatId,
    text: replyText,
  });

  await markHeartbeatSlot(
    redis,
    slotKey,
    {
      username,
      chatId: linkedAccount.chatId,
      sent: true,
      sentAt: Date.now(),
    }
  );

  await appendTelegramConversationMessage(redis, linkedAccount.chatId, {
    role: "assistant",
    content: replyText,
    createdAt: Date.now(),
  });
  await appendHeartbeatLog(
    redis,
    username,
    buildTelegramHeartbeatLogEntry({
      sent: true,
      replyText,
    }),
    logger
  );

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
