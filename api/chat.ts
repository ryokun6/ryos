import {
  consumeStream,
  generateText,
  smoothStream,
  validateUIMessages,
  type UIMessage,
} from "ai";
import { geolocation, waitUntil } from "@vercel/functions";
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
  getStoredUserRecord,
  getStoredUserTimeZone,
  updateStoredUserTimeZone,
} from "./_utils/auth/_user-record.js";
import { buildUserLocalTimeContext } from "./_utils/user-time-context.js";
import { isAssistantGreetingRequest } from "../src/shared/assistantGreeting.js";
import {
  AI_CONVERSATION_OPERATION_ID_MAX_LENGTH,
  type AIConversationRequestContext,
} from "../src/shared/contracts/aiConversation.js";
import type {
  AIConversationRealtimeEvent,
  AIConversationRealtimeTurn,
} from "../src/shared/contracts/aiConversationRealtime.js";
import {
  AIConversationError,
  beginAIConversationTurnWithStatus,
  commitAIConversationRegeneration,
  completeAIConversationTurn,
  getAIConversationModelMessages,
  getAIConversationRegenerationModelMessages,
  getAIConversationTurnCompletionOperationId,
  prepareAIConversationRegeneration,
  releaseAIConversationTurn,
  type BeginAIConversationTurnInput,
} from "./ai/conversations/_helpers/store.js";
import { extractPendingAIConversationResetMemory } from "./ai/conversations/_helpers/reset-memory.js";
import {
  broadcastAIConversationRealtimeEvent,
  forwardAIConversationRealtimeStream,
} from "./ai/conversations/_helpers/realtime.js";
import { resolveAIAttachmentsForModel } from "./ai/attachments/_helpers/store.js";
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
    operationId.length > AI_CONVERSATION_OPERATION_ID_MAX_LENGTH ||
    typeof revision !== "number" ||
    !Number.isSafeInteger(revision) ||
    revision < 0
  ) {
    return { ok: false };
  }
  return { ok: true, value: { id, revision, operationId } };
}

function overlayConversationAction(
  messages: UIMessage[],
  action: UIMessage | undefined
): UIMessage[] {
  if (!action) return messages;
  const existingIndex = messages.findIndex(
    (message) => message.id === action.id
  );
  if (existingIndex < 0) return [...messages, action];
  return messages.map((message, index) =>
    index === existingIndex ? action : message
  );
}

function isSimpleConversationMessage(
  value: unknown
): value is SimpleConversationMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const role = Reflect.get(value, "role");
  const id = Reflect.get(value, "id");
  const content = Reflect.get(value, "content");
  const parts = Reflect.get(value, "parts");
  return (
    typeof role === "string" &&
    (id === undefined || typeof id === "string") &&
    (content === undefined || typeof content === "string") &&
    (parts === undefined || Array.isArray(parts))
  );
}

async function validateChatUIMessages(
  messages: readonly unknown[]
): Promise<UIMessage[]> {
  try {
    return await validateUIMessages({ messages });
  } catch (error) {
    if (!messages.every(isSimpleConversationMessage)) throw error;
    return validateUIMessages({
      messages: ensureUIMessageFormat(messages),
    });
  }
}


// Node.js runtime configuration
export const runtime = "nodejs";
export const maxDuration = 80;

export default apiHandler<{
  messages?: unknown[];
  message?: unknown;
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
    let activeConversationTurn: {
      username: string;
      channel: "chat" | "assistant";
      id: string;
    } | null = null;
    let realtimeTurn: AIConversationRealtimeTurn | null = null;
    let realtimeTerminalEvent: AIConversationRealtimeEvent | null = null;
    let realtimeStreamConsumerAttached = false;
    const markRealtimeTurnFailed = () => {
      if (!realtimeTurn || realtimeTerminalEvent) return;
      realtimeTerminalEvent = {
        kind: "turn-finished",
        ...realtimeTurn,
        outcome: "failed",
      };
    };
    let removeGenerationAbortListeners: (() => void) | null = null;
    const clearGenerationAbortListeners = () => {
      const removeListeners = removeGenerationAbortListeners;
      removeGenerationAbortListeners = null;
      removeListeners?.();
    };
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
      message,
    } = req.body as {
      messages?: unknown[];
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
      message?: unknown;
    };

    // "assistant" switches to the desktop-assistant persona (no Ryo identity,
    // same tool access). Any other value falls back to the default Ryo chat.
    const conversationChannel: "chat" | "assistant" =
      persona === "assistant" ? "assistant" : "chat";

    // Use query parameter if available, otherwise use body parameter, otherwise use default
    const model = normalizeChatModel(queryModel || bodyModel || DEFAULT_MODEL);
    const normalizedTrigger =
      trigger === "regenerate-message"
        ? "regenerate-message"
        : "submit-message";
    if (
      trigger !== undefined &&
      trigger !== "submit-message" &&
      trigger !== "regenerate-message"
    ) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "invalid_chat_trigger" });
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
    const authToken = user?.token ?? null;
    const isAuthenticated = !!user;
    const identifier = isAuthenticated && username ? username : `anon:${ip}`;
    const requestAccount =
      isAuthenticated && username
        ? await getStoredUserRecord(redis, username)
        : null;
    const accountCreatedAt = requestAccount?.createdAt;

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

    const rawMessages = Array.isArray(messages) ? messages : null;
    let clientConversationMessages: UIMessage[] = [];
    let clientActionMessage: UIMessage | undefined;
    try {
      if (isAuthenticated && !isProactiveGreeting) {
        if (normalizedTrigger !== "regenerate-message") {
          const actionCandidate = message ?? rawMessages?.at(-1);
          if (!actionCandidate) {
            throw new Error("Missing conversation action");
          }
          [clientActionMessage] = await validateChatUIMessages([
            actionCandidate,
          ]);
        }
      } else {
        if (!rawMessages) {
          throw new Error("Missing messages");
        }
        clientConversationMessages = await validateChatUIMessages(rawMessages);
      }
    } catch (error) {
      logger.error("400 Error: Invalid chat messages", error);
      logger.response(400, Date.now() - startTime);
      res.setHeader("Access-Control-Allow-Origin", validOrigin);
      res.status(400).json({ error: "invalid_messages" });
      return;
    }

    const requestMessages = clientActionMessage
      ? [clientActionMessage]
      : clientConversationMessages;

    // Charge every regeneration and every anonymous generation except the
    // exact desktop-assistant greeting. Authenticated proactive greetings and
    // store-validated client-tool continuations retain their exemptions.
    const isAssistantGreeting =
      conversationChannel === "assistant" &&
      normalizedTrigger === "submit-message" &&
      requestMessages.length === 1 &&
      isAssistantGreetingRequest(
        requestMessages,
        { persona: "assistant" }
      );
    const isNewUserTurn =
      normalizedTrigger === "submit-message" &&
      requestMessages.at(-1)?.role === "user";
    const isAuthenticatedProactiveGreeting =
      isAuthenticated && isProactiveGreeting === true;
    const shouldRateLimit =
      normalizedTrigger === "regenerate-message" ||
      (!isAssistantGreeting &&
        !isAuthenticatedProactiveGreeting &&
        (!isAuthenticated || isNewUserTurn));
    if (shouldRateLimit) {
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
    if (isAuthenticated && username) {
      const pendingResetMemoryRetry =
        extractPendingAIConversationResetMemory({
          redis,
          username,
          channel: conversationChannel,
          log,
          logError,
        }).catch((error) => {
          logError("Pending reset memory extraction failed", error);
        });
      waitUntil(pendingResetMemoryRetry);
    }

    const conversationOperationId =
      parsedConversationContext.value?.operationId ?? crypto.randomUUID();
    const conversationCompletionOperationId =
      getAIConversationTurnCompletionOperationId(conversationOperationId);
    let storedConversation: Awaited<
      ReturnType<typeof beginAIConversationTurnWithStatus>
    >["document"] | null = null;
    let regenerationTargetMessageId: string | undefined;
    if (isAuthenticated && username && !isProactiveGreeting) {
      try {
        if (normalizedTrigger === "regenerate-message") {
          const preparedConversation = await prepareAIConversationRegeneration({
            redis,
            username,
            channel: conversationChannel,
            operationId: conversationOperationId,
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
          regenerationTargetMessageId =
            typeof messageId === "string" && messageId
              ? messageId
              : preparedConversation.messages.findLast(
                  (candidate) => candidate.role === "assistant"
                )?.id;
        }
        let action: BeginAIConversationTurnInput["action"];
        if (normalizedTrigger === "regenerate-message") {
          action = { kind: "regenerate" };
        } else if (clientActionMessage?.role === "user") {
          action = { kind: "user-message", message: clientActionMessage };
        } else if (clientActionMessage?.role === "assistant") {
          action = {
            kind: "assistant-continuation",
            message: clientActionMessage,
          };
        } else {
          logger.response(400, Date.now() - startTime);
          res.status(400).json({ error: "invalid_conversation_action" });
          return;
        }

        const beginResult = await beginAIConversationTurnWithStatus({
          redis,
          username,
          channel: conversationChannel,
          operationId: conversationOperationId,
          turnId: conversationOperationId,
          action,
          ...(parsedConversationContext.value
            ? {
                expectedConversationId:
                  parsedConversationContext.value.id,
                expectedRevision:
                  parsedConversationContext.value.revision,
              }
            : {}),
        });
        if (!beginResult.operationApplied) {
          logger.response(409, Date.now() - startTime);
          res.status(409).json({ error: "operation_replayed" });
          return;
        }
        storedConversation = beginResult.document;
        activeConversationTurn = {
          username,
          channel: conversationChannel,
          id: conversationOperationId,
        };
        realtimeTurn = {
          channel: conversationChannel,
          conversationId: storedConversation.id,
          revision: storedConversation.revision,
          operationId: conversationOperationId,
          trigger: normalizedTrigger,
          ...(normalizedTrigger === "regenerate-message" &&
          regenerationTargetMessageId
            ? { targetMessageId: regenerationTargetMessageId }
            : {}),
          startedAt: new Date().toISOString(),
        };
        await broadcastAIConversationRealtimeEvent(username, {
          kind: "turn-started",
          ...realtimeTurn,
        }).catch((error) => {
          logger.error("Failed to broadcast conversation turn start", error);
        });
      } catch (error) {
        if (error instanceof AIConversationError) {
          logger.response(error.status, Date.now() - startTime);
          res.status(error.status).json({ error: error.code });
          return;
        }
        throw error;
      }
    }

    const generationAbortController = new AbortController();
    let abortReleasePromise: Promise<void> | null = null;
    const releaseTurnAfterClientAbort = async () => {
      const turn = activeConversationTurn;
      if (!turn) return;
      let released = false;
      try {
        await releaseAIConversationTurn({
          redis,
          username: turn.username,
          channel: turn.channel,
          turnId: turn.id,
        });
        released = true;
      } catch (error) {
        logError("Failed to release disconnected conversation turn", error);
      } finally {
        markRealtimeTurnFailed();
        if (released && activeConversationTurn === turn) {
          activeConversationTurn = null;
        }
      }
    };
    const abortGeneration = () => {
      if (generationAbortController.signal.aborted) return;
      log("Client disconnected; aborting generation");
      generationAbortController.abort();
      clearGenerationAbortListeners();
      abortReleasePromise = releaseTurnAfterClientAbort();
    };
    const handleResponseClose = () => {
      if (res.writableEnded) {
        clearGenerationAbortListeners();
        return;
      }
      abortGeneration();
    };
    const requestSocket = req.socket;
    req.once("aborted", abortGeneration);
    res.once("close", handleResponseClose);
    requestSocket?.once("close", abortGeneration);
    removeGenerationAbortListeners = () => {
      req.off("aborted", abortGeneration);
      res.off("close", handleResponseClose);
      requestSocket?.off("close", abortGeneration);
    };
    if (
      req.aborted ||
      res.destroyed ||
      req.socket?.destroyed ||
      res.socket?.destroyed
    ) {
      abortGeneration();
    }
    if (generationAbortController.signal.aborted) {
      await abortReleasePromise;
      return;
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
            processDailyNotesForUser(
              redis,
              username,
              log,
              logError,
              effectiveUserTimeZone,
              accountCreatedAt
            ).catch((err: unknown) => {
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

    let modelConversationMessages = clientConversationMessages;
    if (storedConversation) {
      const canonicalMessages =
        normalizedTrigger === "regenerate-message"
          ? getAIConversationRegenerationModelMessages(
              storedConversation,
              regenerationTargetMessageId
            )
          : getAIConversationModelMessages(storedConversation);
      modelConversationMessages =
        normalizedTrigger === "regenerate-message"
          ? canonicalMessages
          : overlayConversationAction(
              canonicalMessages,
              clientActionMessage
            );
    }
    if (storedConversation && username) {
      modelConversationMessages = await resolveAIAttachmentsForModel({
        username,
        messages: modelConversationMessages,
      });
    }
    const preparedConversation = await prepareRyoConversationModelInput({
      channel: conversationChannel,
      messages: modelConversationMessages,
      systemState,
      username: isAuthenticated ? username : null,
      accountCreatedAt,
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
      abortSignal: generationAbortController.signal,
      experimental_transform: smoothStream({
        chunking: /[\u4E00-\u9FFF]|\S+\s+/,
      }),
    });

    res.setHeader("Access-Control-Allow-Origin", validOrigin);
    const originalMessages = modelConversationMessages;
    const activeRealtimeTurn = realtimeTurn;
    const consumeResponseStream =
      activeRealtimeTurn && username
        ? ({ stream }: { stream: ReadableStream<string> }) => {
            realtimeStreamConsumerAttached = true;
            const forwarding = forwardAIConversationRealtimeStream({
              stream,
              turn: activeRealtimeTurn,
              getTerminalEvent: () => realtimeTerminalEvent,
              publish: (event) =>
                broadcastAIConversationRealtimeEvent(username, event),
              onError: (error) => {
                logger.error(
                  "Failed to forward conversation realtime stream",
                  error
                );
              },
              onStreamError: async () => {
                await releaseTurnAfterClientAbort();
                markRealtimeTurnFailed();
              },
            });
            waitUntil(forwarding);
            return forwarding;
          }
        : consumeStream;
    result.pipeUIMessageStreamToResponse(res, {
      status: 200,
      originalMessages,
      generateMessageId: () => crypto.randomUUID(),
      consumeSseStream: consumeResponseStream,
      onFinish: async ({ responseMessage, isAborted, finishReason }) => {
        try {
          if (!storedConversation || !isAuthenticated || !username) {
            return;
          }
          if (isAborted || !finishReason || finishReason === "error") {
            await releaseTurnAfterClientAbort();
            markRealtimeTurnFailed();
            return;
          }

          let completedConversation: Awaited<
            ReturnType<typeof completeAIConversationTurn>
          >;
          if (normalizedTrigger === "regenerate-message") {
            completedConversation = await commitAIConversationRegeneration({
              redis,
              username,
              channel: conversationChannel,
              responseMessage,
              operationId: conversationCompletionOperationId,
              turnId: conversationOperationId,
              expectedConversationId: storedConversation.id,
              expectedRevision: storedConversation.revision,
              ...(regenerationTargetMessageId
                ? { targetMessageId: regenerationTargetMessageId }
                : {}),
            });
          } else {
            completedConversation = await completeAIConversationTurn({
              redis,
              username,
              channel: conversationChannel,
              responseMessage,
              operationId: conversationCompletionOperationId,
              expectedConversationId: storedConversation.id,
              expectedRevision: storedConversation.revision,
              turnId: conversationOperationId,
            });
          }
          if (realtimeTurn) {
            realtimeTerminalEvent = {
              kind: "turn-finished",
              ...realtimeTurn,
              conversationId: completedConversation.id,
              revision: completedConversation.revision,
              outcome: "completed",
            };
          }
          activeConversationTurn = null;
        } catch (error) {
          logError("Failed to persist completed conversation response", error);
          await releaseAIConversationTurn({
            redis,
            username,
            channel: conversationChannel,
            turnId: conversationOperationId,
          }).catch(() => {});
          markRealtimeTurnFailed();
          activeConversationTurn = null;
        } finally {
          clearGenerationAbortListeners();
        }
      },
    });
  } catch (error) {
    clearGenerationAbortListeners();
    if (activeConversationTurn) {
      await releaseAIConversationTurn({
        redis,
        username: activeConversationTurn.username,
        channel: activeConversationTurn.channel,
        turnId: activeConversationTurn.id,
      }).catch(() => {});
      activeConversationTurn = null;
    }
    markRealtimeTurnFailed();
    if (
      !realtimeStreamConsumerAttached &&
      realtimeTerminalEvent &&
      username
    ) {
      await broadcastAIConversationRealtimeEvent(
        username,
        realtimeTerminalEvent
      ).catch((broadcastError) => {
        logger.error(
          "Failed to broadcast conversation turn failure",
          broadcastError
        );
      });
    }
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
