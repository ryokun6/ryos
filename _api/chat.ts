import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  streamText,
  smoothStream,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from "ai";
import { geolocation } from "@vercel/functions";
import {
  SupportedModel,
  DEFAULT_MODEL,
  getModelInstance,
} from "./_utils/_aiModels.js";
import {
  CORE_PRIORITY_INSTRUCTIONS,
  RYO_PERSONA_INSTRUCTIONS,
  ANSWER_STYLE_INSTRUCTIONS,
  CODE_GENERATION_INSTRUCTIONS,
  CHAT_INSTRUCTIONS,
  TOOL_USAGE_INSTRUCTIONS,
  MEMORY_INSTRUCTIONS,
} from "./_utils/_aiPrompts.js";
import { getMemoryIndex, type MemoryIndex } from "./_utils/_memory.js";
import { SUPPORTED_AI_MODELS } from "./_utils/_aiModels.js";
import { checkAndIncrementAIMessageCount } from "./_utils/_rate-limit.js";
import { validateAuth } from "./_utils/auth/index.js";
import { Redis } from "@upstash/redis";
import { initLogger } from "./_utils/_logging.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "./_utils/_cors.js";
import { createChatTools } from "./chat/tools/index.js";

// Helper to ensure messages are in UIMessage format for AI SDK v6
// Handles both simple { role, content } format and UIMessage format with parts
type SimpleMessage = { id?: string; role: string; content?: string; parts?: Array<{ type: string; text?: string }> };
const ensureUIMessageFormat = (messages: SimpleMessage[]): UIMessage[] => {
  return messages.map((msg, index) => {
    // If message already has parts, it's in UIMessage format
    if (msg.parts && Array.isArray(msg.parts)) {
      return {
        id: msg.id || `msg-${index}`,
        role: msg.role as UIMessage['role'],
        parts: msg.parts,
      } as UIMessage;
    }
    // Convert simple { role, content } format to UIMessage format
    return {
      id: msg.id || `msg-${index}`,
      role: msg.role as UIMessage['role'],
      parts: [{ type: 'text', text: msg.content || '' }],
    } as UIMessage;
  });
};

// Update SystemState type to match new store structure (optimized for token efficiency)
interface SystemState {
  username?: string | null;
  /** User's operating system (e.g., "iOS", "Android", "macOS", "Windows", "Linux") */
  userOS?: string;
  /** User's system locale (e.g., "en", "zh-TW", "ja", "ko", "fr", "de", "es", "pt", "it", "ru") */
  locale?: string;
  internetExplorer?: {
    url: string;
    year: string;
    currentPageTitle: string | null;
    /** Markdown form of the AI generated HTML (more token-efficient than raw HTML) */
    aiGeneratedMarkdown?: string | null;
  };
  video?: {
    currentVideo: {
      id: string;
      title: string;
      artist?: string;
    } | null;
    isPlaying: boolean;
  };
  ipod?: {
    currentTrack: {
      id: string;
      title: string;
      artist?: string;
    } | null;
    isPlaying: boolean;
    currentLyrics?: {
      lines: Array<{
        startTimeMs: string;
        words: string;
      }>;
    } | null;
  };
  karaoke?: {
    currentTrack: {
      id: string;
      title: string;
      artist?: string;
    } | null;
    isPlaying: boolean;
  };
  textEdit?: {
    instances: Array<{
      instanceId: string;
      filePath: string | null;
      title: string;
      contentMarkdown?: string | null;
      hasUnsavedChanges: boolean;
    }>;
  };
  /** Local time information reported by the user's browser */
  userLocalTime?: {
    timeString: string;
    dateString: string;
    timeZone: string;
  };
  /** Geolocation info inferred from the incoming request (provided by Vercel). */
  requestGeo?: {
    city?: string;
    region?: string;
    country?: string;
    latitude?: string;
    longitude?: string;
  };
  runningApps?: {
    foreground: {
      instanceId: string;
      appId: string;
      title?: string;
      appletPath?: string;
      appletId?: string;
    } | null;
    background: Array<{
      instanceId: string;
      appId: string;
      title?: string;
      appletPath?: string;
      appletId?: string;
    }>;
  };
  chatRoomContext?: {
    roomId: string;
    recentMessages: string;
    mentionedMessage: string;
  };
}


// Node.js runtime configuration
export const runtime = "nodejs";
export const maxDuration = 80;

// Helper functions for Node.js runtime
function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

// Helper to get header value from Node.js IncomingMessage headers
function getHeader(req: VercelRequest, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return typeof value === "string" ? value : null;
}

// Unified static prompt with all instructions
const STATIC_SYSTEM_PROMPT = [
  CORE_PRIORITY_INSTRUCTIONS,
  ANSWER_STYLE_INSTRUCTIONS,
  RYO_PERSONA_INSTRUCTIONS,
  CHAT_INSTRUCTIONS,
  TOOL_USAGE_INSTRUCTIONS,
  MEMORY_INSTRUCTIONS,
  CODE_GENERATION_INSTRUCTIONS,
].join("\n");

const CACHE_CONTROL_OPTIONS = {
  providerOptions: {
    anthropic: { cacheControl: { type: "ephemeral" } },
  },
} as const;

const generateDynamicSystemPrompt = (systemState?: SystemState, userMemories?: MemoryIndex | null) => {
  const now = new Date();
  const timeString = now.toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const dateString = now.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const ryoTimeZone = "America/Los_Angeles";

  if (!systemState) return "";

  let prompt = `<system_state>
## USER CONTEXT
Current User: ${systemState.username || "you"}

## TIME & LOCATION
Ryo Time: ${timeString} on ${dateString} (${ryoTimeZone})`;

  if (systemState.userLocalTime) {
    prompt += `
User Time: ${systemState.userLocalTime.timeString} on ${systemState.userLocalTime.dateString} (${systemState.userLocalTime.timeZone})`;
  }

  if (systemState.userOS) {
    prompt += `
User OS: ${systemState.userOS}`;
  }

  if (systemState.locale) {
    prompt += `
User Locale: ${systemState.locale}`;
  }

  if (systemState.requestGeo) {
    const location = [
      systemState.requestGeo.city,
      systemState.requestGeo.country,
    ]
      .filter(Boolean)
      .join(", ");
    prompt += `
User Location: ${location} (inferred from IP, may be inaccurate)`;
  }

  // User Memory Section (Layer 1 - summaries always visible)
  if (userMemories && userMemories.memories.length > 0) {
    prompt += `\n\n## USER MEMORY`;
    prompt += `\nYou have ${userMemories.memories.length} memories about this user:`;
    for (const mem of userMemories.memories) {
      prompt += `\n- ${mem.key}: ${mem.summary}`;
    }
    prompt += `\nUse memoryRead("key") to get full details for any memory.`;
  }

  // Applications Section
  prompt += `\n\n## RUNNING APPLICATIONS`;

  // Helper to format app instance info
  const formatAppInstance = (inst: { appId: string; title?: string; appletPath?: string; appletId?: string }) => {
    let info = inst.appId;
    if (inst.title) info += ` (${inst.title})`;
    // For applet-viewer, include applet path and/or ID
    if (inst.appId === "applet-viewer") {
      if (inst.appletPath) info += ` [path: ${inst.appletPath}]`;
      if (inst.appletId) info += ` [appletId: ${inst.appletId}]`;
    }
    return info;
  };

  if (systemState.runningApps?.foreground) {
    prompt += `
Foreground: ${formatAppInstance(systemState.runningApps.foreground)}`;
  } else {
    prompt += `
Foreground: None`;
  }

  if (
    systemState.runningApps?.background &&
    systemState.runningApps.background.length > 0
  ) {
    const backgroundApps = systemState.runningApps.background
      .map((inst) => formatAppInstance(inst))
      .join(", ");
    prompt += `
Background: ${backgroundApps}`;
  } else {
    prompt += `
Background: None`;
  }

  // Media Section
  let hasMedia = false;

  if (systemState.video?.currentVideo && systemState.video.isPlaying) {
    if (!hasMedia) {
      prompt += `\n\n## MEDIA PLAYBACK`;
      hasMedia = true;
    }
    const videoArtist = systemState.video.currentVideo.artist
      ? ` by ${systemState.video.currentVideo.artist}`
      : "";
    prompt += `
Video: ${systemState.video.currentVideo.title}${videoArtist} (Playing)`;
  }

  // Check if iPod app is open
  const hasOpenIpod =
    systemState.runningApps?.foreground?.appId === "ipod" ||
    systemState.runningApps?.background?.some((app) => app.appId === "ipod");

  if (hasOpenIpod && systemState.ipod?.currentTrack) {
    if (!hasMedia) {
      prompt += `\n\n## MEDIA PLAYBACK`;
      hasMedia = true;
    }
    const playingStatus = systemState.ipod.isPlaying ? "Playing" : "Paused";
    const trackArtist = systemState.ipod.currentTrack.artist
      ? ` by ${systemState.ipod.currentTrack.artist}`
      : "";
    prompt += `
iPod: ${systemState.ipod.currentTrack.title}${trackArtist} (${playingStatus})`;

    if (systemState.ipod.currentLyrics?.lines) {
      const lyricsText = systemState.ipod.currentLyrics.lines.map((line) => line.words).join("\n");
      prompt += `
Lyrics:
${lyricsText}`;
    }
  }

  // Check if Karaoke app is open
  const hasOpenKaraoke =
    systemState.runningApps?.foreground?.appId === "karaoke" ||
    systemState.runningApps?.background?.some((app) => app.appId === "karaoke");

  if (hasOpenKaraoke && systemState.karaoke?.currentTrack) {
    if (!hasMedia) {
      prompt += `\n\n## MEDIA PLAYBACK`;
      hasMedia = true;
    }
    const karaokePlayingStatus = systemState.karaoke.isPlaying ? "Playing" : "Paused";
    const karaokeTrackArtist = systemState.karaoke.currentTrack.artist
      ? ` by ${systemState.karaoke.currentTrack.artist}`
      : "";
    prompt += `
Karaoke: ${systemState.karaoke.currentTrack.title}${karaokeTrackArtist} (${karaokePlayingStatus})`;

    // Karaoke shares lyrics storage with iPod - include lyrics if available and iPod section didn't already show them
    if (!hasOpenIpod && systemState.ipod?.currentLyrics?.lines) {
      const lyricsText = systemState.ipod.currentLyrics.lines.map((line) => line.words).join("\n");
      prompt += `
Lyrics:
${lyricsText}`;
    }
  }

  // Browser Section
  const hasOpenInternetExplorer =
    systemState.runningApps?.foreground?.appId === "internet-explorer" ||
    systemState.runningApps?.background?.some(
      (app) => app.appId === "internet-explorer"
    );

  if (hasOpenInternetExplorer && systemState.internetExplorer?.url) {
    prompt += `\n\n## INTERNET EXPLORER
URL: ${systemState.internetExplorer.url}
Time Travel Year: ${systemState.internetExplorer.year}`;

    if (systemState.internetExplorer.currentPageTitle) {
      prompt += `
Page Title: ${systemState.internetExplorer.currentPageTitle}`;
    }

    const htmlMd = systemState.internetExplorer.aiGeneratedMarkdown;
    if (htmlMd) {
      prompt += `
Page Content (Markdown):
${htmlMd}`;
    }
  }

  // TextEdit Section
  if (
    systemState.textEdit?.instances &&
    systemState.textEdit.instances.length > 0
  ) {
    prompt += `\n\n## TEXTEDIT DOCUMENTS (${systemState.textEdit.instances.length} open)`;

    systemState.textEdit.instances.forEach((instance, index) => {
      const unsavedMark = instance.hasUnsavedChanges ? " *" : "";
      const pathInfo = instance.filePath ? ` [${instance.filePath}]` : "";
      prompt += `
${index + 1}. ${instance.title}${unsavedMark}${pathInfo} (instanceId: ${instance.instanceId})`;

      if (instance.contentMarkdown) {
        // Limit content preview to avoid overly long prompts
        const preview =
          instance.contentMarkdown.length > 500
            ? instance.contentMarkdown.substring(0, 500) + "..."
            : instance.contentMarkdown;
        prompt += `
   Content:
   ${preview}`;
      }
    });
  }

  prompt += `\n</system_state>`;

  if (systemState.chatRoomContext) {
    prompt += `\n\n<chat_room_reply_instructions>
## CHAT ROOM CONTEXT
Room ID: ${systemState.chatRoomContext.roomId}
Your Role: Respond as 'ryo' in this IRC-style chat room
Response Style: Use extremely concise responses

Recent Conversation:
${systemState.chatRoomContext.recentMessages}

Mentioned Message: "${systemState.chatRoomContext.mentionedMessage}"
</chat_room_reply_instructions>`;
  }

  return prompt;
};

// Simplified prompt builder that always includes every instruction
const buildContextAwarePrompts = () => {
  const prompts = [STATIC_SYSTEM_PROMPT];
  const loadedSections = ["STATIC_SYSTEM_PROMPT"];
  return { prompts, loadedSections };
};


export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { requestId: _requestId, logger } = initLogger();
  const startTime = Date.now();
  
  // Check origin before processing request
  const effectiveOrigin = getEffectiveOrigin(req);
  
  logger.request(req.method || "POST", req.url || "/api/chat", "chat");
  
  if (!isAllowedOrigin(effectiveOrigin)) {
    logger.warn("Unauthorized origin", { origin: effectiveOrigin });
    logger.response(403, Date.now() - startTime);
    res.status(403).send("Unauthorized");
    return;
  }

  // At this point origin is guaranteed to be a valid string
  const validOrigin = effectiveOrigin as string;

  if (req.method === "OPTIONS") {
    logger.response(204, Date.now() - startTime);
    setCorsHeaders(res, validOrigin, { methods: ["POST", "OPTIONS"] });
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    logger.response(405, Date.now() - startTime);
    res.status(405).send("Method not allowed");
    return;
  }

  // Create Redis client for auth validation
  const redis = createRedis();

  try {
    // Parse query string to get model parameter
    // Handle both full URLs and relative paths (vercel dev uses relative paths)
    const url = new URL(req.url || "/", "http://localhost");
    const queryModel = url.searchParams.get("model") as SupportedModel | null;

    const {
      messages,
      systemState: incomingSystemState, // still passed for dynamic prompt generation but NOT for auth
      model: bodyModel = DEFAULT_MODEL,
    } = req.body as {
      messages: unknown[];
      systemState?: SystemState;
      model?: string;
    };

    // Use query parameter if available, otherwise use body parameter, otherwise use default
    const model = queryModel || bodyModel || DEFAULT_MODEL;

    // ---------------------------
    // Extract auth headers FIRST so we can use username for logging
    // ---------------------------

    const authHeaderInitial = getHeader(req, "authorization");
    const headerAuthTokenInitial =
      authHeaderInitial && authHeaderInitial.startsWith("Bearer ")
        ? authHeaderInitial.substring(7)
        : null;
    const headerUsernameInitial = getHeader(req, "x-username");

    // Helper: prefix log lines with username (for easier tracing)
    const usernameForLogs = headerUsernameInitial ?? "unknown";
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

    // ---------------------------
    // Authentication extraction
    // ---------------------------
    // Prefer credentials in the incoming system state (back-compat),
    // but fall back to HTTP headers for multi-token support (Authorization & X-Username)

    const headerAuthToken = headerAuthTokenInitial ?? undefined;
    const headerUsername = headerUsernameInitial;

    const username = headerUsername || null;
    const authToken: string | undefined = headerAuthToken;

    // ---------------------------
    // Rate-limit & auth checks
    // ---------------------------
    // Validate authentication (all users, including "ryo", must present a valid token)
    // Enable grace period for expired tokens (client is responsible for token refresh)
    const validationResult = await validateAuth(redis, username, authToken, {
      allowExpired: true,
      refreshOnGrace: false,
    });

    // If a username was provided but the token is missing/invalid, reject the request early
    if (username && !validationResult.valid) {
      console.log(
        `[User: ${username}] Authentication failed – invalid or missing token`
      );
      res.setHeader("Access-Control-Allow-Origin", validOrigin);
      res.status(401).json({
        error: "authentication_failed",
        message: "Invalid or missing authentication token",
      });
      return;
    }

    // Use validated auth status for rate limiting
    const isAuthenticated = validationResult.valid;
    const identifier =
      isAuthenticated && username ? username.toLowerCase() : `anon:${ip}`;

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

        res.setHeader("Access-Control-Allow-Origin", validOrigin);
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

    if (!messages || !Array.isArray(messages)) {
      logError(
        `400 Error: Invalid messages format - ${JSON.stringify({ messages })}`
      );
      res.setHeader("Access-Control-Allow-Origin", validOrigin);
      res.status(400).send("Invalid messages format");
      return;
    }

    // Additional validation for model
    if (model !== null && !SUPPORTED_AI_MODELS.includes(model as SupportedModel)) {
      logError(`400 Error: Unsupported model - ${model}`);
      res.setHeader("Access-Control-Allow-Origin", validOrigin);
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

    const selectedModel = getModelInstance(model as SupportedModel);

    // Build unified static prompts
    const { prompts: staticPrompts, loadedSections } =
      buildContextAwarePrompts();
    const staticSystemPrompt = staticPrompts.join("\n");

    // Log prompt optimization metrics with loaded sections
    log(
      `Context-aware prompts (${
        loadedSections.length
      } sections): ${loadedSections.join(", ")}`
    );
    const approxTokens = staticSystemPrompt.length / 4; // rough estimate
    log(`Approximate prompt tokens: ${Math.round(approxTokens)}`);

    // Fetch user memories for authenticated users
    let userMemories: MemoryIndex | null = null;
    if (username && validationResult.valid) {
      try {
        userMemories = await getMemoryIndex(redis, username);
        if (userMemories) {
          log(`Loaded ${userMemories.memories.length} memories for user ${username}`);
        }
      } catch (memErr) {
        logError("Error fetching user memories:", memErr);
        // Continue without memories - not a fatal error
      }
    }

    // -------------------------------------------------------------
    // System messages – first the LARGE static prompt (cached),
    // then the smaller dynamic prompt (not cached)
    // -------------------------------------------------------------

    // 1) Static system instructions – mark as cacheable so Anthropic
    // can reuse this costly prefix across calls (min-1024-token rule)
    const staticSystemMessage = {
      role: "system" as const,
      content: staticSystemPrompt,
      ...CACHE_CONTROL_OPTIONS, // { providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } }
    };

    // 2) Dynamic, user-specific system state (don't cache)
    const dynamicSystemMessage = {
      role: "system" as const,
      content: generateDynamicSystemPrompt(systemState, userMemories),
    };

    // Create tools with server-side context for logging and API access
    // This follows the Vercel AI SDK's tool loop agent pattern:
    // - Server-side tools have `execute` functions
    // - Client-side tools are handled via `onToolCall` on the frontend
    // - Tools with `toModelOutput` can convert results to multimodal content
    const tools = createChatTools({
      log: (...args: unknown[]) => log(...args),
      logError: (...args: unknown[]) => logError(...args),
      env: {
        YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
        YOUTUBE_API_KEY_2: process.env.YOUTUBE_API_KEY_2,
      },
      // Memory tool context - only available for authenticated users
      username: validationResult.valid ? username : null,
      redis: validationResult.valid ? redis : undefined,
    });

    // Convert UIMessages to ModelMessages for the AI model
    // Ensure messages are in UIMessage format (handles both simple and parts-based formats)
    // Pass tools so toModelOutput can convert tool results to multimodal content
    const uiMessages = ensureUIMessageFormat(messages as SimpleMessage[]);
    const modelMessages = await convertToModelMessages(uiMessages, { tools });

    // Merge all messages: static sys → dynamic sys → user/assistant turns
    const enrichedMessages = [
      staticSystemMessage,
      dynamicSystemMessage,
      ...modelMessages,
    ];

    // Log all messages right before model call (as per user preference)
    enrichedMessages.forEach((msg, index) => {
      const contentStr =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      log(`Message ${index} [${msg.role}]: ${contentStr.substring(0, 100)}...`);
    });

    const result = streamText({
      model: selectedModel,
      messages: enrichedMessages,
      tools,
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
