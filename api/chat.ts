import type { VercelRequest } from "@vercel/node";
import {
  streamText,
  generateText,
  smoothStream,
  stepCountIs,
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
  type RyoConversationSystemState,
  type SimpleConversationMessage,
} from "./_utils/ryo-conversation.js";
import { checkAndIncrementAIMessageCount } from "./_utils/_rate-limit.js";
import { apiHandler } from "./_utils/api-handler.js";
type SystemState = RyoConversationSystemState;


// Node.js runtime configuration
export const runtime = "nodejs";
export const maxDuration = 80;

// Helper to get header value from Node.js IncomingMessage headers
function getHeader(req: VercelRequest, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return typeof value === "string" ? value : null;
}


export default apiHandler<{
  messages: unknown[];
  systemState?: SystemState;
  model?: string;
  proactiveGreeting?: boolean;
}>(
  {
    methods: ["POST"],
    auth: "optional",
    allowExpiredAuth: true,
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
    } = req.body as {
      messages: unknown[];
      systemState?: SystemState;
      model?: string;
      proactiveGreeting?: boolean;
    };

    // Use query parameter if available, otherwise use body parameter, otherwise use default
    const model = queryModel || bodyModel || DEFAULT_MODEL;

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

    // Get IP address for rate limiting anonymous users
    // For Vercel deployments, use x-vercel-forwarded-for (won't be overwritten by proxies)
    // For localhost/local dev, use a fixed identifier
    const isLocalDev = validOrigin?.startsWith("http://localhost") || validOrigin?.startsWith("http://127.0.0.1") || validOrigin?.includes("100.110.251.60");
    let ip: string;

    if (isLocalDev) {
      // For local development, use a fixed identifier
      ip = "localhost-dev";
    } else {
      // For Vercel deployments, prefer x-vercel-forwarded-for which is more reliable
      ip =
        getHeader(req, "x-vercel-forwarded-for") ||
        getHeader(req, "x-forwarded-for")?.split(",")[0].trim() ||
        getHeader(req, "x-real-ip") ||
        "unknown-ip";
    }

    log(`Request origin: ${validOrigin}, IP: ${ip}`);

    const username = user?.username ?? null;
    const authToken: string | undefined = user?.token;
    const isAuthenticated = !!user;
    const identifier = isAuthenticated && username ? username : `anon:${ip}`;

    // Only check rate limits for user messages (not system messages)
    const userMessages = (messages as Array<{ role: string }>).filter(
      (m) => m.role === "user"
    );
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

    // Additional validation for model
    if (model !== null && !SUPPORTED_AI_MODELS.includes(model as SupportedModel)) {
      logError(`400 Error: Unsupported model - ${model}`);
      res.status(400).send(`Unsupported model: ${model}`);
      return;
    }

    // --- Geolocation (available only on deployed environment) ---
    // geolocation() requires Web Request headers, which aren't available in vercel dev
    let geo: ReturnType<typeof geolocation> = {};
    try {
      // Only works with Web Request in production, fails in vercel dev with VercelRequest
      geo = geolocation(req as unknown as Request);
    } catch {
      // In local dev, geolocation isn't available - use empty object
      geo = {};
    }

    // Attach geolocation info to system state that will be sent to the prompt
    const systemState: SystemState | undefined = incomingSystemState
      ? { ...incomingSystemState, requestGeo: geo }
      : ({ requestGeo: geo } as SystemState);
    const userTimeZone = systemState?.userLocalTime?.timeZone;
    const loadedMemoryContext = await loadRyoMemoryContext({
      redis: isAuthenticated ? redis : undefined,
      username: isAuthenticated ? username : null,
      timeZone: userTimeZone,
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
        getUnprocessedDailyNotesExcludingToday(redis, username, 7, userTimeZone).then(async (unprocessedNotes) => {
          if (unprocessedNotes.length > 0) {
            log(`[DailyNotes] Found ${unprocessedNotes.length} unprocessed past daily notes for ${username}, triggering background processing`);
            const { processDailyNotesForUser } = await import("./ai/process-daily-notes.js");
            processDailyNotesForUser(redis, username, log, logError, userTimeZone).catch((err: unknown) => {
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

      // Time context
      const now = new Date();
      const sfTime = now.toLocaleTimeString("en-US", {
        timeZone: "America/Los_Angeles",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      const dayOfWeek = now.toLocaleDateString("en-US", {
        timeZone: "America/Los_Angeles",
        weekday: "long",
      });

      try {
        const { text, finishReason } = await generateText({
          model: google("gemini-2.5-flash"),
          temperature: 1,
          maxOutputTokens: 2000,
          system: `You are Ryo, a friendly AI assistant. You're greeting a returning user at the start of a new chat.

Your style:
- Lowercase, casual, warm
- Short (1-2 sentences max, under 30 words)
- No emojis unless natural
- Sound like a close friend checking in, not a corporate assistant
- Don't be cheesy or over-enthusiastic
- Be specific — reference something from their memories or recent activity
- Mix it up: sometimes ask a question, sometimes share an observation, sometimes reference a shared interest

It's ${dayOfWeek} ${sfTime}. The user's name is "${username}".

${greetingMemoryContext}

Generate ONE short proactive greeting. Pick one interesting angle from the context — a recent topic, a memory, something timely — and use it naturally. Don't try to cover everything.

Examples of good greetings:
- "hey, how's the cursor roadmap coming along?"
- "morning — did you ever try that restaurant you mentioned?"
- "back again. still working on that project?"
- "hey ryo. happy friday — any plans?"

Do NOT start with generic greetings like "hey! i'm ryo" or "welcome back". Jump straight into something specific and interesting. Output ONLY the greeting text, nothing else.`,
          prompt: "Generate a proactive greeting.",
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

    const {
      selectedModel,
      tools,
      enrichedMessages,
      loadedSections,
      staticSystemPrompt,
    } = await prepareRyoConversationModelInput({
      channel: "chat",
      messages: messages as SimpleConversationMessage[],
      systemState,
      username: isAuthenticated ? username : null,
      model: model as SupportedModel,
      redis: isAuthenticated ? redis : undefined,
      log,
      logError,
      preloadedMemoryContext: loadedMemoryContext,
    });

    log(
      `Context-aware prompts (${
        loadedSections.length
      } sections): ${loadedSections.join(", ")}`
    );
    const approxTokens = staticSystemPrompt.length / 4;
    log(`Approximate prompt tokens: ${Math.round(approxTokens)}`);

    // Log all messages right before model call (as per user preference)
    enrichedMessages.forEach((msg, index) => {
      const contentStr =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      log(`Message ${index} [${msg.role}]: ${contentStr.substring(0, 100)}...`);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = streamText({
      model: selectedModel,
      messages: enrichedMessages as any,
      tools: tools as any,
      temperature: 0.7,
      maxOutputTokens: 48000, // Increased from 6000 to prevent code generation cutoff
      stopWhen: stepCountIs(10), // Allow up to 10 steps for multi-tool workflows (agent loop)
      experimental_transform: smoothStream({
        chunking: /[\u4E00-\u9FFF]|\S+\s+/,
      }),
      headers: {
        // Enable fine-grained tool streaming for Anthropic models
        ...(model.startsWith("claude")
          ? { "anthropic-beta": "fine-grained-tool-streaming-2025-05-14" }
          : {}),
      },
      providerOptions: {
        openai: {
          reasoningEffort: "none", // Turn off reasoning for GPT-5 and other reasoning models
        },
      },
    });

    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", validOrigin);
    
    // Use pipeUIMessageStreamToResponse for Node.js streaming
    result.pipeUIMessageStreamToResponse(res, {
      status: 200,
    });
  } catch (error) {
    logger.error("Chat API error", error);

    // Set CORS headers
    if (validOrigin) {
      res.setHeader("Access-Control-Allow-Origin", validOrigin);
    }
    res.setHeader("Content-Type", "application/json");

    // Check if error is a SyntaxError (likely from parsing JSON)
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
