import {
  consumeStream,
  generateText,
  smoothStream,
} from "ai";
import { geolocation } from "@vercel/functions";
import { google } from "@ai-sdk/google";
import {
  DEFAULT_MODEL,
  SUPPORTED_AI_MODELS,
  type SupportedModel,
} from "./_utils/_aiModels.js";
import {
  getUnprocessedDailyNotesExcludingToday,
} from "./_utils/_memory.js";
import {
  loadRyoMemoryContext,
  prepareRyoConversationModelInput,
  ensureUIMessageFormat,
  type RyoConversationSystemState,
  type SimpleConversationMessage,
} from "./_utils/ryo-conversation.js";
import { PROACTIVE_GREETING_INSTRUCTIONS } from "./_utils/_aiPrompts.js";
import {
  checkAndIncrementAIMessageCount,
  getClientIp,
} from "./_utils/_rate-limit.js";
import { apiHandler } from "./_utils/api-handler.js";
import { getHeader } from "./_utils/request-helpers.js";
import { resolveIpGeolocation } from "./_utils/_geolocation.js";
import { createRyoToolLoopAgent } from "./_utils/ryo-agent.js";
import {
  getStoredUserTimeZone,
  updateStoredUserTimeZone,
} from "./_utils/auth/_user-record.js";
import { buildUserLocalTimeContext } from "./_utils/user-time-context.js";
import { isAssistantGreetingRequest } from "../src/shared/assistantGreeting.js";
import type { AIConversationRequestContext } from "../src/shared/contracts/aiConversation.js";
import {
  AIConversationError,
  commitAIConversationRegeneration,
  getAIConversationModelMessages,
  getAIConversationRegenerationModelMessages,
  prepareAIConversationRegeneration,
  syncAIConversationMessages,
} from "./ai/conversations/_helpers/store.js";
type SystemState = RyoConversationSystemState;

const CHAT_MODEL_ALIASES: Record<string, SupportedModel> = {
  "claude-sonnet": "sonnet-4.6",
};

function normalizeChatModel(model: string): string {
  return CHAT_MODEL_ALIASES[model] ?? model;
}

type ConversationContextParseResult =
  | { ok: true; value: AIConversationRequestContext | null }
  | { ok: false };

function parseConversationContext(
  value: unknown
): ConversationContextParseResult {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false };
  }
  const id = Reflect.get(value, "id");
  const revision = Reflect.get(value, "revision");
  const operationId = Reflect.get(value, "operationId");
  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id
    ) ||
    typeof operationId !== "string" ||
    operationId.length < 1 ||
    operationId.length > 160 ||
    typeof revision !== "number" ||
    !Number.isSafeInteger(revision) ||
    revision < 0
  ) {
    return { ok: false };
  }
  return { ok: true, value: { id, revision, operationId } };
}

function requiresRichClientContext(messages: readonly unknown[]): boolean {
  const last = messages.at(-1);
  if (!last || typeof last !== "object" || Array.isArray(last)) return false;
  const role = Reflect.get(last, "role");
  const parts = Reflect.get(last, "parts");
  if (!Array.isArray(parts)) return false;

  return parts.some((part) => {
    if (!part || typeof part !== "object" || Array.isArray(part)) return false;
    const type = Reflect.get(part, "type");
    if (typeof type !== "string") return false;
    return role === "user" ? type !== "text" : type.startsWith("tool-");
  });
}


// Node.js runtime configuration
export const runtime = "nodejs";
export const maxDuration = 80;

export default apiHandler<{
  messages: unknown[];
  systemState?: SystemState;
  model?: string;
  proactiveGreeting?: boolean;
  persona?: string;
  assistantName?: string;
  assistantResponseStyle?: string;
  assistantInstructions?: string;
  conversation?: unknown;
  trigger?: string;
  messageId?: string;
}>(
  {
    methods: ["POST"],
    auth: "optional",
    parseJsonBody: true,
    contentType: null,
  },
  async ({ req, res, redis, logger, startTime, origin, user }) => {
    const validOrigin = origin || "http://localhost";
    try {
    // Parse query string to get model parameter
    // Handle both full URLs and relative paths (vercel dev uses relative paths)
    const url = new URL(req.url || "/", "http://localhost");
    const queryModel = url.searchParams.get("model") as SupportedModel | null;

    const {
      messages,
      systemState: incomingSystemState, // still passed for dynamic prompt generation but NOT for auth
      model: bodyModel = DEFAULT_MODEL,
      proactiveGreeting: isProactiveGreeting,
      persona,
      assistantName,
      assistantResponseStyle,
      assistantInstructions,
      conversation,
      trigger,
      messageId,
    } = req.body as {
      messages: unknown[];
      systemState?: SystemState;
      model?: string;
      proactiveGreeting?: boolean;
      persona?: string;
      assistantName?: string;
      assistantResponseStyle?: string;
      assistantInstructions?: string;
      conversation?: unknown;
      trigger?: string;
      messageId?: string;
    };

    // "assistant" switches to the desktop-assistant persona (no Ryo identity,
    // same tool access). Any other value falls back to the default Ryo chat.
    const conversationChannel: "chat" | "assistant" =
      persona === "assistant" ? "assistant" : "chat";

    // Use query parameter if available, otherwise use body parameter, otherwise use default
    const model = normalizeChatModel(queryModel || bodyModel || DEFAULT_MODEL);

    if (!messages || !Array.isArray(messages)) {
      logger.error("400 Error: Invalid messages format", { messages });
      logger.response(400, Date.now() - startTime);
      res.setHeader("Access-Control-Allow-Origin", validOrigin);
      res.status(400).send("Invalid messages format");
      return;
    }

    // ---------------------------
    // Extract auth headers FIRST so we can use username for logging
    // ---------------------------

    const headerUsernameInitial = getHeader(req, "x-username");

    // Helper: prefix log lines with username (for easier tracing)
    const usernameForLogs = user?.username ?? headerUsernameInitial ?? "unknown";
    const log = (...args: unknown[]) =>
      logger.info(`[User: ${usernameForLogs}]`, args);
    const logError = (...args: unknown[]) =>
      logger.error(`[User: ${usernameForLogs}]`, args);

    const ip = getClientIp(req);

    log(`Request origin: ${validOrigin}, IP: ${ip}`);

    const username = user?.username ?? null;
    const authToken: string | undefined = user?.token;
    const isAuthenticated = !!user;
    const identifier = isAuthenticated && username ? username : `anon:${ip}`;

    // Only check rate limits for user messages (not system messages).
    // Automatic desktop-assistant greetings are exempt so opening the bubble
    // does not burn the anonymous daily AI budget.
    const userMessages = (messages as Array<{ role: string }>).filter(
      (m) => m.role === "user"
    );
    const isAssistantGreeting =
      conversationChannel === "assistant" &&
      isAssistantGreetingRequest(
        messages as Array<{
          role: string;
          content?: string;
          parts?: Array<{ type: string; text?: string }>;
        }>,
        { persona: "assistant" }
      );
    if (userMessages.length > 0 && !isAssistantGreeting) {
      const rateLimitResult = await checkAndIncrementAIMessageCount(
        identifier,
        isAuthenticated,
        authToken
      );

      if (!rateLimitResult.allowed) {
        log(
          `Rate limit exceeded: ${identifier} (${rateLimitResult.count}/${rateLimitResult.limit})`
        );

        const errorResponse = {
          error: "rate_limit_exceeded",
          isAuthenticated,
          count: rateLimitResult.count,
          limit: rateLimitResult.limit,
          message: `You've hit your limit of ${rateLimitResult.limit} messages in this 5-hour window. Please wait a few hours and try again.`,
        };

        res.status(429).json(errorResponse);
        return;
      }

      log(
        `Rate limit check passed: ${identifier} (${rateLimitResult.count}/${rateLimitResult.limit})`
      );
    }

    log(
      `Using model: ${model || DEFAULT_MODEL} (${
        queryModel ? "from query" : model ? "from body" : "using default"
      })`
    );
    if (model !== null && !SUPPORTED_AI_MODELS.includes(model as SupportedModel)) {
      logError(`400 Error: Unsupported model - ${model}`);
      res.status(400).send(`Unsupported model: ${model}`);
      return;
    }

    const parsedConversationContext = parseConversationContext(conversation);
    if (!parsedConversationContext.ok) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "invalid_conversation_context" });
      return;
    }
    if (parsedConversationContext.value && (!isAuthenticated || !username)) {
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "conversation_auth_required" });
      return;
    }

    const conversationOperationId =
      parsedConversationContext.value?.operationId ?? crypto.randomUUID();
    let storedConversation: Awaited<
      ReturnType<typeof syncAIConversationMessages>
    > | null = null;
    if (isAuthenticated && username && !isProactiveGreeting) {
      try {
        if (trigger === "regenerate-message") {
          storedConversation = await prepareAIConversationRegeneration({
            redis,
            username,
            channel: conversationChannel,
            operationId: `regenerate:${conversationOperationId}`,
            ...(parsedConversationContext.value
              ? {
                  expectedConversationId:
                    parsedConversationContext.value.id,
                  expectedRevision:
                    parsedConversationContext.value.revision,
                }
              : {}),
            ...(typeof messageId === "string" && messageId
              ? { targetMessageId: messageId }
              : {}),
          });
        } else {
          storedConversation = await syncAIConversationMessages({
            redis,
            username,
            channel: conversationChannel,
            messages,
            operationId: `request:${conversationOperationId}`,
            ...(parsedConversationContext.value
              ? {
                  expectedConversationId:
                    parsedConversationContext.value.id,
                  expectedRevision:
                    parsedConversationContext.value.revision,
                }
              : {}),
          });
        }
      } catch (error) {
        if (error instanceof AIConversationError) {
          logger.response(error.status, Date.now() - startTime);
          res.status(error.status).json({ error: error.code });
          return;
        }
        throw error;
      }
    }

    // --- Geolocation ---
    // 1) Try Vercel's `geolocation()` first — instant, no outbound call.
    //    Requires Web Request headers, so this throws in `vercel dev` and any
    //    non-Vercel host (Coolify, Docker, plain Bun, etc.).
    // 2) Fall back to a free IP-geolocation provider (`ipwho.is` by default,
    //    overridable via `IP_GEOLOCATION_URL_TEMPLATE`). Results are cached in
    //    Redis for 24h so we don't hammer the provider per chat turn.
    let geo: ReturnType<typeof geolocation> = {};
    try {
      geo = geolocation(req as unknown as Request);
    } catch {
      geo = {};
    }

    const resolvedGeo =
      (await resolveIpGeolocation({
        ip,
        redis,
        existing: geo,
        log,
        logError,
      })) ?? geo;

    // Attach geolocation info to system state that will be sent to the prompt
    const systemState: SystemState | undefined = incomingSystemState
      ? { ...incomingSystemState, requestGeo: resolvedGeo }
      : ({ requestGeo: resolvedGeo } as SystemState);
    const userTimeZone = systemState?.userLocalTime?.timeZone;
    if (isAuthenticated && username && userTimeZone) {
      await updateStoredUserTimeZone(redis, username, userTimeZone).catch((error) => {
        logError("Failed to update user timezone from chat system state", error);
      });
    }
    const storedUserTimeZone =
      !userTimeZone && isAuthenticated && username
        ? await getStoredUserTimeZone(redis, username)
        : null;
    const effectiveUserTimeZone = userTimeZone || storedUserTimeZone || undefined;
    const loadedMemoryContext = await loadRyoMemoryContext({
      redis: isAuthenticated ? redis : undefined,
      username: isAuthenticated ? username : null,
      timeZone: effectiveUserTimeZone,
      log,
      logError,
    });

    // -------------------------------------------------------------
    // Proactive greeting mode – streamed text response
    // Only for authenticated users with memories available
    // -------------------------------------------------------------
    if (isProactiveGreeting && username && isAuthenticated) {
      log("Proactive greeting requested");

      // Background: process past daily notes into long-term memory (fire-and-forget)
      // Only triggered on proactive greetings (once per session) to avoid
      // redundant checks on every chat message.
      try {
        getUnprocessedDailyNotesExcludingToday(redis, username, 7, effectiveUserTimeZone).then(async (unprocessedNotes) => {
          if (unprocessedNotes.length > 0) {
            log(`[DailyNotes] Found ${unprocessedNotes.length} unprocessed past daily notes for ${username}, triggering background processing`);
            const { processDailyNotesForUser } = await import("./ai/process-daily-notes.js");
            processDailyNotesForUser(redis, username, log, logError, effectiveUserTimeZone).catch((err: unknown) => {
              logError("[DailyNotes] Background processing failed (non-blocking):", err);
            });
          }
        }).catch(() => {});
      } catch { /* non-blocking */ }

      // Build memory context
      let greetingMemoryContext = "";
      if (
        loadedMemoryContext.userMemories &&
        loadedMemoryContext.userMemories.memories.length > 0
      ) {
        greetingMemoryContext += "## User's long-term memories:\n";
        for (const mem of loadedMemoryContext.userMemories.memories) {
          greetingMemoryContext += `- ${mem.key}: ${mem.summary}\n`;
        }
      }
      if (loadedMemoryContext.dailyNotesText) {
        greetingMemoryContext += `\n## Recent daily notes:\n${loadedMemoryContext.dailyNotesText}\n`;
      }

      // If no memories, return null (client will keep the generic greeting)
      if (!greetingMemoryContext) {
        log("No memories available for proactive greeting");
        res.status(200).json({ greeting: null, reason: "no memories available" });
        return;
      }

      const now = new Date();
      const localTimeContext =
        buildUserLocalTimeContext(effectiveUserTimeZone, now) ||
        buildUserLocalTimeContext("America/Los_Angeles", now);
      const timeContext = localTimeContext
        ? `${localTimeContext.dateString} ${localTimeContext.timeString} (${localTimeContext.timeZone})`
        : now.toISOString();

      try {
        const greetingDynamicContext = `It's ${timeContext}. The user's name is "${username}".

${greetingMemoryContext}

Generate ONE short proactive greeting. Pick one interesting angle from the context — a recent topic, a memory, something timely — and use it naturally. Don't try to cover everything.`;

        const { text, finishReason } = await generateText({
          model: google("gemini-3-flash-preview"),
          temperature: 1,
          maxOutputTokens: 2000,
          messages: [
            {
              role: "system" as const,
              content: PROACTIVE_GREETING_INSTRUCTIONS,
            },
            {
              role: "system" as const,
              content: greetingDynamicContext,
            },
            {
              role: "user" as const,
              content: "Generate a proactive greeting.",
            },
          ],
        });

        const greeting = text.trim();
        log(`Generated proactive greeting (${greeting.length} chars, finishReason=${finishReason}): "${greeting}"`);

        res.setHeader("Access-Control-Allow-Origin", validOrigin);
        res.status(200).json({ greeting });
        return;
      } catch (greetingErr) {
        logError("Failed to generate proactive greeting", greetingErr);
        res.status(200).json({ greeting: null, reason: "generation failed" });
        return;
      }
    }

    const clientConversationMessages = messages as SimpleConversationMessage[];
    let modelConversationMessages = clientConversationMessages;
    if (storedConversation && !requiresRichClientContext(messages)) {
      modelConversationMessages =
        trigger === "regenerate-message"
          ? getAIConversationRegenerationModelMessages(
              storedConversation,
              typeof messageId === "string" ? messageId : undefined
            )
          : getAIConversationModelMessages(storedConversation);
      const latestClientMessage = clientConversationMessages.at(-1);
      const latestStoredMessage = modelConversationMessages.at(-1);
      if (
        latestClientMessage?.role === "user" &&
        latestStoredMessage?.id === latestClientMessage.id
      ) {
        modelConversationMessages = [
          ...modelConversationMessages.slice(0, -1),
          latestClientMessage,
        ];
      }
    }
    const preparedConversation = await prepareRyoConversationModelInput({
      channel: conversationChannel,
      messages: modelConversationMessages,
      systemState,
      username: isAuthenticated ? username : null,
      model: model as SupportedModel,
      redis: isAuthenticated ? redis : undefined,
      log,
      logError,
      preloadedMemoryContext: loadedMemoryContext,
      ...(conversationChannel === "assistant"
        ? {
            ...(typeof assistantName === "string" ? { assistantName } : {}),
            ...(typeof assistantResponseStyle === "string"
              ? { assistantResponseStyle }
              : {}),
            ...(typeof assistantInstructions === "string"
              ? { assistantInstructions }
              : {}),
          }
        : {}),
    });
    const { enrichedMessages, loadedSections, staticSystemPrompt } =
      preparedConversation;

    log(
      `Context-aware prompts (${
        loadedSections.length
      } sections): ${loadedSections.join(", ")}`
    );
    const approxTokens = staticSystemPrompt.length / 4;
    log(`Approximate prompt tokens: ${Math.round(approxTokens)}`);

    // Log message structure without retaining transcript content.
    enrichedMessages.forEach((msg, index) => {
      const contentStr =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      log(`Message ${index} [${msg.role}], ${contentStr.length} chars`);
    });

    const agent = createRyoToolLoopAgent({
      preset: "chat",
      prepared: preparedConversation,
    });

    const result = await agent.stream({
      messages: enrichedMessages,
      experimental_transform: smoothStream({
        chunking: /[\u4E00-\u9FFF]|\S+\s+/,
      }),
    });

    res.setHeader("Access-Control-Allow-Origin", validOrigin);
    const originalMessages = ensureUIMessageFormat(clientConversationMessages);
    result.pipeUIMessageStreamToResponse(res, {
      status: 200,
      originalMessages,
      generateMessageId: () => crypto.randomUUID(),
      consumeSseStream: consumeStream,
      onFinish: async ({ messages: completedMessages, isAborted }) => {
        if (
          isAborted ||
          !storedConversation ||
          !isAuthenticated ||
          !username
        ) {
          return;
        }

        try {
          if (trigger === "regenerate-message") {
            await commitAIConversationRegeneration({
              redis,
              username,
              channel: conversationChannel,
              messages: completedMessages,
              operationId: `response:${conversationOperationId}`,
              expectedConversationId: storedConversation.id,
              expectedRevision: storedConversation.revision,
              ...(typeof messageId === "string" && messageId
                ? { targetMessageId: messageId }
                : {}),
            });
          } else {
            await syncAIConversationMessages({
              redis,
              username,
              channel: conversationChannel,
              messages: completedMessages,
              operationId: `response:${conversationOperationId}`,
              expectedConversationId: storedConversation.id,
              expectedRevision: storedConversation.revision,
            });
          }
        } catch (error) {
          logError("Failed to persist completed conversation response", error);
        }
      },
    });
  } catch (error) {
    logger.error("Chat API error", error);

    if (validOrigin) {
      res.setHeader("Access-Control-Allow-Origin", validOrigin);
    }
    res.setHeader("Content-Type", "application/json");

    if (error instanceof SyntaxError) {
      logger.error(`Invalid JSON`, error.message);
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Bad Request", message: `Invalid JSON - ${error.message}` });
      return;
    }

    logger.response(500, Date.now() - startTime);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
);
