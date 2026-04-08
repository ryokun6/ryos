import type { VercelRequest, VercelResponse } from "@vercel/node";
import { stepCountIs, streamText } from "ai";
import { initLogger } from "../_utils/_logging.js";
import createRedis from "../_utils/redis.js";
import { getDailyNote, getMemoryIndex, getTodayDateString } from "../_utils/_memory.js";
import { appendHeartbeatRecord, getRecentHeartbeatRecords } from "../_utils/heartbeats.js";
import { extractMemoriesFromConversation } from "../ai/extract-memories.js";
import { processDailyNotesForUser } from "../ai/process-daily-notes.js";
import {
  appendTelegramConversationMessage,
  getLinkedTelegramAccountByUsername,
  loadTelegramConversationHistory,
} from "../_utils/telegram-link.js";
import { sendTelegramMessage } from "../_utils/telegram.js";
import { simplifyTelegramCitationDisplay } from "../_utils/telegram-format.js";
import {
  buildTelegramHeartbeatHistoryContext,
  buildTelegramHeartbeatNoteContext,
  buildTelegramHeartbeatConversationContext,
  buildTelegramHeartbeatPrompt,
  buildTelegramHeartbeatRedisKey,
  buildTelegramHeartbeatStateSummary,
  formatTelegramConversationEntries,
  formatTelegramHeartbeatDailyNoteEntries,
  formatTelegramHeartbeatHistoryEntries,
  getCurrentBriefingType,
  getTelegramConversationSinceLastHeartbeat,
  getTelegramHeartbeatAuthSecret,
  parseTelegramHeartbeatResult,
  shouldSendTelegramHeartbeat,
  TELEGRAM_HEARTBEAT_HISTORY_LOOKBACK_DAYS,
  TELEGRAM_HEARTBEAT_SLOT_TTL_SECONDS,
  TELEGRAM_HEARTBEAT_TOPIC,
  TELEGRAM_HEARTBEAT_TARGET_USERNAME,
  TELEGRAM_HEARTBEAT_TIME_ZONE,
} from "../_utils/telegram-heartbeat.js";
import {
  prepareRyoConversationModelInput,
  type SimpleConversationMessage,
} from "../_utils/ryo-conversation.js";
import { preparePromptCachingStep } from "../_utils/prompt-caching.js";
import {
  TELEGRAM_DEFAULT_MODEL,
  SUPPORTED_AI_MODELS,
  getPromptOptimizedProviderOptions,
  type SupportedModel,
} from "../_utils/_aiModels.js";
import { getHeader } from "../_utils/request-helpers.js";

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

export function getTelegramModel(
  log: (...args: unknown[]) => void,
  env: NodeJS.ProcessEnv = process.env
): SupportedModel {
  const raw = env.TELEGRAM_BOT_MODEL as SupportedModel | undefined;
  if (raw && SUPPORTED_AI_MODELS.includes(raw)) {
    return raw;
  }
  if (raw) {
    log(
      `Unsupported TELEGRAM_BOT_MODEL "${raw}", falling back to ${TELEGRAM_DEFAULT_MODEL}`
    );
  }
  return TELEGRAM_DEFAULT_MODEL;
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
  payload: {
    shouldSend: boolean;
    message?: string | null;
    skipReason?: string | null;
    stateSummary: string;
  },
  logger: ReturnType<typeof initLogger>["logger"]
): Promise<void> {
  try {
    await appendHeartbeatRecord(redis, username, {
      shouldSend: payload.shouldSend,
      topic: TELEGRAM_HEARTBEAT_TOPIC,
      message: payload.message,
      skipReason: payload.skipReason,
      stateSummary: payload.stateSummary,
      timeZone: TELEGRAM_HEARTBEAT_TIME_ZONE,
    });
  } catch (error) {
    logger.warn("Failed to append telegram heartbeat record", {
      username,
      error: error instanceof Error ? error.message : String(error),
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
    await appendHeartbeatLog(
      redis,
      username,
      {
        shouldSend: false,
        skipReason: "not-linked",
        stateSummary: "decision=not-linked; linked_account=false",
      },
      logger
    );
    logger.info("Skipping telegram heartbeat because user is not linked", { username });
    logger.response(200, Date.now() - startTime);
    sendJson(res, 200, { success: true, sent: false, reason: "not-linked", username });
    return;
  }

  const slotKey = buildTelegramHeartbeatRedisKey(username);
  if ((await redis.exists(slotKey)) > 0) {
    await appendHeartbeatLog(
      redis,
      username,
      {
        shouldSend: false,
        skipReason: "already-sent",
        stateSummary: `decision=already-sent; slot_key=${slotKey}`,
      },
      logger
    );
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

  try {
    const processedNotes = await processDailyNotesForUser(
      redis,
      username,
      (...args: unknown[]) => logger.info("[TelegramHeartbeatDailyNotes]", args),
      (...args: unknown[]) => logger.error("[TelegramHeartbeatDailyNotes]", args),
      TELEGRAM_HEARTBEAT_TIME_ZONE
    );
    if (processedNotes.processed > 0 || processedNotes.skippedDates.length > 0) {
      logger.info("Telegram heartbeat processed past daily notes", {
        username,
        processed: processedNotes.processed,
        created: processedNotes.created,
        updated: processedNotes.updated,
        dates: processedNotes.dates,
        skippedDates: processedNotes.skippedDates,
      });
    }
  } catch (error) {
    logger.warn("Telegram heartbeat failed to process past daily notes", {
      username,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const history = await loadTelegramConversationHistory(redis, linkedAccount.chatId);
  const recentHeartbeatRecords = await getRecentHeartbeatRecords(
    redis,
    username,
    TELEGRAM_HEARTBEAT_HISTORY_LOOKBACK_DAYS,
    TELEGRAM_HEARTBEAT_TIME_ZONE,
    TELEGRAM_HEARTBEAT_TOPIC
  );
  const heartbeatHistoryContext = buildTelegramHeartbeatHistoryContext(
    recentHeartbeatRecords
  );

  const newTelegramConversation = getTelegramConversationSinceLastHeartbeat(
    history,
    heartbeatHistoryContext.latestHeartbeatTimestamp
  );

  if (newTelegramConversation.length > 0) {
    try {
      const extractionResult = await extractMemoriesFromConversation({
        redis,
        username,
        messages: newTelegramConversation.map((message) => ({
          role: message.role,
          content: message.imageUrl ? `[image] ${message.content}` : message.content,
          metadata: {
            createdAt: message.createdAt,
          },
        })),
        timeZone: TELEGRAM_HEARTBEAT_TIME_ZONE,
        storeLongTermMemories: false,
        markTodayProcessed: false,
        log: (...args: unknown[]) => logger.info("[TelegramHeartbeatChatDelta]", args),
        logError: (...args: unknown[]) =>
          logger.error("[TelegramHeartbeatChatDelta]", args),
      });
      logger.info("Telegram heartbeat processed new chat delta", {
        username,
        messagesProcessed: newTelegramConversation.length,
        dailyNotes: extractionResult.dailyNotes,
        extracted: extractionResult.extracted,
        skippedReason: extractionResult.skippedReason ?? null,
      });
    } catch (error) {
      logger.warn("Telegram heartbeat failed to process chat delta", {
        username,
        error: error instanceof Error ? error.message : String(error),
        messagesProcessed: newTelegramConversation.length,
      });
    }
  }

  const briefingType = getCurrentBriefingType(new Date(), TELEGRAM_HEARTBEAT_TIME_ZONE);
  if (briefingType) {
    logger.info("Telegram heartbeat detected scheduled briefing window", {
      username,
      briefingType,
    });
  }

  const today = getTodayDateString(TELEGRAM_HEARTBEAT_TIME_ZONE);
  const todaysDailyNote = await getDailyNote(redis, username, today);
  const noteContext = buildTelegramHeartbeatNoteContext(todaysDailyNote);
  const conversationContext = buildTelegramHeartbeatConversationContext(history);
  const gateDecision = shouldSendTelegramHeartbeat(
    noteContext,
    heartbeatHistoryContext,
    conversationContext,
    briefingType
  );

  if (!gateDecision.shouldSend) {
    await appendHeartbeatLog(
      redis,
      username,
      {
        shouldSend: false,
        skipReason: gateDecision.reason,
        stateSummary: buildTelegramHeartbeatStateSummary({
          noteContext,
          historyContext: heartbeatHistoryContext,
          conversationContext,
          decisionCode: gateDecision.code,
        }),
      },
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
      noteEntries: noteContext.entries.length,
      heartbeatEntries: heartbeatHistoryContext.entries.length,
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
        dailyNoteSnapshot: formatTelegramHeartbeatDailyNoteEntries(
          noteContext.entries
        ),
        recentTelegramSnapshot: formatTelegramConversationEntries(
          conversationContext.recentMessages
        ),
        heartbeatLogSnapshot: formatTelegramHeartbeatHistoryEntries(
          heartbeatHistoryContext.entries
        ),
        briefingType,
      }),
    },
  ];

  const telegramModel = getTelegramModel((message, ...rest) =>
    logger.info(String(message), rest.length > 0 ? rest : undefined)
  );
  const userMemories = await getMemoryIndex(redis, username);

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
    preloadedMemoryContext: {
      userMemories,
      dailyNotesText: null,
      userTimeZone: TELEGRAM_HEARTBEAT_TIME_ZONE,
    },
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
    prepareStep: preparePromptCachingStep,
    providerOptions: getPromptOptimizedProviderOptions(telegramModel),
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
      {
        shouldSend: false,
        skipReason: heartbeatResult.reason,
        stateSummary: buildTelegramHeartbeatStateSummary({
          noteContext,
          historyContext: heartbeatHistoryContext,
          conversationContext,
          decisionCode: "model-no-heartbeat",
        }),
      },
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
    {
      shouldSend: true,
      message: replyText,
      stateSummary: `${buildTelegramHeartbeatStateSummary({
        noteContext,
        historyContext: heartbeatHistoryContext,
        conversationContext,
        decisionCode: "sent",
      })}; reply_length=${replyText.length}`,
    },
    logger
  );

  logger.info("Telegram heartbeat sent", {
    username,
    chatId: linkedAccount.chatId,
    replyLength: replyText.length,
    model: telegramModel,
    briefingType: briefingType ?? undefined,
  });
  logger.response(200, Date.now() - startTime);
  sendJson(res, 200, {
    success: true,
    sent: true,
    username,
    replyLength: replyText.length,
    ...(briefingType ? { briefingType } : {}),
  });
}
