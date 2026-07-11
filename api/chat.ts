import {
  consumeStream,
  smoothStream,
  validateUIMessages,
  type UIMessage,
} from "ai";
import { waitUntil } from "./_utils/_background.js";
import {
  DEFAULT_MODEL,
  SUPPORTED_AI_MODELS,
  type SupportedModel,
} from "./_utils/_aiModels.js";
import {
  loadRyoMemoryContext,
  prepareRyoConversationModelInput,
  ensureUIMessageFormat,
  normalizeExecutedToolApprovals,
  type RyoConversationSystemState,
  type SimpleConversationMessage,
} from "./_utils/ryo-conversation.js";
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
import { isAssistantGreetingRequest } from "../src/shared/assistantGreeting.js";
import {
  AI_CONVERSATION_OPERATION_ID_MAX_LENGTH,
  type AIConversationRequestContext,
} from "../src/shared/contracts/aiConversation.js";
import {
  AIConversationError,
  beginAIConversationTurn,
  commitAIConversationRegeneration,
  completeAIConversationTurn,
  getAIConversationModelMessages,
  getAIConversationRegenerationModelMessages,
  getAIConversationTurnCompletionOperationId,
  type BeginAIConversationTurnInput,
} from "./ai/conversations/_helpers/store.js";
import { broadcastAIConversationUpdate } from "./ai/conversations/_helpers/realtime.js";
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
  rawMessages: readonly unknown[]
): Promise<UIMessage[]> {
  // Executed tool parts can arrive with their approval response stripped by
  // a client hydration race; execution implies approval, so repair instead
  // of rejecting the whole request as invalid_messages.
  const messages = normalizeExecutedToolApprovals(rawMessages);
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

export default apiHandler<{
  messages?: unknown[];
  message?: unknown;
  systemState?: SystemState;
  model?: string;
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
    let removeGenerationAbortListeners: (() => void) | null = null;
    const clearGenerationAbortListeners = () => {
      const removeListeners = removeGenerationAbortListeners;
      removeGenerationAbortListeners = null;
      removeListeners?.();
    };
    try {
    // Parse query string to get model parameter
    // Handle both full URLs and relative paths
    const url = new URL(req.url || "/", "http://localhost");
    const queryModel = url.searchParams.get("model") as SupportedModel | null;

    const {
      messages,
      systemState: incomingSystemState, // still passed for dynamic prompt generation but NOT for auth
      model: bodyModel = DEFAULT_MODEL,
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
      if (isAuthenticated) {
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
    // exact desktop-assistant greeting. Store-validated client-tool
    // continuations retain their exemption.
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
    const shouldRateLimit =
      normalizedTrigger === "regenerate-message" ||
      (!isAssistantGreeting && (!isAuthenticated || isNewUserTurn));
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

        const windowLabel = isAuthenticated
          ? "this 5-hour window"
          : "the last 24 hours";
        const errorResponse = {
          error: "rate_limit_exceeded",
          isAuthenticated,
          count: rateLimitResult.count,
          limit: rateLimitResult.limit,
          message: `You've hit your limit of ${rateLimitResult.limit} messages in ${windowLabel}. Please wait a while and try again.`,
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

    const conversationOperationId =
      parsedConversationContext.value?.operationId ?? crypto.randomUUID();
    const conversationCompletionOperationId =
      getAIConversationTurnCompletionOperationId(conversationOperationId);
    let storedConversation: Awaited<
      ReturnType<typeof beginAIConversationTurn>
    >["document"] | null = null;
    if (isAuthenticated && username) {
      try {
        let action: BeginAIConversationTurnInput["action"];
        if (normalizedTrigger === "regenerate-message") {
          action = {
            kind: "regenerate",
            ...(typeof messageId === "string" && messageId
              ? { targetMessageId: messageId }
              : {}),
          };
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

        const beginResult = await beginAIConversationTurn({
          redis,
          username,
          channel: conversationChannel,
          operationId: conversationOperationId,
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
        // Regeneration doesn't change stored content until it completes.
        if (normalizedTrigger !== "regenerate-message") {
          waitUntil(
            broadcastAIConversationUpdate({
              username,
              channel: conversationChannel,
              conversationId: beginResult.document.id,
              revision: beginResult.document.revision,
              reason: "turn-begin",
              operationId: conversationOperationId,
            })
          );
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

    // Stop token generation as soon as the client goes away. There is no
    // conversation turn state to release: an aborted turn simply leaves the
    // already-persisted user message in place.
    const generationAbortController = new AbortController();
    const abortGeneration = () => {
      if (generationAbortController.signal.aborted) return;
      log("Client disconnected; aborting generation");
      generationAbortController.abort();
      clearGenerationAbortListeners();
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
      return;
    }

    // --- Geolocation + timezone (independent; start both early) ---
    // Resolve an approximate location from the client IP via a free
    // IP-geolocation provider (`ipwho.is` by default, overridable via
    // `IP_GEOLOCATION_URL_TEMPLATE`). Results are cached in Redis for 24h so
    // we don't hammer the provider per chat turn.
    const userTimeZone = incomingSystemState?.userLocalTime?.timeZone;
    const geoPromise = resolveIpGeolocation({
      ip,
      redis,
      log,
      logError,
    });
    const storedTzPromise =
      !userTimeZone && isAuthenticated && username
        ? getStoredUserTimeZone(redis, username)
        : Promise.resolve(null);

    const [resolvedGeoRaw, storedUserTimeZone] = await Promise.all([
      geoPromise,
      storedTzPromise,
    ]);
    const resolvedGeo = resolvedGeoRaw ?? {};

    // Attach geolocation info to system state that will be sent to the prompt
    const systemState: SystemState | undefined = incomingSystemState
      ? { ...incomingSystemState, requestGeo: resolvedGeo }
      : ({ requestGeo: resolvedGeo } as SystemState);
    if (isAuthenticated && username && userTimeZone) {
      void updateStoredUserTimeZone(redis, username, userTimeZone).catch((error) => {
        logError("Failed to update user timezone from chat system state", error);
      });
    }
    const effectiveUserTimeZone = userTimeZone || storedUserTimeZone || undefined;

    let modelConversationMessages = clientConversationMessages;
    if (storedConversation) {
      const canonicalMessages =
        normalizedTrigger === "regenerate-message"
          ? getAIConversationRegenerationModelMessages(
              storedConversation,
              typeof messageId === "string" ? messageId : undefined
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

    // Memory load and attachment resolution are independent once timezone +
    // conversation messages are known — run them in parallel.
    const memoryPromise = loadRyoMemoryContext({
      redis: isAuthenticated ? redis : undefined,
      username: isAuthenticated ? username : null,
      timeZone: effectiveUserTimeZone,
      log,
      logError,
    });
    const attachmentsPromise =
      storedConversation && username
        ? resolveAIAttachmentsForModel({
            username,
            messages: modelConversationMessages,
          })
        : Promise.resolve(modelConversationMessages);

    const [loadedMemoryContext, resolvedMessages] = await Promise.all([
      memoryPromise,
      attachmentsPromise,
    ]);
    modelConversationMessages = resolvedMessages;

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
    const {
      enrichedMessages,
      loadedSections,
      staticSystemPrompt,
      instructions,
      dynamicContextMessages,
    } = preparedConversation;

    log(
      `Context-aware prompts (${
        loadedSections.length
      } sections): ${loadedSections.join(", ")}`
    );
    const approxTokens = staticSystemPrompt.length / 4;
    log(`Approximate prompt tokens: ${Math.round(approxTokens)}`);

    // Log message structure without retaining transcript content.
    const instructionContent =
      typeof instructions.content === "string"
        ? instructions.content
        : JSON.stringify(instructions.content);
    log(`Static instructions, ${instructionContent.length} chars`);
    dynamicContextMessages.forEach((msg, index) => {
      const contentStr =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      log(`Dynamic context ${index} [${msg.role}], ${contentStr.length} chars`);
    });
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
    result.pipeUIMessageStreamToResponse(res, {
      status: 200,
      originalMessages,
      generateMessageId: () => crypto.randomUUID(),
      consumeSseStream: consumeStream,
      onEnd: async ({ responseMessage, isAborted, finishReason }) => {
        try {
          if (!storedConversation || !isAuthenticated || !username) {
            return;
          }
          if (isAborted || finishReason === "error") {
            return;
          }

          let completedDocument;
          if (normalizedTrigger === "regenerate-message") {
            completedDocument = await commitAIConversationRegeneration({
              redis,
              username,
              channel: conversationChannel,
              responseMessage,
              operationId: conversationCompletionOperationId,
              expectedConversationId: storedConversation.id,
              expectedRevision: storedConversation.revision,
              ...(typeof messageId === "string" && messageId
                ? { targetMessageId: messageId }
                : {}),
            });
          } else {
            completedDocument = await completeAIConversationTurn({
              redis,
              username,
              channel: conversationChannel,
              responseMessage,
              operationId: conversationCompletionOperationId,
              expectedConversationId: storedConversation.id,
            });
          }
          waitUntil(
            broadcastAIConversationUpdate({
              username,
              channel: conversationChannel,
              conversationId: completedDocument.id,
              revision: completedDocument.revision,
              reason: "turn-complete",
              operationId: conversationOperationId,
            })
          );
        } catch (error) {
          logError("Failed to persist completed conversation response", error);
        } finally {
          clearGenerationAbortListeners();
        }
      },
    });
  } catch (error) {
    clearGenerationAbortListeners();
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
