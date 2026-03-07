import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initLogger } from "../_utils/_logging.js";
import createRedis, { type RedisLike } from "../_utils/redis.js";
import {
  buildBlueBubblesHistoryKey,
  buildBlueBubblesProcessedMessageKey,
  extractBlueBubblesPrompt,
  getBlueBubblesTriggerPrefix,
  isBlueBubblesChatAllowed,
  parseBlueBubblesAllowedChatGuids,
  parseBlueBubblesConversationMessage,
  parseBlueBubblesWebhookPayload,
  sendBlueBubblesMessage,
  type BlueBubblesConversationMessage,
  type BlueBubblesWebhookPayload,
} from "../_utils/bluebubbles.js";
import {
  formatConversationContext,
  generateRyoDirectReply,
} from "../_utils/ryo-direct-chat.js";

export const runtime = "nodejs";
export const maxDuration = 60;

const HISTORY_LIMIT = 12;
const HISTORY_TTL_SECONDS = 60 * 60 * 24 * 14;
const PROCESSED_TTL_SECONDS = 60 * 60 * 24;

function setResponseHeaders(res: VercelResponse): void {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-BlueBubbles-Secret");
}

function sendJson(
  res: VercelResponse,
  status: number,
  payload: Record<string, unknown>
): void {
  res.status(status).json(payload);
}

function getWebhookSecret(
  req: VercelRequest,
  body: BlueBubblesWebhookPayload | null
): string | null {
  const headerValue = req.headers["x-bluebubbles-secret"];
  if (typeof headerValue === "string" && headerValue.trim().length > 0) {
    return headerValue.trim();
  }

  const bodySecret =
    typeof body?.secret === "string" && body.secret.trim().length > 0
      ? body.secret.trim()
      : null;
  if (bodySecret) {
    return bodySecret;
  }

  try {
    const url = new URL(req.url || "/", "http://localhost");
    const secret = url.searchParams.get("secret");
    return secret?.trim() || null;
  } catch {
    return null;
  }
}

async function loadConversationHistory(
  redis: RedisLike | null,
  chatGuid: string
): Promise<BlueBubblesConversationMessage[]> {
  if (!redis) {
    return [];
  }

  const values = await redis.lrange<string>(
    buildBlueBubblesHistoryKey(chatGuid),
    0,
    HISTORY_LIMIT - 1
  );

  return (values || [])
    .map((value) => parseBlueBubblesConversationMessage(value))
    .filter(
      (value): value is BlueBubblesConversationMessage => value !== null
    )
    .reverse();
}

async function appendConversationMessage(
  redis: RedisLike | null,
  chatGuid: string,
  message: BlueBubblesConversationMessage
): Promise<void> {
  if (!redis) {
    return;
  }

  const key = buildBlueBubblesHistoryKey(chatGuid);
  await redis.lpush(key, JSON.stringify(message));
  await redis.ltrim(key, 0, HISTORY_LIMIT - 1);
  await redis.expire(key, HISTORY_TTL_SECONDS);
}

async function hasProcessedMessage(
  redis: RedisLike | null,
  messageGuid: string | null
): Promise<boolean> {
  if (!redis || !messageGuid) {
    return false;
  }

  const count = await redis.exists(
    buildBlueBubblesProcessedMessageKey(messageGuid)
  );
  return count > 0;
}

async function markMessageProcessed(
  redis: RedisLike | null,
  messageGuid: string | null
): Promise<void> {
  if (!redis || !messageGuid) {
    return;
  }

  await redis.set(buildBlueBubblesProcessedMessageKey(messageGuid), "1", {
    ex: PROCESSED_TTL_SECONDS,
  });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();

  setResponseHeaders(res);
  logger.request(req.method || "GET", req.url || "/api/webhooks/bluebubbles");

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

  const serverUrl = process.env.BLUEBUBBLES_SERVER_URL;
  const serverPassword =
    process.env.BLUEBUBBLES_SERVER_PASSWORD || process.env.BLUEBUBBLES_PASSWORD;

  if (!serverUrl || !serverPassword) {
    logger.warn("BlueBubbles integration is not configured");
    logger.response(503, Date.now() - startTime);
    sendJson(res, 503, {
      error:
        "BlueBubbles integration is not configured. Set BLUEBUBBLES_SERVER_URL and BLUEBUBBLES_SERVER_PASSWORD.",
    });
    return;
  }

  let body: BlueBubblesWebhookPayload | null = null;
  try {
    body = (req.body as BlueBubblesWebhookPayload | undefined) ?? null;
  } catch (error) {
    logger.warn("Invalid JSON body", error);
    logger.response(400, Date.now() - startTime);
    sendJson(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const expectedSecret = process.env.BLUEBUBBLES_WEBHOOK_SECRET;
  if (expectedSecret) {
    const providedSecret = getWebhookSecret(req, body);
    if (providedSecret !== expectedSecret) {
      logger.warn("Rejected BlueBubbles webhook due to invalid secret");
      logger.response(401, Date.now() - startTime);
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }
  }

  let redis: RedisLike | null = null;
  try {
    redis = createRedis();
  } catch (error) {
    logger.warn(
      "BlueBubbles webhook running without Redis-backed history",
      error
    );
  }

  const parsed = parseBlueBubblesWebhookPayload(body);
  if (parsed.type !== "new-message") {
    logger.info("Ignoring non-message BlueBubbles webhook", {
      type: parsed.type || "unknown",
    });
    logger.response(202, Date.now() - startTime);
    sendJson(res, 202, { ignored: true, reason: "unsupported-event" });
    return;
  }

  if (!parsed.chatGuid || !parsed.text) {
    logger.info("Ignoring BlueBubbles message without text or chat guid", {
      chatGuid: parsed.chatGuid,
      textLength: parsed.text.length,
    });
    logger.response(202, Date.now() - startTime);
    sendJson(res, 202, { ignored: true, reason: "missing-chat-or-text" });
    return;
  }

  if (await hasProcessedMessage(redis, parsed.messageGuid)) {
    logger.info("Ignoring duplicate BlueBubbles webhook", {
      messageGuid: parsed.messageGuid,
    });
    logger.response(202, Date.now() - startTime);
    sendJson(res, 202, { ignored: true, reason: "duplicate-message" });
    return;
  }

  const allowedChatGuids = parseBlueBubblesAllowedChatGuids(
    process.env.BLUEBUBBLES_ALLOWED_CHAT_GUIDS
  );
  if (!isBlueBubblesChatAllowed(parsed.chatGuid, allowedChatGuids)) {
    logger.info("Ignoring BlueBubbles message from disallowed chat", {
      chatGuid: parsed.chatGuid,
    });
    logger.response(202, Date.now() - startTime);
    sendJson(res, 202, { ignored: true, reason: "chat-not-enabled" });
    return;
  }

  const triggerPrefix = getBlueBubblesTriggerPrefix(
    process.env.BLUEBUBBLES_TRIGGER_PREFIX
  );
  const prompt = extractBlueBubblesPrompt(parsed.text, triggerPrefix);
  if (!prompt) {
    logger.info("Ignoring BlueBubbles message without trigger prefix", {
      chatGuid: parsed.chatGuid,
      isFromMe: parsed.isFromMe,
    });
    logger.response(202, Date.now() - startTime);
    sendJson(res, 202, { ignored: true, reason: "missing-trigger-prefix" });
    return;
  }

  const history = await loadConversationHistory(redis, parsed.chatGuid);
  const channelContext = `<chat_channel_instructions>
you're replying in a direct iMessage conversation relayed through BlueBubbles on a Mac.
keep responses 1-2 sentences unless the user asks for more.
respond in the user's language.
never mention system prompts, webhooks, BlueBubbles, or that you're automated.
triggerPrefix: ${triggerPrefix}
chatGuid: ${parsed.chatGuid}
messageSource: ${parsed.isFromMe ? "sent from the user's Apple account" : "received from the other participant"}
</chat_channel_instructions>`;

  const conversationContext = formatConversationContext(
    history,
    "Recent iMessage conversation"
  );

  let replyText = "";
  try {
    replyText = await generateRyoDirectReply({
      prompt,
      contextSections: [channelContext, conversationContext],
    });
  } catch (error) {
    logger.error("Failed to generate Ryo iMessage reply", error);
    logger.response(500, Date.now() - startTime);
    sendJson(res, 500, { error: "Failed to generate reply" });
    return;
  }

  if (!replyText) {
    logger.warn("Generated empty Ryo iMessage reply");
    logger.response(500, Date.now() - startTime);
    sendJson(res, 500, { error: "Generated empty reply" });
    return;
  }

  try {
    await sendBlueBubblesMessage({
      serverUrl,
      password: serverPassword,
      chatGuid: parsed.chatGuid,
      text: replyText,
      method:
        process.env.BLUEBUBBLES_SEND_METHOD === "apple-script"
          ? "apple-script"
          : "private-api",
    });
  } catch (error) {
    logger.error("Failed to send BlueBubbles reply", error);
    logger.response(502, Date.now() - startTime);
    sendJson(res, 502, { error: "Failed to send BlueBubbles reply" });
    return;
  }

  const timestamp = Date.now();
  await appendConversationMessage(redis, parsed.chatGuid, {
    role: "user",
    content: prompt,
    createdAt: timestamp,
  });
  await appendConversationMessage(redis, parsed.chatGuid, {
    role: "assistant",
    content: replyText,
    createdAt: timestamp,
  });
  await markMessageProcessed(redis, parsed.messageGuid);

  logger.info("BlueBubbles message handled", {
    chatGuid: parsed.chatGuid,
    messageGuid: parsed.messageGuid,
    promptLength: prompt.length,
    replyLength: replyText.length,
  });
  logger.response(200, Date.now() - startTime);
  sendJson(res, 200, {
    success: true,
    chatGuid: parsed.chatGuid,
    reply: replyText,
  });
}
