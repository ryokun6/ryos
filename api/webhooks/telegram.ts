import type { VercelRequest, VercelResponse } from "@vercel/node";
import { stepCountIs, streamText, type ModelMessage, type ToolSet } from "ai";
import { initLogger } from "../_utils/_logging.js";
import createRedis from "../_utils/redis.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import {
  appendTelegramConversationMessage,
  clearTelegramConversationHistory,
  getLinkedTelegramAccountByTelegramUserId,
  hasProcessedTelegramUpdate,
  linkTelegramAccount,
  loadTelegramConversationHistory,
  markTelegramUpdateProcessed,
} from "../_utils/telegram-link.js";
import {
  downloadTelegramFile,
  matchesTelegramCommand,
  parseTelegramTextUpdate,
  sendTelegramMessage,
  sendTelegramChatAction,
  sendTelegramVoice,
  type TelegramUpdate,
} from "../_utils/telegram.js";
import { simplifyTelegramCitationDisplay } from "../_utils/telegram-format.js";
import {
  collectTelegramReplyText,
  streamTelegramReply,
} from "../_utils/telegram-streaming.js";
import {
  createTelegramStatusReporter,
  getTelegramToolStatusText,
} from "../_utils/telegram-status.js";
import {
  prepareRyoConversationModelInput,
  type SimpleConversationMessage,
} from "../_utils/ryo-conversation.js";
import {
  TELEGRAM_DEFAULT_MODEL,
  SUPPORTED_AI_MODELS,
  getOpenAIProviderOptions,
  type SupportedModel,
} from "../_utils/_aiModels.js";
import {
  generateElevenLabsSpeech,
  transcribeAudioBuffer,
} from "../_utils/voice.js";

export const runtime = "nodejs";
export const maxDuration = 80;
const TELEGRAM_STOP_COMMANDS = ["stop", "cancel"];
const TELEGRAM_CLEAR_COMMANDS = [
  "clear",
  "clearhistory",
  "clear_history",
  "clear-history",
];

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

function formatTelegramRateLimitDuration(seconds: number): string {
  if (seconds >= 60 * 60) {
    const hours = Math.ceil(seconds / (60 * 60));
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }

  if (seconds >= 60) {
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  const roundedSeconds = Math.max(1, Math.ceil(seconds));
  return `${roundedSeconds} second${roundedSeconds === 1 ? "" : "s"}`;
}

function buildTelegramRateLimitMessage(
  rateLimit: Pick<
    Awaited<ReturnType<typeof RateLimit.checkCounterLimit>>,
    "limit" | "windowSeconds" | "resetSeconds"
  >
): string {
  const windowText = formatTelegramRateLimitDuration(rateLimit.windowSeconds);
  const retryText = formatTelegramRateLimitDuration(rateLimit.resetSeconds);
  return `you've hit the limit of ${rateLimit.limit} messages in ${windowText}. try again in about ${retryText}.`;
}

function getTelegramWebhookSecret(req: VercelRequest): string | null {
  const value = req.headers["x-telegram-bot-api-secret-token"];
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return typeof value === "string" ? value : null;
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

async function handleTelegramRateLimitedUpdate(args: {
  botToken: string;
  chatId: string;
  replyToMessageId: number;
  updateId: number;
  rateLimit: Pick<
    Awaited<ReturnType<typeof RateLimit.checkCounterLimit>>,
    "count" | "limit" | "windowSeconds" | "resetSeconds"
  >;
  redis: ReturnType<typeof createRedis>;
  res: VercelResponse;
  startTime: number;
  logger: ReturnType<typeof initLogger>["logger"];
  scope: "user-burst" | "account-window";
}): Promise<void> {
  await sendTelegramInfoMessage(
    args.botToken,
    args.chatId,
    buildTelegramRateLimitMessage(args.rateLimit),
    args.replyToMessageId
  );
  await markTelegramUpdateProcessed(args.redis, args.updateId);
  args.logger.response(200, Date.now() - args.startTime);
  sendJson(args.res, 200, {
    success: true,
    rateLimited: true,
    scope: args.scope,
    limit: args.rateLimit.limit,
    count: args.rateLimit.count,
    retryAfter: args.rateLimit.resetSeconds,
  });
}

async function handleTelegramCommandUpdate(args: {
  botToken: string;
  chatId: string;
  replyToMessageId: number;
  updateId: number;
  redis: ReturnType<typeof createRedis>;
  res: VercelResponse;
  startTime: number;
  logger: ReturnType<typeof initLogger>["logger"];
  text: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  await sendTelegramInfoMessage(
    args.botToken,
    args.chatId,
    args.text,
    args.replyToMessageId
  );
  await markTelegramUpdateProcessed(args.redis, args.updateId);
  args.logger.response(200, Date.now() - args.startTime);
  sendJson(args.res, 200, args.payload);
}

function injectImageIntoLastUserMessage(
  messages: ModelMessage[],
  image: { data: Uint8Array; mimeType: string }
): ModelMessage[] {
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") { lastUserIdx = i; break; }
  }
  if (lastUserIdx === -1) return messages;

  const msg = messages[lastUserIdx];
  if (msg.role !== "user") return messages;

  const existingContent = typeof msg.content === "string"
    ? [{ type: "text" as const, text: msg.content }]
    : Array.isArray(msg.content)
      ? msg.content
      : [];

  const updated: ModelMessage[] = [...messages];
  updated[lastUserIdx] = {
    ...msg,
    content: [
      ...existingContent,
      {
        type: "image" as const,
        image: image.data,
        mimeType: image.mimeType,
      },
    ],
  } as ModelMessage;

  return updated;
}

function getTelegramAudioFilename(mimeType: string): string {
  const normalizedMimeType = mimeType.toLowerCase();
  if (normalizedMimeType.includes("ogg")) {
    return "telegram-voice.ogg";
  }
  if (normalizedMimeType.includes("mpeg") || normalizedMimeType.includes("mp3")) {
    return "telegram-voice.mp3";
  }
  if (normalizedMimeType.includes("m4a") || normalizedMimeType.includes("mp4")) {
    return "telegram-voice.m4a";
  }
  if (normalizedMimeType.includes("wav")) {
    return "telegram-voice.wav";
  }
  return "telegram-voice.webm";
}

function wrapTelegramToolsWithStatus<T extends ToolSet>(
  tools: T,
  onToolStart: (toolName: string, input: unknown) => Promise<void>
): T {
  const wrappedTools = { ...tools } as T;

  for (const toolName of Object.keys(tools) as Array<keyof T & string>) {
    const tool = tools[toolName];
    if (typeof tool.execute !== "function") {
      continue;
    }

    const execute = tool.execute;
    wrappedTools[toolName] = {
      ...tool,
      execute: async (...args) => {
        await onToolStart(toolName, args[0]);
        return await execute(...args);
      },
    } as T[typeof toolName];
  }

  return wrappedTools;
}

type TelegramStatusStreamChunk =
  | {
      type: "tool-input-start";
      id: string;
      toolName: string;
      providerExecuted?: boolean;
    }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      input: unknown;
      providerExecuted?: boolean;
    };

export function getTelegramProviderStatusToolCall(
  chunk: TelegramStatusStreamChunk
): { toolCallId: string; toolName: string; input: unknown } | null {
  if (chunk.providerExecuted !== true) {
    return null;
  }

  if (chunk.type === "tool-input-start") {
    return {
      toolCallId: chunk.id,
      toolName: chunk.toolName,
      input: undefined,
    };
  }

  if (chunk.type === "tool-call") {
    return {
      toolCallId: chunk.toolCallId,
      toolName: chunk.toolName,
      input: chunk.input,
    };
  }

  return null;
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

  if (matchesTelegramCommand(parsedUpdate.text, TELEGRAM_STOP_COMMANDS)) {
    await handleTelegramCommandUpdate({
      botToken,
      chatId: parsedUpdate.chatId,
      replyToMessageId: parsedUpdate.messageId,
      updateId: parsedUpdate.updateId,
      redis,
      res,
      startTime,
      logger,
      text: "stopped. i skipped this Telegram message. send a new one whenever you're ready.",
      payload: {
        success: true,
        command: "stop",
        stopped: true,
      },
    });
    return;
  }

  if (matchesTelegramCommand(parsedUpdate.text, TELEGRAM_CLEAR_COMMANDS)) {
    await clearTelegramConversationHistory(redis, parsedUpdate.chatId);
    await handleTelegramCommandUpdate({
      botToken,
      chatId: parsedUpdate.chatId,
      replyToMessageId: parsedUpdate.messageId,
      updateId: parsedUpdate.updateId,
      redis,
      res,
      startTime,
      logger,
      text: "cleared our Telegram chat history. start a new message whenever you want.",
      payload: {
        success: true,
        command: "clear",
        clearedHistory: true,
      },
    });
    return;
  }

  const isExemptUser = linkedAccount.username === "ryo";

  if (!isExemptUser) {
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
        count: userBurstLimit.count,
        limit: userBurstLimit.limit,
        retryAfter: userBurstLimit.resetSeconds,
      });
      await handleTelegramRateLimitedUpdate({
        botToken,
        chatId: parsedUpdate.chatId,
        replyToMessageId: parsedUpdate.messageId,
        updateId: parsedUpdate.updateId,
        rateLimit: userBurstLimit,
        redis,
        res,
        startTime,
        logger,
        scope: "user-burst",
      });
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
        count: accountLimit.count,
        limit: accountLimit.limit,
        retryAfter: accountLimit.resetSeconds,
      });
      await handleTelegramRateLimitedUpdate({
        botToken,
        chatId: parsedUpdate.chatId,
        replyToMessageId: parsedUpdate.messageId,
        updateId: parsedUpdate.updateId,
        rateLimit: accountLimit,
        redis,
        res,
        startTime,
        logger,
        scope: "account-window",
      });
      return;
    }
  }

  let imageData: { data: Uint8Array; mimeType: string } | null = null;
  if (parsedUpdate.photoFileId) {
    try {
      imageData = await downloadTelegramFile({
        botToken,
        fileId: parsedUpdate.photoFileId,
      });
      logger.info("Downloaded Telegram photo", {
        mimeType: imageData.mimeType,
        sizeBytes: imageData.data.length,
      });
    } catch (err) {
      logger.warn("Failed to download Telegram photo, continuing without image", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let voiceTranscript: string | null = null;
  if (parsedUpdate.voiceFileId) {
    try {
      const voiceData = await downloadTelegramFile({
        botToken,
        fileId: parsedUpdate.voiceFileId,
      });
      voiceTranscript = (await transcribeAudioBuffer({
        buffer: voiceData.data,
        fileName: getTelegramAudioFilename(voiceData.mimeType),
        mimeType: voiceData.mimeType || "audio/ogg",
      })).trim();
      logger.info("Transcribed Telegram voice note", {
        mimeType: voiceData.mimeType,
        sizeBytes: voiceData.data.length,
        textLength: voiceTranscript.length,
      });
    } catch (err) {
      logger.warn("Failed to transcribe Telegram voice note", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (!voiceTranscript) {
      await sendTelegramInfoMessage(
        botToken,
        parsedUpdate.chatId,
        "i couldn't transcribe that voice message. try another one or send text instead.",
        parsedUpdate.messageId
      );
      await markTelegramUpdateProcessed(redis, parsedUpdate.updateId);
      logger.response(200, Date.now() - startTime);
      sendJson(res, 200, {
        success: true,
        transcribed: false,
        reason: "voice-transcription-failed",
      });
      return;
    }
  }

  const history = await loadTelegramConversationHistory(redis, parsedUpdate.chatId);
  const userMessageText = voiceTranscript
    ? voiceTranscript
    : imageData && !parsedUpdate.text
      ? "[sent an image]"
      : parsedUpdate.text;

  const conversationMessages: SimpleConversationMessage[] = [
    ...history.map((message, index) => ({
      id: `history-${index}`,
      role: message.role,
      content: message.imageUrl
        ? `[image] ${message.content}`
        : message.content,
    })),
    {
      id: `telegram-${parsedUpdate.updateId}`,
      role: "user",
      content: userMessageText || "[sent an image]",
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
    telegramRepoAgentOverrides: {
      telegramRepoAgent: {
        botToken,
        chatId: parsedUpdate.chatId,
        replyToMessageId: parsedUpdate.messageId,
      },
    },
  });

  logger.info("Telegram prompt sections loaded", {
    username: linkedAccount.username,
    loadedSections,
    approxTokens: Math.round(staticSystemPrompt.length / 4),
  });

  const finalMessages: ModelMessage[] = imageData
    ? injectImageIntoLastUserMessage(enrichedMessages as ModelMessage[], imageData)
    : (enrichedMessages as ModelMessage[]);

  const statusReporter = createTelegramStatusReporter({
    botToken,
    chatId: parsedUpdate.chatId,
    logWarn: (message, details) => logger.warn(message, details),
  });
  const reportedProviderToolCalls = new Set<string>();
  const shouldSendVoiceOnlyReply = Boolean(parsedUpdate.voiceFileId);

  try {
    await statusReporter.start();

    const toolsWithStatus = wrapTelegramToolsWithStatus(
      tools,
      async (toolName, input) => {
        const statusText = getTelegramToolStatusText(toolName, input);
        logger.info("Telegram tool started", {
          username: linkedAccount.username,
          toolName,
          statusText,
        });
        await statusReporter.markTool(toolName, input);
      }
    );

    const result = streamText({
      model: selectedModel,
      messages: finalMessages,
      tools: toolsWithStatus,
      temperature: 0.7,
      maxOutputTokens: 4000,
      stopWhen: stepCountIs(6),
      providerOptions: getOpenAIProviderOptions(telegramModel),
      onChunk: async ({ chunk }) => {
        if (chunk.type !== "tool-input-start" && chunk.type !== "tool-call") {
          return;
        }

        const providerToolCall = getTelegramProviderStatusToolCall(chunk);
        if (!providerToolCall) {
          return;
        }

        if (reportedProviderToolCalls.has(providerToolCall.toolCallId)) {
          return;
        }

        reportedProviderToolCalls.add(providerToolCall.toolCallId);
        const statusText = getTelegramToolStatusText(
          providerToolCall.toolName,
          providerToolCall.input
        );
        logger.info("Telegram provider tool started", {
          username: linkedAccount.username,
          toolName: providerToolCall.toolName,
          statusText,
        });
        await statusReporter.markTool(
          providerToolCall.toolName,
          providerToolCall.input
        );
      },
      onStepFinish: async (stepResult) => {
        if (stepResult.toolResults.length > 0) {
          await statusReporter.markThinking();
        }
      },
    });

    const { text: replyText, previewMode } = shouldSendVoiceOnlyReply
      ? {
          text: await collectTelegramReplyText({
            textStream: result.textStream,
            formatText: simplifyTelegramCitationDisplay,
          }),
          previewMode: "none" as const,
        }
      : await streamTelegramReply({
          botToken,
          chatId: parsedUpdate.chatId,
          draftId: parsedUpdate.updateId,
          textStream: result.textStream,
          replyToMessageId: parsedUpdate.messageId,
          formatText: simplifyTelegramCitationDisplay,
          onBeforePreview: async () => {
            await statusReporter.dispose();
          },
          logWarn: (message, details) => logger.warn(message, details),
        });

    if (!replyText) {
      logger.warn("Generated empty Telegram reply", {
        username: linkedAccount.username,
        updateId: parsedUpdate.updateId,
      });
      logger.response(500, Date.now() - startTime);
      sendJson(res, 500, { error: "Generated empty reply" });
      return;
    }

    let voiceReplyMessageId: number | null = null;
    if (shouldSendVoiceOnlyReply) {
      try {
        await statusReporter.dispose();
        await sendTelegramChatAction({
          botToken,
          chatId: parsedUpdate.chatId,
          action: "upload_voice",
        });
        const voiceReplyAudio = await generateElevenLabsSpeech({
          text: replyText,
        });
        voiceReplyMessageId = await sendTelegramVoice({
          botToken,
          chatId: parsedUpdate.chatId,
          voice: voiceReplyAudio,
          replyToMessageId: parsedUpdate.messageId,
          mimeType: "audio/mpeg",
        });
      } catch (error) {
        logger.warn("Failed to send Telegram voice-only reply", {
          username: linkedAccount.username,
          updateId: parsedUpdate.updateId,
          error: error instanceof Error ? error.message : String(error),
        });
        await sendTelegramInfoMessage(
          botToken,
          parsedUpdate.chatId,
          "i couldn't send a voice reply just now. try again in a moment or send text instead.",
          parsedUpdate.messageId
        );
      }
    }

    const timestamp = Date.now();
    await appendTelegramConversationMessage(redis, parsedUpdate.chatId, {
      role: "user",
      content: userMessageText || "[sent an image]",
      createdAt: timestamp,
      ...(imageData ? { imageUrl: "photo" } : {}),
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
      hasImage: !!imageData,
      hasVoiceInput: !!parsedUpdate.voiceFileId,
      replyLength: replyText.length,
      previewMode,
      voiceReplyMessageId,
    });
    logger.response(200, Date.now() - startTime);
    sendJson(res, 200, {
      success: true,
      reply: replyText,
      voiceReplySent: voiceReplyMessageId !== null,
    });
  } finally {
    await statusReporter.dispose();
  }
}
