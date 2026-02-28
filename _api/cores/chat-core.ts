import { streamText, smoothStream, convertToModelMessages, stepCountIs } from "ai";
import { Redis } from "@upstash/redis";
import {
  SupportedModel,
  DEFAULT_MODEL,
  getModelInstance,
  SUPPORTED_AI_MODELS,
} from "../_utils/_aiModels.js";
import { getMemoryIndex, getDailyNotesForPrompt, type MemoryIndex } from "../_utils/_memory.js";
import { checkAndIncrementAIMessageCount } from "../_utils/_rate-limit.js";
import { validateAuth } from "../_utils/auth/index.js";
import { createChatTools } from "../chat/tools/index.js";
import { executeChatProactiveGreetingCore } from "./chat-proactive-greeting-core.js";
import {
  ensureUIMessageFormat,
  type SimpleMessage,
  type SystemState,
  CACHE_CONTROL_OPTIONS,
  generateDynamicSystemPrompt,
  buildContextAwarePrompts,
} from "./chat-prompt-core.js";
import type { CoreResponse } from "../_runtime/core-types.js";

function getHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | null {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] || null;
  return typeof value === "string" ? value : null;
}

interface LoggerLike {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export type ChatCoreResult =
  | { kind: "response"; response: CoreResponse; responseType?: "json" | "text" }
  | { kind: "stream"; stream: ReturnType<typeof streamText> };

interface ChatCoreInput {
  url?: string;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  origin: string;
  requestGeo?: SystemState["requestGeo"];
  redis: Redis;
  logger: LoggerLike;
}

export async function executeChatCore(input: ChatCoreInput): Promise<ChatCoreResult> {
  try {
    const url = new URL(input.url || "/", "http://localhost");
    const queryModel = url.searchParams.get("model") as SupportedModel | null;

    const {
      messages,
      systemState: incomingSystemState,
      model: bodyModel = DEFAULT_MODEL,
      proactiveGreeting: isProactiveGreeting,
    } = input.body as {
      messages: unknown[];
      systemState?: SystemState;
      model?: string;
      proactiveGreeting?: boolean;
    };

    const model = queryModel || bodyModel || DEFAULT_MODEL;

    const authHeaderInitial = getHeader(input.headers, "authorization");
    const headerAuthTokenInitial =
      authHeaderInitial && authHeaderInitial.startsWith("Bearer ")
        ? authHeaderInitial.substring(7)
        : null;
    const headerUsernameInitial = getHeader(input.headers, "x-username");

    const usernameForLogs = headerUsernameInitial ?? "unknown";
    const log = (...args: unknown[]) => input.logger.info(`[User: ${usernameForLogs}]`, args);
    const logError = (...args: unknown[]) => input.logger.error(`[User: ${usernameForLogs}]`, args);

    const isLocalDev =
      input.origin?.startsWith("http://localhost") ||
      input.origin?.startsWith("http://127.0.0.1") ||
      input.origin?.includes("100.110.251.60");
    const ip = isLocalDev
      ? "localhost-dev"
      : getHeader(input.headers, "x-vercel-forwarded-for") ||
        getHeader(input.headers, "x-forwarded-for")?.split(",")[0].trim() ||
        getHeader(input.headers, "x-real-ip") ||
        "unknown-ip";

    log(`Request origin: ${input.origin}, IP: ${ip}`);

    const headerAuthToken = headerAuthTokenInitial ?? undefined;
    const headerUsername = headerUsernameInitial;
    const username = headerUsername || null;
    const authToken: string | undefined = headerAuthToken;

    const validationResult = await validateAuth(input.redis, username, authToken, {
      allowExpired: true,
      refreshOnGrace: false,
    });

    if (username && !validationResult.valid) {
      return {
        kind: "response",
        response: {
          status: 401,
          body: {
            error: "authentication_failed",
            message: "Invalid or missing authentication token",
          },
        },
      };
    }

    const isAuthenticated = validationResult.valid;
    const identifier = isAuthenticated && username ? username.toLowerCase() : `anon:${ip}`;

    const userMessages = (messages as Array<{ role: string }>).filter((m) => m.role === "user");
    if (userMessages.length > 0) {
      const rateLimitResult = await checkAndIncrementAIMessageCount(
        identifier,
        isAuthenticated,
        authToken
      );

      if (!rateLimitResult.allowed) {
        log(
          `Rate limit exceeded: ${identifier} (${rateLimitResult.count}/${rateLimitResult.limit})`
        );
        return {
          kind: "response",
          response: {
            status: 429,
            body: {
              error: "rate_limit_exceeded",
              isAuthenticated,
              count: rateLimitResult.count,
              limit: rateLimitResult.limit,
              message: `You've hit your limit of ${rateLimitResult.limit} messages in this 5-hour window. Please wait a few hours and try again.`,
            },
          },
        };
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

    if (!messages || !Array.isArray(messages)) {
      logError(`400 Error: Invalid messages format - ${JSON.stringify({ messages })}`);
      return {
        kind: "response",
        responseType: "text",
        response: { status: 400, body: "Invalid messages format" },
      };
    }

    if (model !== null && !SUPPORTED_AI_MODELS.includes(model as SupportedModel)) {
      logError(`400 Error: Unsupported model - ${model}`);
      return {
        kind: "response",
        responseType: "text",
        response: { status: 400, body: `Unsupported model: ${model}` },
      };
    }

    const systemState: SystemState | undefined = incomingSystemState
      ? { ...incomingSystemState, requestGeo: input.requestGeo }
      : ({ requestGeo: input.requestGeo } as SystemState);

    const selectedModel = getModelInstance(model as SupportedModel);
    const { prompts: staticPrompts, loadedSections } = buildContextAwarePrompts();
    const staticSystemPrompt = staticPrompts.join("\n");

    log(`Context-aware prompts (${loadedSections.length} sections): ${loadedSections.join(", ")}`);
    const approxTokens = staticSystemPrompt.length / 4;
    log(`Approximate prompt tokens: ${Math.round(approxTokens)}`);

    let userMemories: MemoryIndex | null = null;
    let dailyNotesText: string | null = null;
    if (username && validationResult.valid) {
      try {
        const [memories, notes] = await Promise.all([
          getMemoryIndex(input.redis, username),
          getDailyNotesForPrompt(input.redis, username),
        ]);
        userMemories = memories;
        dailyNotesText = notes;
        if (userMemories) {
          log(`Loaded ${userMemories.memories.length} long-term memories for user ${username}`);
        }
        if (dailyNotesText) {
          log(`Loaded daily notes for user ${username}`);
        }
      } catch (memErr) {
        logError("Error fetching user memories/notes:", memErr);
      }
    }

    if (isProactiveGreeting && username && validationResult.valid) {
      log("Proactive greeting requested");
      const proactiveResult = await executeChatProactiveGreetingCore({
        redis: input.redis,
        username,
        isAuthenticated: validationResult.valid,
        userMemories,
        dailyNotesText,
        log,
        logError,
      });
      return {
        kind: "response",
        response: proactiveResult,
      };
    }

    const staticSystemMessage = {
      role: "system" as const,
      content: staticSystemPrompt,
      ...CACHE_CONTROL_OPTIONS,
    };

    const dynamicSystemMessage = {
      role: "system" as const,
      content: generateDynamicSystemPrompt(systemState, userMemories, dailyNotesText),
    };

    const tools = createChatTools({
      log: (...args: unknown[]) => log(...args),
      logError: (...args: unknown[]) => logError(...args),
      env: {
        YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
        YOUTUBE_API_KEY_2: process.env.YOUTUBE_API_KEY_2,
      },
      username: validationResult.valid ? username : null,
      redis: validationResult.valid ? input.redis : undefined,
    });

    const uiMessages = ensureUIMessageFormat(messages as SimpleMessage[]);
    const modelMessages = await convertToModelMessages(uiMessages, { tools });
    const enrichedMessages = [staticSystemMessage, dynamicSystemMessage, ...modelMessages];

    enrichedMessages.forEach((msg, index) => {
      const contentStr =
        typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      log(`Message ${index} [${msg.role}]: ${contentStr.substring(0, 100)}...`);
    });

    const stream = streamText({
      model: selectedModel,
      messages: enrichedMessages,
      tools,
      temperature: 0.7,
      maxOutputTokens: 48000,
      stopWhen: stepCountIs(10),
      experimental_transform: smoothStream({
        chunking: /[\u4E00-\u9FFF]|\S+\s+/,
      }),
      headers: {
        ...(model.startsWith("claude")
          ? { "anthropic-beta": "fine-grained-tool-streaming-2025-05-14" }
          : {}),
      },
      providerOptions: {
        openai: {
          reasoningEffort: "none",
        },
      },
    });

    return { kind: "stream", stream };
  } catch (error) {
    input.logger.error("Chat API error", error);
    if (error instanceof SyntaxError) {
      input.logger.error("Invalid JSON", error.message);
      return {
        kind: "response",
        response: {
          status: 400,
          body: { error: "Bad Request", message: `Invalid JSON - ${error.message}` },
        },
      };
    }
    return {
      kind: "response",
      response: {
        status: 500,
        body: { error: "Internal Server Error" },
      },
    };
  }
}
